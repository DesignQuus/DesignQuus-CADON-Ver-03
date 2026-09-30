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
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as any;
  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  // Authorization Guard: 최고관리자(SUPER_ADMIN), 테넌트관리자(TENANT_ADMIN), 또는 최초 승인자(approved_by_user_id)만 잠금 해제 가능
  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const isTenantAdmin = session.role === 'TENANT_ADMIN';
  const isOriginalApprover = quote.approved_by_user_id && String(quote.approved_by_user_id) === String(session.userId);

  if (!isSuperAdmin && !isTenantAdmin && !isOriginalApprover) {
    return NextResponse.json({
      error: '승인 완료된 공식 견적서의 잠금 해제는 시스템 최고관리자 또는 해당 견적서의 승인권자만 가능합니다.'
    }, { status: 403 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE quotes
    SET status = 'DRAFT', is_locked = 0, updated_at = ?
    WHERE id = ?
  `).run(now, id);

  await recordActivity(req, session, {
    activityType: 'QUOTE_UNLOCK',
    quotationCaseId: quote.quotation_case_id,
    details: `견적서 [${quote.quote_no}] 수정 잠금 해제 (DRAFT 상태 전환)`
  });

  return NextResponse.json({ success: true, status: 'DRAFT', isLocked: false });
}
