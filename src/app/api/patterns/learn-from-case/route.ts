import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { learnCadDrawingPattern } from '@/lib/cad-pattern-learning';
import { recordActivity } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { caseId, patternName, companyId, companyName } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'caseId가 필요합니다.' }, { status: 400 });
    }

    const result = await learnCadDrawingPattern(caseId, {
      patternName,
      companyId,
      companyName
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || '도면 패턴 학습 실패' }, { status: 400 });
    }

    // Audit log
    await recordActivity(req, session, {
      activityType: 'PATTERN_LEARN',
      quotationCaseId: caseId,
      details: `CAD 도면 AI 패턴 영구 학습 완료: [${result.pattern?.company_name}] ${result.pattern?.pattern_name}`
    });

    return NextResponse.json({
      success: true,
      message: `[${result.pattern?.company_name}] 도면 표제란 및 BOM 양식이 AI 지식 베이스로 학습되었습니다.`,
      pattern: result.pattern
    });
  } catch (err: any) {
    console.error('[POST /api/patterns/learn-from-case] error:', err);
    return NextResponse.json({ error: err.message || '패턴 학습 중 서버 오류' }, { status: 500 });
  }
}
