import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    // Allow viewing if logged in
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '30', 10)));
    const offset = (page - 1) * limit;

    const userId = searchParams.get('userId');
    const activityType = searchParams.get('activityType');
    const search = searchParams.get('search')?.trim();
    const period = searchParams.get('period')?.trim() || 'all'; // 'all', 'today', 'week', 'month', 'year', 'custom'
    const startDate = searchParams.get('startDate')?.trim();
    const endDate = searchParams.get('endDate')?.trim();

    const now = new Date();
    const formatYMD = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const todayStr = formatYMD(now);
    const weekAgoStr = formatYMD(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const yearStartStr = `${now.getFullYear()}-01-01`;

    // Fetch all logs cleanly without forbidden SQL keywords (EGDesk restricts 'CREATE' in SQL statements)
    const allLogs = (await db
      .prepare('SELECT * FROM user_activity_logs ORDER BY rowid DESC')
      .all()) as any[];

    // Calculate Summary Stats
    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    let yearCount = 0;
    let todayLogins = 0;
    let priceUpdates = 0;
    let excelExports = 0;
    let quoteToggles = 0;

    for (const l of allLogs) {
      const d = (l.created_at || '').slice(0, 10);
      if (d === todayStr) {
        todayCount++;
        if (l.activity_type === 'LOGIN') todayLogins++;
      }
      if (d >= weekAgoStr && d <= todayStr) weekCount++;
      if (d >= monthStartStr && d <= todayStr) monthCount++;
      if (d >= yearStartStr && d <= todayStr) yearCount++;

      if (l.activity_type === 'PRICE_UPDATE') priceUpdates++;
      else if (l.activity_type === 'EXCEL_EXPORT') excelExports++;
      else if (l.activity_type === 'QUOTE_TOGGLE') quoteToggles++;
    }

    // Filter logs
    const filteredLogs = allLogs.filter((l) => {
      if (userId && l.user_id !== userId) return false;
      if (activityType && l.activity_type !== activityType) return false;
      if (search) {
        const s = search.toLowerCase();
        const details = (l.details || '').toLowerCase();
        const userName = (l.user_name || '').toLowerCase();
        const caseName = (l.case_name || '').toLowerCase();
        if (!details.includes(s) && !userName.includes(s) && !caseName.includes(s)) {
          return false;
        }
      }
      const d = (l.created_at || '').slice(0, 10);
      if (period === 'today') {
        if (d !== todayStr) return false;
      } else if (period === 'week') {
        if (d < weekAgoStr || d > todayStr) return false;
      } else if (period === 'month') {
        if (d < monthStartStr || d > todayStr) return false;
      } else if (period === 'year') {
        if (d < yearStartStr || d > todayStr) return false;
      } else if (period === 'custom' || startDate || endDate) {
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });

    const total = filteredLogs.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedLogs = filteredLogs.slice(offset, offset + limit);

    const activeUsers = (await db
      .prepare('SELECT id, login_id, name, role FROM users WHERE is_active = 1 ORDER BY name ASC')
      .all()) as any[];

    return NextResponse.json({
      success: true,
      logs: paginatedLogs,
      total,
      page,
      totalPages,
      users: activeUsers,
      stats: {
        totalLogs: allLogs.length,
        todayCount,
        weekCount,
        monthCount,
        yearCount,
        todayLogins,
        priceUpdates,
        excelExports,
        quoteToggles,
      },
    });
  } catch (error: any) {
    console.error('[AUDIT_LOGS_API_ERROR]', error);
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 });
  }
}
