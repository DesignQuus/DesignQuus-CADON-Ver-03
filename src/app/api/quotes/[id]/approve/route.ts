import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { checkCasePermission } from '@/lib/permissions';

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

  // Permission Guard
  const perm = await checkCasePermission(session.userId, session.role, quote.quotation_case_id);
  if (!perm.canApprove) {
    return NextResponse.json({
      error: perm.message || '해당 견적서 승인 권한이 없습니다. 최고관리자의 승인이 필요합니다.',
      requiresApproval: perm.requiresApproval,
      approvalStatus: perm.approvalStatus
    }, { status: 403 });
  }

  // Check if all items have valid prices
  const unpriced = (await db.prepare(`
    SELECT COUNT(*) as cnt FROM quote_items
    WHERE quote_id = ? AND price_status = 'PRICE_NOT_FOUND'
  `).get(id)) as any;

  if (unpriced?.cnt > 0) {
    return NextResponse.json({ error: `단가가 입력되지 않은 품목이 ${unpriced.cnt}개 존재합니다. 모든 품목의 단가를 확정해주세요.` }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE quotes
    SET status = 'APPROVED', is_locked = 1, approved_by_user_id = ?, approved_at = ?, updated_at = ?
    WHERE id = ?
  `).run(session.userId, now, now, id);

  return NextResponse.json({ success: true, status: 'APPROVED', isLocked: true });
}
