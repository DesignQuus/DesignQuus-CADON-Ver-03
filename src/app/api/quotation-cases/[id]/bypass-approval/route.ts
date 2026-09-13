import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

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
    const now = new Date().toISOString();

    // 1. If there is a PENDING approval request for this case, immediately approve it
    await db.prepare(`
      UPDATE approval_requests
      SET status = 'APPROVED',
          reviewed_by_user_id = ?,
          reviewed_at = ?,
          review_comment = '최고관리자 결재 승인 보류: 승인 대기 없이 즉시 견적 진행 선택'
      WHERE quotation_case_id = ? AND status = 'PENDING'
    `).run(session.userId, now, id);

    // 2. Set global system approval settings to ALLOW and is_approval_suspended = 1
    await db.prepare(`
      UPDATE system_approval_settings
      SET cross_user_edit_policy = 'ALLOW',
          cross_user_approve_policy = 'ALLOW',
          is_approval_suspended = 1,
          updated_by_user_id = ?,
          updated_at = ?
      WHERE id = 'GLOBAL_CONFIG'
    `).run(session.userId, now);

    // 3. Audit log
    await recordActivity(req, session, {
      activityType: 'APPROVAL_DECISION',
      quotationCaseId: id,
      caseName: qc.case_name,
      details: `${session.name} 담당자가 [최고관리자 결재 승인 없이 견적 진행]을 실행하여 결재 보류 모드로 즉시 작업을 개시함`
    });

    return NextResponse.json({
      success: true,
      message: '최고관리자 결재 승인이 보류되어, 결재 대기 없이 즉시 견적 진행(수정/승인/산출)이 활성화되었습니다.'
    });
  } catch (err: any) {
    console.error('Bypass approval error:', err);
    return NextResponse.json({ error: err.message || '결재 보류 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
