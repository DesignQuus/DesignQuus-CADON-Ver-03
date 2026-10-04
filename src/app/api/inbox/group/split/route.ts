import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { itemId, newCaseName } = body;

    if (!itemId) {
      return NextResponse.json({ error: '분리할 항목 ID가 누락되었습니다.' }, { status: 400 });
    }

    const item = (await db.prepare('SELECT * FROM batch_items WHERE id = ?').get(itemId)) as any;
    if (!item) {
      return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const fileId = item.uploaded_file_id;
    const now = new Date().toISOString();
    const newCaseId = `case_split_${Date.now()}`;
    const newCaseNo = `QT-${Date.now().toString().slice(-6)}-S`;
    const caseName = newCaseName?.trim() || `[개별 분리] ${item.file_name}`;

    // 1. 새 견적건 생성
    await insertRows('quotation_cases', [{
      id: newCaseId,
      case_no: newCaseNo,
      company_id: 'comp_unassigned',
      case_name: caseName,
      request_date: now.slice(0, 10),
      status: 'REGISTERED',
      quote_readiness: 'PENDING_BOM',
      created_by_user_id: session.userId,
      created_at: now
    }]);

    // 2. batch_item 견적건 갱신
    await db.prepare('UPDATE batch_items SET quotation_case_id = ? WHERE id = ?').run(newCaseId, itemId);

    // 3. 파일 및 도면/BOM 데이터 신규 견적건으로 이전
    if (fileId) {
      await db.prepare(`
        UPDATE uploaded_files
        SET quotation_case_id = ?
        WHERE id = ? OR derived_from_file_id = ?
      `).run(newCaseId, fileId, fileId);

      await db.prepare('UPDATE drawings SET quotation_case_id = ? WHERE source_file_id = ?').run(newCaseId, fileId);
      await db.prepare('UPDATE bom_areas SET quotation_case_id = ? WHERE source_file_id = ?').run(newCaseId, fileId);
      await db.prepare('UPDATE raw_bom_items SET quotation_case_id = ? WHERE source_file_id = ?').run(newCaseId, fileId);

      await db.prepare("UPDATE flattened_bom_items SET quotation_case_id = ? WHERE id LIKE 'fb_' || ? || '_%'").run(newCaseId, fileId);
      await db.prepare("UPDATE normalized_bom_items SET quotation_case_id = ? WHERE id LIKE 'norm_' || ? || '_%'").run(newCaseId, fileId);
    }

    return NextResponse.json({
      success: true,
      quotation_case_id: newCaseId,
      message: `[${item.file_name}] 도면이 별도 견적건으로 분리되었습니다.`
    });

  } catch (err: any) {
    console.error('[inbox-split Error]:', err);
    return NextResponse.json({ error: err?.message || '분리 실패' }, { status: 500 });
  }
}
