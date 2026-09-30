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
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) as item_count,
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id AND (qi.price_source IN ('MANUAL_PRICE', 'MANUAL_INPUT', 'USER_OVERRIDE', 'PRICE_MASTER', 'MANUAL_REVIEW') OR qi.unit_price > 0)) as modified_count
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

    sql += ` ORDER BY q.quote_date DESC, q.rowid DESC, q.quote_version DESC`;

    const quotes = (await db.prepare(sql).all(...params)) as any[];

    for (const q of quotes) {
      q.author_name = userMap.get(q.created_by_user_id) || '담당자';
      q.created_at = q.quote_date || q.created_at || '';
    }

    // 견적건 그룹핑 및 정렬:
    // 1. 견적의뢰 케이스(case_no 또는 quote_no 앞부분) 및 최신 일자 역순 정렬
    // 2. 동일 케이스 내에서는 최신 버전(quote_version DESC) 정렬
    quotes.sort((a: any, b: any) => {
      const caseA = a.case_no || a.quote_no?.replace(/-V\d+$/i, '') || '';
      const caseB = b.case_no || b.quote_no?.replace(/-V\d+$/i, '') || '';

      // 동일 케이스인 경우: 최신 버전(quote_version 내림차순) 우선
      if (a.quotation_case_id === b.quotation_case_id || (caseA && caseA === caseB)) {
        return Number(b.quote_version || 0) - Number(a.quote_version || 0);
      }

      // 서로 다른 케이스인 경우: 케이스 번호 역순(최신 날짜/번호 먼저)
      const caseCompare = caseB.localeCompare(caseA);
      if (caseCompare !== 0) return caseCompare;

      const dateA = a.quote_date || a.created_at || '';
      const dateB = b.quote_date || b.created_at || '';
      const dateCompare = dateB.localeCompare(dateA);
      if (dateCompare !== 0) return dateCompare;

      return Number(b.quote_version || 0) - Number(a.quote_version || 0);
    });

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

    // 견적 통계 집계: 케이스별 최신 버전만 기준으로 집계하여 중복 왜곡 방지
    const caseLatestMap = new Map<string, any>();
    for (const q of filteredQuotes) {
      const key = q.quotation_case_id || q.case_no || q.id;
      if (!caseLatestMap.has(key)) {
        caseLatestMap.set(key, q);
      }
    }
    const latestList = Array.from(caseLatestMap.values());
    const totalCount = latestList.length;
    const totalRevisions = filteredQuotes.length;
    const totalAmount = latestList.reduce((acc: number, q: any) => acc + Number(q.total_amount || 0), 0);
    const approvedAmount = latestList
      .filter((q: any) => ['APPROVED', 'ISSUED'].includes(q.status))
      .reduce((acc: number, q: any) => acc + Number(q.total_amount || 0), 0);

    return NextResponse.json({
      success: true,
      quotes: filteredQuotes,
      stats: {
        totalCount,
        totalRevisions,
        totalAmount,
        approvedAmount
      }
    });
  } catch (error: any) {
    console.error('GET /api/quotes error:', error);
    return NextResponse.json({ error: error.message || '견적서 목록 조회 실패' }, { status: 500 });
  }
}
