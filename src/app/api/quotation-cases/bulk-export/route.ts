import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { getStorageSubdir } from '@/lib/storage';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { caseIds } = await req.json();
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json({ error: '선택된 견적건이 없습니다.' }, { status: 400 });
    }

    const tempDir = getStorageSubdir('temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const generatedFiles: { path: string; name: string }[] = [];
    const timestamp = Date.now();

    for (let idx = 0; idx < caseIds.length; idx++) {
      const caseId = caseIds[idx];
      const qc = (await db.prepare(`
        SELECT qc.*, c.company_name, p.project_name
        FROM quotation_cases qc
        LEFT JOIN companies c ON qc.company_id = c.id
        LEFT JOIN projects p ON qc.project_id = p.id
        WHERE qc.id = ?
      `).get(caseId)) as any;

      if (!qc) continue;

      // 1. Check for official generated quote & enforce approval guard
      const quote = (await db.prepare(`
        SELECT * FROM quotes 
        WHERE quotation_case_id = ? 
        ORDER BY quote_version DESC LIMIT 1
      `).get(caseId)) as any;

      if (!quote || quote.status !== 'APPROVED' || quote.is_locked !== 1) {
        return NextResponse.json(
          {
            error: `[승인 가드 차단] 견적건(${qc.case_no || caseId})이 최종 승인(APPROVED) 및 확정(LOCKED)되지 않았습니다. 미승인 상태의 일괄 엑셀 내보내기는 원천 차단됩니다.`
          },
          { status: 403 }
        );
      }

      let rows: any[] = [];

      const quoteItems = (await db.prepare(`
        SELECT * FROM quote_items 
        WHERE quote_id = ? AND (is_included IS NULL OR is_included != 0)
        ORDER BY item_no ASC
      `).all(quote.id)) as any[];

      rows = quoteItems.map((qi: any, i: number) => [
        i + 1,
        qi.drawing_no || qi.master_code || '-',
        qi.item_name || '부품',
        qi.specification || '-',
        qi.material || 'SS400',
        Number(qi.quantity || 1),
        qi.unit || 'EA',
        Number(qi.unit_price || 0),
        Number(qi.amount || 0),
        qi.remark || ''
      ]);

      // 2. Build workbook
      const wsData = [
        ['CADON-BOM AI 표준 견적서 (자동 산출본)', '', '', '', '', '', '', '', '', ''],
        [`견적 건명: ${qc.case_name || '-'}`, '', '', '', '', `관리번호: ${qc.case_no || '-'}`, '', '', '', ''],
        [`고객사: ${qc.company_name || '고객사 미지정'}`, '', '', '', '', `작성일: ${new Date().toISOString().slice(0, 10)}`, '', '', '', ''],
        [],
        ['No', '도면/관리번호', '품명 (Standard Name)', '규격 (Spec)', '재질 (Material)', '수량', '단위', '단가 (원)', '공급가액 (원)', '비고'],
        ...rows
      ];

      // Calculate total sum
      const totalQty = rows.reduce((sum: number, r: any[]) => sum + (Number(r[5]) || 0), 0);
      const totalAmt = rows.reduce((sum: number, r: any[]) => sum + (Number(r[8]) || 0), 0);
      wsData.push([
        '합계', '', '', '', '', totalQty, '', '', totalAmt, ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 28 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 8 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '견적내역');

      const safeCaseName = (qc.case_name || '견적서').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 30);
      const fileName = `견적서_${qc.case_no}_${safeCaseName}.xlsx`;
      const filePath = path.join(tempDir, `${timestamp}_${idx}_${fileName}`);

      const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fs.writeFileSync(filePath, Buffer.from(fileBuffer));
      generatedFiles.push({ path: filePath, name: fileName });
    }

    if (generatedFiles.length === 0) {
      return NextResponse.json({ error: '내보낼 유효한 견적 데이터가 없습니다.' }, { status: 400 });
    }

    // 3. Zip packaging via python script
    const zipFileName = `CADON_BOM_견적서일괄_${timestamp}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);

    const manifestPath = path.join(tempDir, `manifest_${timestamp}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(generatedFiles), 'utf-8');

    const packScript = [
      'import zipfile, sys, json',
      'with open(sys.argv[1], "r", encoding="utf-8") as f:',
      '    data = json.load(f)',
      'zip_path = sys.argv[2]',
      'with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:',
      '    for item in data:',
      '        zf.write(item["path"], arcname=item["name"])',
      'print("SUCCESS")'
    ].join('\n');

    const packScriptPath = path.join(tempDir, `pack_${timestamp}.py`);
    fs.writeFileSync(packScriptPath, packScript, 'utf-8');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [packScriptPath, manifestPath, zipFilePath], {
        cwd: process.cwd()
      });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ZIP packaging failed with code ${code}: ${stderr}`));
      });
      proc.on('error', reject);
    });

    // Cleanup temp files
    try { fs.unlinkSync(packScriptPath); } catch {}
    try { fs.unlinkSync(manifestPath); } catch {}
    for (const f of generatedFiles) {
      try { fs.unlinkSync(f.path); } catch {}
    }

    if (!fs.existsSync(zipFilePath)) {
      return NextResponse.json({ error: 'ZIP 파일 생성에 실패했습니다.' }, { status: 500 });
    }

    const zipBuffer = fs.readFileSync(zipFilePath);
    try { fs.unlinkSync(zipFilePath); } catch {}

    await recordActivity(req, session, {
      activityType: 'BULK_QUOTE_EXPORT',
      details: `견적서 일괄 엑셀 압축팩 다운로드: ${generatedFiles.length}건 번들`
    });

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '일괄 엑셀 내보내기 중 오류 발생' }, { status: 500 });
  }
}