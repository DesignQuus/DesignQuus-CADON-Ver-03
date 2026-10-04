import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { itemId } = await params;
    const item = (await db.prepare('SELECT * FROM batch_items WHERE id = ?').get(itemId)) as any;
    if (!item) {
      return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    // batch_items 삭제
    await db.prepare('DELETE FROM batch_items WHERE id = ?').run(itemId);

    // 연관된 quotation_cases가 단일 접수 건이고 다른 항목이 없으면 삭제 또는 정리
    if (item.quotation_case_id) {
      const otherItems = (await db.prepare(`
        SELECT COUNT(*) as cnt FROM batch_items
        WHERE quotation_case_id = ? AND id != ?
      `).get(item.quotation_case_id, itemId)) as any;

      if ((otherItems?.cnt || 0) === 0) {
        // 단독 케이스인 경우 휴지통/삭제 처리
        await db.prepare("UPDATE quotation_cases SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(item.quotation_case_id);
      }
    }

    return NextResponse.json({ success: true, message: '항목이 삭제되었습니다.' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '삭제 처리 실패' }, { status: 500 });
  }
}

export async function PATCH(
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
    const { sort_order } = body;

    if (sort_order !== undefined) {
      await db.prepare('UPDATE batch_items SET sort_order = ? WHERE id = ?').run(sort_order, itemId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '수정 실패' }, { status: 500 });
  }
}
