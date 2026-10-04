import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quotes/[id]/submit
 * 견적서 결재 상신 (DRAFT / REJECTED -> SUBMITTED)
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

  // 승인 완료된 견적서는 중복 상신 불가
  if (quote.status === 'APPROVED' || quote.status === 'EMERGENCY_APPROVED') {
    return NextResponse.json({ error: '이미 최종 승인된 견적서입니다.' }, { status: 400 });
  }

  // 견적 금액 유효성 검사 (0원 상신 차단)
  if (!quote.total_amount || Number(quote.total_amount) <= 0) {
    return NextResponse.json({
      error: '총 견적 금액이 0원인 견적서는 결재를 상신할 수 없습니다. 품목별 단가를 먼저 입력 및 확정해주세요.'
    }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const notes = (body.notes || body.memo || '').trim();
    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE quotes
      SET status = 'SUBMITTED',
          submitted_by_user_id = ?,
          submitted_at = ?,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          reject_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(session.userId, now, notes, notes, now, id);

    const updated = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);

    return NextResponse.json({
      success: true,
      message: '견적서가 결재 상신되었습니다.',
      quote: updated
    });
  } catch (err: any) {
    console.error(`POST /api/quotes/${id}/submit error:`, err);
    return NextResponse.json({ error: err.message || '결재 상신 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
