import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dryRunTitleBlockValidation } from '@/lib/cad-pattern-learning';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { caseId } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'caseId가 필요합니다.' }, { status: 400 });
    }

    const validationResult = await dryRunTitleBlockValidation(caseId);

    return NextResponse.json({
      success: true,
      data: validationResult
    });
  } catch (err: any) {
    console.error('[/api/patterns/dry-run] error:', err);
    return NextResponse.json({ error: err.message || '사전 검증 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
