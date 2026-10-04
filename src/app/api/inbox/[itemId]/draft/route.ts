import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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
    const body = await req.json();
    const { draft_data } = body;

    const draftString = typeof draft_data === 'string' ? draft_data : JSON.stringify(draft_data);
    await db.prepare('UPDATE batch_items SET draft_data = ? WHERE id = ?').run(draftString, itemId);

    return NextResponse.json({ success: true, saved_at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '임시저장 실패' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { itemId } = await params;
    const row = (await db.prepare('SELECT draft_data FROM batch_items WHERE id = ?').get(itemId)) as any;

    let parsed = null;
    if (row && row.draft_data) {
      try {
        parsed = JSON.parse(row.draft_data);
      } catch {
        parsed = row.draft_data;
      }
    }

    return NextResponse.json({ draft_data: parsed });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '임시저장 조회 실패' }, { status: 500 });
  }
}
