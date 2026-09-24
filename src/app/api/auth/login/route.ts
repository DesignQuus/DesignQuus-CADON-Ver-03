import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { loginId, password } = await req.json();
    if (!loginId || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const session = await authenticateUser(loginId, password);
    if (!session) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const token = await createSession(session);

    // Audit log: LOGIN
    await recordActivity(req, session, {
      activityType: 'LOGIN',
      details: `${session.name} (${session.loginId}) 담당자 시스템 접속 로그인 완료`
    });

    const res = NextResponse.json({ success: true, user: session, token });
    res.cookies.set('cadon_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    });

    return res;
  } catch (error: any) {
    let msg = error.message || '서버 오류';
    if (msg.includes('X-Api-Key') || msg.toLowerCase().includes('unauthorized')) {
      msg = '데이터베이스 인증 연결에 실패했습니다. (API Key 설정을 확인해주세요.)';
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

