import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/quotes
 * 발행된 공식 견적서 목록 조회 API
 * - SUPER_ADMIN: 전체 테넌트 견적서 조회
 * - TENANT_ADMIN / SALES_USER: 소속 테넌트/회사 견적서만 조회
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('search')?.trim().toLowerCase();

    const allUsers = (await db.prepare('SELECT id, name FROM users').all()) as any[];
    const userMap = new Map(allUsers.map((u: any) => [u.id, u.name]));

    let sql = `
      SELECT 
        q.id,
        q.quotation_case_id,
        q.quote_no,
        q.quote_version,
        q.company_id,
        q.status,
        q.currency,
        q.subtotal,
        q.discount_rate,
        q.discount_amount,
        q.tax_rate,
        q.tax_amount,
        q.total_amount,
        q.quote_date,
        q.is_locked,
        qc.case_no,
        qc.case_name,
        COALESCE(c.company_name, '미지정 고객사') as company_name,
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) as item_count
      FROM quotes q
      LEFT JOIN quotation_cases qc ON qc.id = q.quotation_case_id
      LEFT JOIN companies c ON c.id = q.company_id
      WHERE 1=1
    `;

    const params: any[] = [];

    // 멀티테넌트 격리 필터
    if (session.role !== 'SUPER_ADMIN') {
      const userTenant = session.tenant_id || session.companyId;
      if (userTenant) {
        sql += ` AND (q.company_id = ? OR qc.company_id = ?)`;
        params.push(userTenant, userTenant);
      }
    }

    // 상태 필터
    if (statusFilter && statusFilter !== 'ALL') {
      sql += ` AND q.status = ?`;
      params.push(statusFilter);
    }

    sql += ` ORDER BY q.rowid DESC, q.quote_version DESC`;

    const quotes = (await db.prepare(sql).all(...params)) as any[];

    for (const q of quotes) {
      q.author_name = userMap.get(q.created_by_user_id) || '담당자';
      q.created_at = q.quote_date || q.created_at || '';
    }

    // 클라이언트 검색어 필터 (견적번호, 케이스명, 고객사명)
    let filteredQuotes = quotes;
    if (search) {
      filteredQuotes = quotes.filter((q: any) =>
        (q.quote_no && q.quote_no.toLowerCase().includes(search)) ||
        (q.case_name && q.case_name.toLowerCase().includes(search)) ||
        (q.case_no && q.case_no.toLowerCase().includes(search)) ||
        (q.company_name && q.company_name.toLowerCase().includes(search))
      );
    }

    // 견적 통계 집계
    const totalCount = filteredQuotes.length;
    const totalAmount = filteredQuotes.reduce((acc: number, q: any) => acc + Number(q.total_amount || 0), 0);
    const approvedAmount = filteredQuotes
      .filter((q: any) => ['APPROVED', 'ISSUED'].includes(q.status))
      .reduce((acc: number, q: any) => acc + Number(q.total_amount || 0), 0);

    return NextResponse.json({
      success: true,
      quotes: filteredQuotes,
      stats: {
        totalCount,
        totalAmount,
        approvedAmount
      }
    });
  } catch (error: any) {
    console.error('GET /api/quotes error:', error);
    return NextResponse.json({ error: error.message || '견적서 목록 조회 실패' }, { status: 500 });
  }
}
