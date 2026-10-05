import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir } from '@/lib/storage';
import { processCadFilePipeline } from '@/lib/cad-pipeline';
import { getLearnedPricePool } from '@/lib/self-learning';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const companyId = (formData.get('companyId') as string) || 'comp_unassigned';
    const customCaseName = (formData.get('caseName') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'CAD 도면 파일이 전달되지 않았습니다.' }, { status: 400 });
    }

    const originalName = file.name;
    const ext = path.extname(originalName).toLowerCase();
    if (!['.dwg', '.dxf'].includes(ext)) {
      return NextResponse.json({ error: 'CAD 도면(.dwg 또는 .dxf) 파일만 지원합니다.' }, { status: 400 });
    }

    const fileType = ext === '.dwg' ? 'DWG' : 'DXF';
    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic Header check for DWG
    if (fileType === 'DWG') {
      const magic = buffer.subarray(0, 6).toString('ascii');
      if (!magic.startsWith('AC10') && !['MC0.0', 'AC1.2', 'AC1.4'].includes(magic)) {
        return NextResponse.json({ error: '유효한 DWG 파일이 아닙니다.' }, { status: 400 });
      }
    }

    // 1. Create Quotation Case
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const countRow = (await db.prepare(`
      SELECT COUNT(*) as cnt FROM quotation_cases WHERE case_no LIKE ?
    `).get(`QT-${dateStr}-%`)) as { cnt: number };

    const seq = String((countRow?.cnt || 0) + 1).padStart(3, '0');
    const caseNo = `QT-${dateStr}-${seq}`;
    const caseId = `case_${Date.now()}`;
    const cleanFileName = originalName.replace(/\.[^/.]+$/, '');
    const caseName = customCaseName || `[${cleanFileName}] AI 즉시 견적`;

    let companyName = '고객사 미지정';
    if (companyId && companyId !== 'comp_unassigned') {
      const comp = (await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(companyId)) as any;
      if (comp) companyName = comp.company_name;
    }

    await db.prepare(`
      INSERT INTO quotation_cases (
        id, case_no, company_id, project_id, case_name, request_date,
        status, revision, quote_readiness, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId, caseNo, companyId, 'proj_unassigned', caseName,
      now.toISOString().slice(0, 10),
      'ANALYZING', 'A', 'NOT_READY', session.userId,
      now.toISOString(), now.toISOString()
    );

    // 2. Save File & Insert uploaded_files (실제 스키마 컬럼명: file_size, checksum, stored_file_name)
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageDir = getStorageSubdir('files');
    const fileId = `file_${Date.now()}`;
    const savedFileName = `${fileId}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = path.join(storageDir, savedFileName);
    fs.writeFileSync(storagePath, buffer);

    await db.prepare(`
      INSERT INTO uploaded_files (
        id, quotation_case_id, original_file_name, stored_file_name, storage_path,
        file_size, checksum, file_type, file_role, upload_status, uploaded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileId, caseId, originalName, savedFileName, storagePath,
      buffer.length, checksum, fileType, 'SOURCE', 'UPLOADED', session.userId, now.toISOString()
    );

    // 3. Run CAD AI Extraction Pipeline
    console.log(`[quick-estimate] Running CAD pipeline for ${caseId} (file: ${originalName})...`);
    try {
      const pipelineRes = await processCadFilePipeline(caseId, fileId, session.userId);
      console.log(`[quick-estimate] CAD pipeline result for ${caseId}:`, pipelineRes);
    } catch (pipelineErr: any) {
      console.warn(`[quick-estimate] Pipeline warning: ${pipelineErr.message}`);
    }

    // 4. Retrieve Extracted Drawings & BOM
    const drawings = (await db.prepare(`
      SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC
    `).all(caseId)) as any[];

    const flatBom = (await db.prepare(`
      SELECT * FROM flattened_bom_items WHERE quotation_case_id = ?
    `).all(caseId)) as any[];

    // 5. Intelligent Auto-Pricing via Self-Learning Pool & Standard Rates
    const pricePool = await getLearnedPricePool(companyId);
    const learnedMap = new Map<string, number>();
    for (const p of pricePool) {
      const key = (p.item_name || '').toUpperCase().replace(/\s+/g, '');
      if (key && !learnedMap.has(key) && p.unit_price > 0) {
        learnedMap.set(key, p.unit_price);
      }
    }

    // Material standard default heuristic prices (원/EA)
    const getMaterialBasePrice = (mat: string): number => {
      const m = (mat || '').toUpperCase();
      if (m.includes('SUS') || m.includes('STS') || m.includes('STAINLESS')) return 48000;
      if (m.includes('AL') || m.includes('ALUMINUM') || m.includes('6061')) return 38000;
      if (m.includes('S45C') || m.includes('SC45') || m.includes('SKD')) return 32000;
      if (m.includes('MC') || m.includes('ACETAL') || m.includes('POM')) return 28000;
      if (m.includes('COPPER') || m.includes('BRASS') || m.includes('황동')) return 52000;
      return 25000; // SS400 or default steel
    };

    let matchedCount = 0;
    const quoteItems: any[] = [];
    let itemNo = 1;

    // Use drawings or flattenedBom to create items
    let sourceItems = drawings.filter(d => d.drawing_type !== 'MAIN_ASSEMBLY' && !d.drawing_name_raw?.includes('조립'));
    if (sourceItems.length === 0 && drawings.length > 0) {
      sourceItems = drawings;
    }
    if (sourceItems.length === 0 && flatBom.length > 0) {
      sourceItems = flatBom;
    }

    for (const item of sourceItems) {
      const rawName = item.drawing_name_raw || item.drawing_name_normalized || item.name || item.part_name || `부품-${itemNo}`;
      const drawingNo = item.drawing_no_raw || item.drawing_no_normalized || item.part_no || `DWG-${String(itemNo).padStart(3, '0')}`;
      const mat = item.material || 'SS400';
      const qty = Number(item.quantity || item.total_quantity) || 1;

      const normName = rawName.toUpperCase().replace(/\s+/g, '');
      let unitPrice = 0;
      let isLearned = false;

      if (learnedMap.has(normName)) {
        unitPrice = learnedMap.get(normName)!;
        isLearned = true;
        matchedCount++;
      } else {
        unitPrice = getMaterialBasePrice(mat);
      }

      const lineTotal = unitPrice * qty;
      quoteItems.push({
        id: `qi_${caseId}_${itemNo}`,
        item_no: itemNo,
        drawing_no: drawingNo,
        item_name: rawName,
        part_name: rawName, // UI 호환
        specification: item.scale || item.specification || '-',
        material: mat,
        quantity: qty,
        unit: 'EA',
        unit_price: unitPrice,
        amount: lineTotal,
        is_included: 1,
        remark: isLearned ? '사내 실적 단가 자동 매칭' : 'AI 추정 기본 단가 적용'
      });
      itemNo++;
    }

    // Fallback if no parts detected (Single primary drawing quote)
    if (quoteItems.length === 0) {
      quoteItems.push({
        id: `qi_${caseId}_1`,
        item_no: 1,
        drawing_no: cleanFileName,
        item_name: cleanFileName,
        part_name: cleanFileName,
        specification: '-',
        material: 'SS400',
        quantity: 1,
        unit: 'EA',
        unit_price: 35000,
        amount: 35000,
        is_included: 1,
        remark: 'AI 표준 임가공 단가 적용'
      });
    }

    const subtotal = quoteItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    const totalAmount = subtotal;
    const taxRate = 0.1;
    const taxAmount = Math.round(subtotal * taxRate);
    const grandTotal = subtotal + taxAmount;
    const matchedRate = Math.min(100, Math.round(((matchedCount || 1) / quoteItems.length) * 100));

    // 6. Create Quote Record (quotes 스키마의 NOT NULL 제약조건 완벽 준수)
    // CAD 파이프라인에서 표제란 분석으로 도출된 고객사(company_id) 동기화
    const updatedCase = (await db.prepare('SELECT company_id, project_id FROM quotation_cases WHERE id = ?').get(caseId)) as any;
    const effectiveCompanyId = (updatedCase?.company_id && updatedCase.company_id !== 'comp_unassigned')
      ? updatedCase.company_id
      : companyId;

    const quoteId = `quote_${Date.now()}`;
    const quoteNo = `${caseNo}-Q01`;
    await db.prepare(`
      INSERT INTO quotes (
        id, _version, quotation_case_id, quote_no, quote_version, company_id, project_id,
        status, currency, subtotal, discount_type, discount_rate, discount_amount,
        tax_rate, tax_amount, total_amount, quote_date, is_locked,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quoteId, 1, caseId, quoteNo, 1, effectiveCompanyId, 'proj_unassigned',
      'DRAFT', 'KRW', subtotal, 'NONE', 0, 0,
      taxRate, taxAmount, grandTotal, now.toISOString().slice(0, 10), 0,
      session.userId, now.toISOString(), now.toISOString()
    );

    // 7. Insert Quote Items (quote_items 스키마의 NOT NULL 제약조건 완벽 준수: price_source, price_status, is_included 등)
    const qiRows = quoteItems.map(qi => ({
      id: qi.id,
      _version: 1,
      quote_id: quoteId,
      item_no: qi.item_no,
      drawing_no: qi.drawing_no,
      item_name: qi.item_name,
      specification: qi.specification,
      material: qi.material,
      quantity: qi.quantity,
      unit: qi.unit || 'EA',
      unit_price: qi.unit_price,
      amount: qi.amount,
      price_source: qi.remark?.includes('실적') ? 'MASTER' : 'ESTIMATED',
      price_status: 'CONFIRMED',
      is_included: 1,
      remark: qi.remark,
      created_at: now.toISOString()
    }));

    for (let i = 0; i < qiRows.length; i += 50) {
      await insertRows('quote_items', qiRows.slice(i, i + 50));
    }

    // 8. Update Case to QUOTED & READY_FOR_QUOTE
    await db.prepare(`
      UPDATE quotation_cases
      SET status = 'QUOTED',
          quote_readiness = 'READY_FOR_QUOTE',
          updated_at = ?
      WHERE id = ?
    `).run(now.toISOString(), caseId);

    // 9. Write Fast-Path Snapshot for Instant Subsequent Load
    try {
      const snapshotPath = path.join(process.cwd(), 'storage', 'derived', `${caseId}_snapshot.json`);
      const snapshotData = {
        case: {
          id: caseId,
          case_no: caseNo,
          case_name: caseName,
          company_id: companyId,
          company_name: companyName,
          status: 'QUOTED',
          quote_readiness: 'READY_FOR_QUOTE',
          primary_file_name: originalName,
          quote_total_amount: totalAmount,
          drawings_count: drawings.length || 1,
          bom_items_count: quoteItems.length
        },
        permission: { canEdit: true, canDelete: true, canApprove: true },
        files: [{ id: fileId, original_file_name: originalName, file_type: fileType, file_role: 'PRIMARY' }],
        drawings,
        quotes: [{ id: quoteId, quote_no: quoteNo, total_amount: totalAmount, status: 'DRAFT' }],
        latestQuote: { id: quoteId, quote_no: quoteNo, total_amount: totalAmount },
        quoteItems
      };
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData, null, 2), 'utf8');
    } catch {}

    return NextResponse.json({
      success: true,
      caseId,
      caseNo,
      caseName,
      companyName,
      quoteId,
      totalAmount,
      drawingsCount: drawings.length || 1,
      bomCount: quoteItems.length,
      matchedRate,
      items: quoteItems.slice(0, 10)
    });
  } catch (error: any) {
    console.error('[quick-estimate] Error:', error);
    return NextResponse.json({ error: error.message || 'AI 즉시 견적 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
