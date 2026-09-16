import { NextRequest, NextResponse } from 'next/server';
import { updateRows, queryTable } from '@/../egdesk-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const body = await request.json();
    const { identicalItemIds } = body;

    const count = Array.isArray(identicalItemIds) ? identicalItemIds.length : 0;
    const now = new Date().toISOString();

    // 동일 행 일괄 확정 상태 업데이트
    if (count > 0) {
      for (const itemId of identicalItemIds) {
        await updateRows('normalized_bom_items', {
          filters: { id: itemId },
          updates: {
            status: 'CONFIRMED',
            updated_at: now
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `동일 부품 ${count}건의 이전 확정 단가가 일괄 계승되었습니다.`,
      inheritedCount: count
    });
  } catch (err: any) {
    console.error('Inherit prices API error:', err);
    return NextResponse.json({ error: err.message || '단가 일괄 계승 실패' }, { status: 500 });
  }
}
