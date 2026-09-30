import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: '삭제할 견적서 ID가 전달되지 않았습니다.' }, { status: 400 });
    }

    // 견적서 조회
    let quote: any = null;
    try {
      quote = await db.prepare('SELECT id, quotation_case_id, quote_no, quote_version, status, is_locked FROM quotes WHERE id = ?').get(id);
    } catch (queryErr: any) {
      console.warn('[DELETE /api/quotes/[id]] SELECT error:', queryErr?.message);
    }

    // 이미 삭제되었거나 존재하지 않는 경우 (멱등성 보장 - 클라이언트에서는 성공으로 처리하여 UI 제거 지원)
    if (!quote) {
      return NextResponse.json({
        success: true,
        alreadyDeleted: true,
        message: '해당 견적서는 이미 삭제되었거나 존재하지 않습니다.'
      });
    }

    // 최종 승인 및 잠금 상태 검증 (슈퍼 관리자가 아닌 경우 승인 완료 견적서 삭제 방어)
    if (quote.is_locked === 1 && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '잠금 상태의 공식 견적서는 최고관리자만 삭제할 수 있습니다.' }, { status: 403 });
    }

    // 1. 견적 품목(quote_items) 삭제
    try {
      await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id);
    } catch (itemsErr: any) {
      console.warn('[DELETE /api/quotes/[id]] quote_items delete warning:', itemsErr?.message);
    }

    // 2. 견적서(quotes) 본 레코드 삭제
    await db.prepare('DELETE FROM quotes WHERE id = ?').run(id);

    // 3. 감사 로그 기록 (비차단)
    try {
      await recordActivity(req, session, {
        activityType: 'DELETE',
        quotationCaseId: quote?.quotation_case_id,
        details: `견적서 [${quote?.quote_no || id}] 영구 삭제 완료 (작업자: ${session.name})`
      });
    } catch (auditErr: any) {
      console.warn('[DELETE /api/quotes/[id]] Audit log warning:', auditErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: `견적서 [${quote.quote_no}]이(가) 정상적으로 삭제되었습니다.`
    });
  } catch (err: any) {
    console.error('Delete quote fatal error:', err);
    return NextResponse.json(
      {
        error: err.message || '견적서 삭제 처리 중 서버 오류가 발생했습니다.',
        success: false
      },
      { status: 500 }
    );
  }
}
