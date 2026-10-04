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
    const ok = await analysisQueue.retry(itemId);

    if (!ok) {
      return NextResponse.json({ error: '해당 대기열 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '분석 재시도가 접수되었습니다.' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '재시도 처리 실패' }, { status: 500 });
  }
}
