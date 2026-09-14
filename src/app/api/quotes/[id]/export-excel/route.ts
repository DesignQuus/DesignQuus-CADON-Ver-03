import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { getStorageSubdir, resolveStoragePath } from '@/lib/storage';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function runExcelExporter(quoteJsonPath: string, templatePath: string, outputPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'excel_exporter.py');
    const proc = spawn('python', [scriptPath, quoteJsonPath, templatePath, outputPath], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Excel export failed (code ${code}): ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ raw_output: stdout, error: stderr });
      }
    });

    proc.on('error', reject);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const quote = (await db.prepare(`
    SELECT q.*, c.company_name, p.project_name
    FROM quotes q
    JOIN companies c ON q.company_id = c.id
    JOIN projects p ON q.project_id = p.id
    WHERE q.id = ?
  `).get(id)) as any;

  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    let reqBody: any = {};
    try {
      reqBody = await req.json();
    } catch {}

    let items = (await db.prepare(`
      SELECT 
        qi.*,
        COALESCE(fb.part_no, '') as drawing_no,
        COALESCE(fb.name, qi.item_name) as drawing_name
      FROM quote_items qi
      LEFT JOIN final_bom_items fbi ON qi.final_bom_item_id = fbi.id
      LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(fbi.normalized_item_id, 'norm_', 'fb_')
      WHERE qi.quote_id = ? AND (qi.is_included IS NULL OR qi.is_included != 0)
      ORDER BY qi.item_no ASC
    `).all(id)) as any[];

    if (items.length === 0) {
      items = (await db.prepare(`
        SELECT 
          qi.*,
          COALESCE(fb.part_no, '') as drawing_no,
          COALESCE(fb.name, qi.item_name) as drawing_name
        FROM quote_items qi
        LEFT JOIN final_bom_items fbi ON qi.final_bom_item_id = fbi.id
        LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(fbi.normalized_item_id, 'norm_', 'fb_')
        WHERE qi.quote_id = ?
        ORDER BY qi.item_no ASC
      `).all(id)) as any[];
    }

    const template = (await db.prepare('SELECT * FROM excel_templates WHERE is_default = 1 LIMIT 1').get()) as any;

    const exportsDir = getStorageSubdir('exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    const exportFileName = `견적서_${quote.quote_no}.xlsx`;
    const outputPath = path.join(exportsDir, exportFileName);
    const templatePath = template?.storage_path ? resolveStoragePath(template.storage_path) : path.join(getStorageSubdir('templates'), 'standard_quote_template.xlsx');

    const supplier = reqBody.supplier || {
      business_no: '',
      company_name: '',
      ceo_name: '',
      address: '',
      biz_type: '',
      biz_category: '',
      tel: '',
      fax: '',
      email: '',
      manager: ''
    };

    const terms = reqBody.terms || {
      delivery_terms: '발주 확정 후 30일 이내 납품 (도면 승인 기준)',
      payment_terms: '세금계산서 발행 후 30일 이내 현금 결제 (협의 가능)',
      validity_terms: '견적 제출일로부터 30일간 유효',
      bank_account: '',
      remarks: '1. 본 견적서는 CAD 도면 정밀 분석 기반 표준 산출 견적서입니다.\n2. 사양 변경 시 견적 금액이 변동될 수 있습니다.'
    };

    const quoteData = {
      quote: {
        quote_no: quote.quote_no,
        quote_version: quote.quote_version,
        quote_date: quote.quote_date,
        subtotal: quote.subtotal,
        discount_amount: quote.discount_amount,
        tax_amount: quote.tax_amount,
        total_amount: quote.total_amount
      },
      customer_name: quote.company_name,
      project_name: quote.project_name,
      supplier,
      terms,
      items: items.map((it: any, idx: number) => ({
        item_no: idx + 1,
        drawing_no: it.drawing_no || it.master_code || '-',
        master_code: it.master_code,
        item_name: it.item_name,
        specification: it.specification,
        material: it.material,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        amount: it.amount,
        remark: it.remark
      }))
    };

    const tempJsonPath = path.join(getStorageSubdir('temp'), `quote_export_${Date.now()}.json`);
    fs.writeFileSync(tempJsonPath, JSON.stringify(quoteData));

    const result = await runExcelExporter(tempJsonPath, templatePath, outputPath);
    if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);

    if (result.status !== 'COMPLETED') {
      return NextResponse.json({ error: '엑셀 생성 후 총액 검증에 실패했습니다.', result }, { status: 500 });
    }

    const exportId = `exp_${Date.now()}`;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO quote_exports (
        id, quote_id, quote_version, template_id, file_name, storage_path,
        file_size, export_status, is_draft, exported_by_user_id, exported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      exportId, quote.id, quote.quote_version, template?.id || 'tmpl_001',
      exportFileName, outputPath, result.file_size || 5000,
      'COMPLETED', quote.status === 'APPROVED' ? 0 : 1,
      session.userId, now
    );

    // Audit log: EXCEL_EXPORT
    await recordActivity(req, session, {
      activityType: 'EXCEL_EXPORT',
      quotationCaseId: quote.quotation_case_id,
      details: `표준 견적서 엑셀 내보내기 다운로드: ${exportFileName} (${items.length}개 품목, 총액 ${(quote.total_amount || 0).toLocaleString()}원)`
    });

    return NextResponse.json({
      success: true,
      exportId,
      fileName: exportFileName,
      fileSize: result.file_size,
      downloadUrl: `/api/exports/${exportId}/download`,
      result
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '엑셀 출력 실패' }, { status: 500 });
  }
}
