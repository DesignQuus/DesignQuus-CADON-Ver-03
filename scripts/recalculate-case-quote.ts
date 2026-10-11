import { db, insertRows } from '../src/lib/db';
import { getLearnedPricePool } from '../src/lib/self-learning';
import path from 'path';
import fs from 'fs';

async function updateQuote() {
  const caseId = 'case_1791734411703';
  console.log(`[recalculate] Updating case: ${caseId}...`);

  const drawings = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC').all(caseId)) as any[];
  const flatBom = (await db.prepare('SELECT * FROM flattened_bom_items WHERE quotation_case_id = ?').all(caseId)) as any[];
  
  console.log(`[recalculate] Loaded ${drawings.length} drawings and ${flatBom.length} BOM items`);

  const pricePool = await getLearnedPricePool();
  console.log(`[recalculate] Loaded ${pricePool.length} items from manual_price_pool`);

  const learnedMap = new Map<string, number>();
  for (const p of pricePool) {
    const key = (p.item_name || '').toUpperCase().replace(/[\s\-_.]/g, '');
    const stdKey = (p.standard_name || '').toUpperCase().replace(/[\s\-_.]/g, '');
    if (key && p.unit_price > 0) learnedMap.set(key, p.unit_price);
    if (stdKey && p.unit_price > 0) learnedMap.set(stdKey, p.unit_price);
  }

  const getMaterialBasePrice = (mat: string): number => {
    const m = (mat || '').toUpperCase();
    if (m.includes('SUS') || m.includes('STS') || m.includes('STAINLESS')) return 48000;
    if (m.includes('AL') || m.includes('ALUMINUM') || m.includes('6061')) return 38000;
    if (m.includes('S45C') || m.includes('SC45') || m.includes('SKD')) return 32000;
    if (m.includes('MC') || m.includes('ACETAL') || m.includes('POM')) return 28000;
    if (m.includes('COPPER') || m.includes('BRASS') || m.includes('황동')) return 52000;
    return 25000;
  };

  let sourceItems = drawings.filter((d: any) => d.drawing_type !== 'MAIN_ASSEMBLY' && !d.drawing_name_raw?.includes('조립'));
  if (sourceItems.length === 0 && drawings.length > 0) sourceItems = drawings;
  if (sourceItems.length === 0 && flatBom.length > 0) sourceItems = flatBom;

  let matchedCount = 0;
  const quoteItems: any[] = [];
  let itemNo = 1;

  for (const item of sourceItems) {
    const rawName = item.drawing_name_raw || item.drawing_name_normalized || item.name || item.part_name || `부품-${itemNo}`;
    const drawingNo = item.drawing_no_raw || item.drawing_no_normalized || item.part_no || `DWG-${String(itemNo).padStart(3, '0')}`;
    const mat = item.material || 'SS400';
    const qty = Number(item.quantity || item.total_quantity) || 1;

    const normName = rawName.toUpperCase().replace(/[\s\-_.]/g, '');
    let unitPrice = 0;
    let isLearned = false;

    if (learnedMap.has(normName)) {
      unitPrice = learnedMap.get(normName)!;
      isLearned = true;
      matchedCount++;
    } else {
      // 부분 문자열 매칭 시도
      for (const [k, p] of learnedMap.entries()) {
        if (normName.includes(k) || k.includes(normName)) {
          unitPrice = p;
          isLearned = true;
          matchedCount++;
          break;
        }
      }
      if (!isLearned) {
        unitPrice = getMaterialBasePrice(mat);
      }
    }

    const lineTotal = unitPrice * qty;
    quoteItems.push({
      id: `qi_${caseId}_${itemNo}`,
      item_no: itemNo,
      drawing_no: drawingNo,
      item_name: rawName,
      part_name: rawName,
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

  const subtotal = quoteItems.reduce((acc, it) => acc + (it.amount || 0), 0);
  const taxAmount = Math.round(subtotal * 0.1);
  const grandTotal = subtotal + taxAmount;

  console.log(`[recalculate] Total items: ${quoteItems.length}, Matched from learned pool: ${matchedCount}`);
  console.log(`[recalculate] Subtotal: ${subtotal.toLocaleString()} KRW, Grand Total: ${grandTotal.toLocaleString()} KRW`);

  const existingQuote = (await db.prepare('SELECT id, quote_no FROM quotes WHERE quotation_case_id = ?').get(caseId)) as any;
  if (existingQuote) {
    await db.prepare(`
      UPDATE quotes
      SET subtotal = ?, tax_amount = ?, total_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(subtotal, taxAmount, grandTotal, new Date().toISOString(), existingQuote.id);

    await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(existingQuote.id);

    const qiRows = quoteItems.map((qi: any) => ({
      id: qi.id,
      _version: 1,
      quote_id: existingQuote.id,
      item_no: qi.item_no,
      drawing_no: qi.drawing_no,
      item_name: qi.item_name,
      specification: qi.specification,
      material: qi.material,
      quantity: qi.quantity,
      unit: 'EA',
      unit_price: qi.unit_price,
      amount: qi.amount,
      price_source: qi.remark?.includes('실적') ? 'MASTER' : 'ESTIMATED',
      price_status: 'CONFIRMED',
      is_included: 1,
      remark: qi.remark,
      created_at: new Date().toISOString()
    }));

    for (let i = 0; i < qiRows.length; i += 50) {
      await insertRows('quote_items', qiRows.slice(i, i + 50));
    }

    console.log(`[recalculate] Successfully inserted ${qiRows.length} quote_items!`);

    // Update case snapshot
    try {
      const snapshotPath = path.join(process.cwd(), 'storage', 'derived', `${caseId}_snapshot.json`);
      const caseRow = (await db.prepare(`
        SELECT qc.*, c.company_name
        FROM quotation_cases qc
        LEFT JOIN companies c ON qc.company_id = c.id
        WHERE qc.id = ?
      `).get(caseId)) as any;

      const snapshotData = {
        case: {
          id: caseId,
          case_no: caseRow.case_no,
          case_name: caseRow.case_name,
          company_id: caseRow.company_id,
          company_name: caseRow.company_name || '엠브이텍',
          status: 'QUOTED',
          quote_readiness: 'READY_FOR_QUOTE',
          primary_file_name: '2503-021_sample_1 (3)_202510231541.dwg',
          quote_total_amount: grandTotal,
          drawings_count: drawings.length,
          bom_items_count: quoteItems.length
        },
        permission: { canEdit: true, canDelete: true, canApprove: true },
        drawings,
        quotes: [{ id: existingQuote.id, quote_no: existingQuote.quote_no, total_amount: grandTotal, status: 'DRAFT' }],
        latestQuote: { id: existingQuote.id, quote_no: existingQuote.quote_no, total_amount: grandTotal },
        quoteItems
      };
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData, null, 2), 'utf8');
      console.log(`[recalculate] Snapshot updated at: ${snapshotPath}`);
    } catch (sErr) {
      console.warn('[recalculate] Snapshot error:', sErr);
    }
  }

  // Update Case Status to QUOTED & READY_FOR_QUOTE
  await db.prepare(`
    UPDATE quotation_cases
    SET status = 'QUOTED', quote_readiness = 'READY_FOR_QUOTE', updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), caseId);

  console.log('[recalculate] All done!');
}

updateQuote().catch(console.error);
