import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLearnedCadPatterns } from '@/lib/cad-pattern-learning';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const patterns = await getLearnedCadPatterns();
    return NextResponse.json({ success: true, patterns });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '패턴 목록 조회 실패' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '패턴 ID가 필요합니다.' }, { status: 400 });
    }

    await db.prepare('DELETE FROM cad_drawing_patterns WHERE id = ?').run(id);

    return NextResponse.json({ success: true, message: '패턴이 삭제되었습니다.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '패턴 삭제 실패' }, { status: 500 });
  }
}
