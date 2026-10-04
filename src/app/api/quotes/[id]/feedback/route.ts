import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quotes/[id]/feedback
 * 수주 피드백 조회
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: quoteId } = await params;
  try {
    const feedback = (await db.prepare(`
      SELECT * FROM order_results
      WHERE quote_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(quoteId)) as any;

    return NextResponse.json({ success: true, feedback: feedback || null });
  } catch (err: any) {
    console.error(`GET /api/quotes/${quoteId}/feedback error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/quotes/[id]/feedback
 * 수주 피드백 등록 및 업데이트 (order_results 테이블 실제 DB 저장)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: quoteId } = await params;
  const quote = (await db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId)) as any;
  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const orderStatus = (body.orderStatus || body.order_status || 'PENDING').toUpperCase();
    const feedbackNotes = (body.feedbackNotes || body.feedbackNote || body.feedback_notes || '').trim();
    const lostReasonCategory = (body.lostReasonCategory || body.lost_reason_category || '').trim();
    const lostReasonDetail = (body.lostReasonDetail || body.lost_reason_detail || '').trim();
    const orderAmount = body.orderAmount !== undefined ? Number(body.orderAmount) : Number(quote.total_amount || 0);

    const now = new Date().toISOString();

    // 기존 피드백이 있는지 확인
    const existing = (await db.prepare('SELECT id FROM order_results WHERE quote_id = ?').get(quoteId)) as any;

    let resultId = existing?.id;
    if (resultId) {
      await db.prepare(`
        UPDATE order_results
        SET order_status = ?,
            order_amount = ?,
            lost_reason_category = ?,
            lost_reason_detail = ?,
            feedback_notes = ?,
            registered_by = ?,
            registered_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        orderStatus,
        orderAmount,
        lostReasonCategory,
        lostReasonDetail,
        feedbackNotes,
        session.userId,
        now,
        now,
        resultId
      );
    } else {
      resultId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.prepare(`
        INSERT INTO order_results (
          id, quotation_case_id, case_no, quote_id, order_status,
          order_amount, lost_reason_category, lost_reason_detail,
          feedback_notes, registered_by, registered_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resultId,
        quote.quotation_case_id,
        quote.quote_no || quote.quotation_case_id,
        quoteId,
        orderStatus,
        orderAmount,
        lostReasonCategory,
        lostReasonDetail,
        feedbackNotes,
        session.userId,
        now,
        now
      );
    }

    const saved = await db.prepare('SELECT * FROM order_results WHERE id = ?').get(resultId);

    return NextResponse.json({
      success: true,
      message: `수주 상태가 '${orderStatus}'(으)로 DB에 저장되었습니다.`,
      feedback: saved
    });
  } catch (err: any) {
    console.error(`POST /api/quotes/${quoteId}/feedback error:`, err);
    return NextResponse.json({ error: err.message || '피드백 저장 실패' }, { status: 500 });
  }
}
