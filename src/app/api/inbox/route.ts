import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { analysisQueue } from '@/lib/analysis-queue';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 서버 구동 시 미처리/분석중단 건 복구 큐 웜업
    analysisQueue.init().catch(() => {});

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const statusFilter = searchParams.get('status');

    // 1. 최근 업로드 배치 목록
    const batches = (await db.prepare(`
      SELECT ub.*, u.name as created_by_name
      FROM upload_batches ub
      LEFT JOIN users u ON ub.created_by_user_id = u.id
      ORDER BY ub.rowid DESC
      LIMIT 15
    `).all()) as any[];

    // 2. 전체 대기열 통계
    const overallStats = (await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'ANALYZING' THEN 1 ELSE 0 END) as analyzing,
        SUM(CASE WHEN status IN ('READY', 'COMPLETED') THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN status = 'ON_HOLD' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as error
      FROM batch_items
    `).get()) as any;

    // 3. 배치 항목 목록 조회
    let itemQuery = `
      SELECT 
        bi.*,
        qc.case_no,
        qc.case_name,
        qc.status as case_status,
        COALESCE(c.company_name, '고객사 미지정') as company_name,
        COALESCE(c.company_code, '-') as company_code,
        ub.batch_name
      FROM batch_items bi
      LEFT JOIN quotation_cases qc ON bi.quotation_case_id = qc.id
      LEFT JOIN companies c ON qc.company_id = c.id
      LEFT JOIN upload_batches ub ON bi.batch_id = ub.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (batchId) {
      itemQuery += ' AND bi.batch_id = ?';
      queryParams.push(batchId);
    }

    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'READY') {
        itemQuery += " AND bi.status IN ('READY', 'COMPLETED')";
      } else {
        itemQuery += ' AND bi.status = ?';
        queryParams.push(statusFilter);
      }
    }

    itemQuery += ' ORDER BY bi.sort_order ASC, bi.rowid DESC LIMIT 100';

    const items = (await db.prepare(itemQuery).all(...queryParams)) as any[];

    return NextResponse.json({
      batches,
      items,
      stats: {
        total: overallStats?.total || 0,
        pending: overallStats?.pending || 0,
        analyzing: overallStats?.analyzing || 0,
        ready: overallStats?.ready || 0,
        on_hold: overallStats?.on_hold || 0,
        error: overallStats?.error || 0
      }
    });

  } catch (err: any) {
    console.error('[inbox GET Error]:', err);
    return NextResponse.json({ error: err?.message || '접수함 목록 조회 실패' }, { status: 500 });
  }
}
