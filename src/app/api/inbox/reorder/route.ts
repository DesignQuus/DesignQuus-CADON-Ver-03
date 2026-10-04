import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { orders } = body; // Array of { id: string, sort_order: number }

    if (!Array.isArray(orders)) {
      return NextResponse.json({ error: '올바른 순서 데이터가 아닙니다.' }, { status: 400 });
    }

    for (const item of orders) {
      if (item.id && typeof item.sort_order === 'number') {
        await db.prepare('UPDATE batch_items SET sort_order = ? WHERE id = ?').run(item.sort_order, item.id);
      }
    }

    return NextResponse.json({ success: true, count: orders.length });
  } catch (err: any) {
    console.error('[inbox-reorder Error]:', err);
    return NextResponse.json({ error: err?.message || '순서 변경 실패' }, { status: 500 });
  }
}
