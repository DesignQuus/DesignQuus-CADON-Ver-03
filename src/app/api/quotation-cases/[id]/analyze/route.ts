import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { processCadFilePipeline } from '@/lib/cad-pipeline';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const fileId = body?.fileId;
    let targetFile: any = null;

    if (fileId) {
      targetFile = (await db.prepare('SELECT * FROM uploaded_files WHERE id = ? AND quotation_case_id = ?').get(fileId, id)) as any;
    }

    if (!targetFile) {
      // Find latest DWG or DXF file (prefer DWG)
      targetFile = (await db.prepare(`
        SELECT * FROM uploaded_files
        WHERE quotation_case_id = ? AND file_type IN ('DWG', 'DXF')
        ORDER BY (CASE WHEN file_type = 'DWG' THEN 1 ELSE 2 END) ASC, rowid DESC
        LIMIT 1
      `).get(id)) as any;
    }

    if (!targetFile) {
      return NextResponse.json({ error: '분석할 CAD (DWG 또는 DXF) 파일이 없습니다.' }, { status: 400 });
    }

    const res = await processCadFilePipeline(id, targetFile.id, session.userId);
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'CAD 분석 파이프라인 실행 중 오류 발생' }, { status: 500 });
    }

    // Audit log: ANALYSIS_START
    await recordActivity(req, session, {
      activityType: 'ANALYSIS_START',
      quotationCaseId: id,
      details: `CAD 도면 자동 분석 실행: 파일 '${targetFile.original_file_name}' (${targetFile.file_type})`
    });

    return NextResponse.json({ success: true, message: '분석이 성공적으로 완료되었습니다.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '분석 실패' }, { status: 500 });
  }
}
