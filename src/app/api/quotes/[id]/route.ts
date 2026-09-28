import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const quote = (await db.prepare('SELECT id, quote_no, status, is_locked FROM quotes WHERE id = ?').get(id)) as any;
  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    // 1. Delete associated quote items
    await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id);

    // 2. Delete the quote record
    await db.prepare('DELETE FROM quotes WHERE id = ?').run(id);

    return NextResponse.json({
      success: true,
      message: `견적서(${quote.quote_no})가 성공적으로 삭제되었습니다.`
    });
  } catch (err: any) {
    console.error('Delete quote error:', err);
    return NextResponse.json({ error: err.message || '견적서 삭제 처리 실패' }, { status: 500 });
  }
}
