import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { analysisQueue } from '@/lib/analysis-queue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { itemId } = await params;
    const res = await analysisQueue.toggleHold(itemId);

    if (!res.success) {
      return NextResponse.json({ error: '해당 대기열 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const msg = res.status === 'ON_HOLD' ? '분석이 보류되었습니다.' : '분석 대기열로 복귀했습니다.';
    return NextResponse.json({ success: true, status: res.status, message: msg });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '보류 처리 실패' }, { status: 500 });
  }
}
