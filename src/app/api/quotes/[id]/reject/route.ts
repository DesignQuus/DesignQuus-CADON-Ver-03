import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { checkCasePermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quotes/[id]/reject
 * 견적서 결재 반려 (SUBMITTED -> REJECTED)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const quote = (await db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)) as any;
  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  // Permission Guard: 반려할 수 있는 권한 확인
  const perm = await checkCasePermission(session.userId, session.role, quote.quotation_case_id);
  if (!perm.canApprove && !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
    return NextResponse.json({
      error: '해당 견적서를 반려할 수 있는 결재 권한이 없습니다.'
    }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rejectReason = (body.rejectionReason || body.reject_reason || body.reason || '').trim();
    if (!rejectReason) {
      return NextResponse.json({ error: '반려 사유를 필수로 입력해주세요.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 견적서 상태를 REJECTED로 변경하고 수정할 수 있도록 is_locked = 0 해제
    await db.prepare(`
      UPDATE quotes
      SET status = 'REJECTED',
          is_locked = 0,
          reject_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(rejectReason, now, id);

    const updated = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);

    return NextResponse.json({
      success: true,
      status: 'REJECTED',
      isLocked: false,
      message: '견적서가 반려 처리되었습니다.',
      quote: updated
    });
  } catch (err: any) {
    console.error(`POST /api/quotes/${id}/reject error:`, err);
    return NextResponse.json({ error: err.message || '반려 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
