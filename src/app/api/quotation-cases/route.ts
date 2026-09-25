import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const baseSelect = `
      SELECT qc.*, 
        COALESCE(c.company_name, '고객사 미지정') as company_name, 
        COALESCE(c.company_code, '-') as company_code, 
        COALESCE(p.project_name, '프로젝트 미지정') as project_name, 
        COALESCE(p.project_code, '-') as project_code,
        (SELECT COUNT(DISTINCT uf.original_file_name) FROM uploaded_files uf WHERE uf.quotation_case_id = qc.id AND uf.file_role = 'SOURCE') as files_count,
        (SELECT COUNT(*) FROM drawings d WHERE d.quotation_case_id = qc.id) as drawings_count,
        COALESCE(NULLIF((SELECT COUNT(*) FROM final_bom_items fbi WHERE fbi.quotation_case_id = qc.id), 0), (SELECT COUNT(*) FROM normalized_bom_items nbi WHERE nbi.quotation_case_id = qc.id), 0) as bom_items_count,
        (SELECT q.total_amount FROM quotes q WHERE q.quotation_case_id = qc.id ORDER BY q.quote_version DESC LIMIT 1) as quote_total_amount
      FROM quotation_cases qc
      LEFT JOIN companies c ON qc.company_id = c.id
      LEFT JOIN projects p ON qc.project_id = p.id
    `;

    const allUsers = (await db.prepare('SELECT id, name FROM users').all()) as any[];
    const userMap = new Map(allUsers.map((u: any) => [u.id, u.name]));

    let cases: any[];
    if (session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN') {
      // 시스템 최고관리자 및 회원사 대표: 소속 테넌트/전사 견적건 전체 조회 가능
      const allCases = (await db.prepare(`${baseSelect} ORDER BY qc.rowid DESC`).all()) as any[];
      if (session.role === 'SUPER_ADMIN') {
        cases = allCases;
      } else {
        const myTenant = session.tenant_id || session.companyId;
        cases = allCases.filter((c: any) => 
          !c.tenant_id || c.tenant_id === myTenant || c.tenant_id === 'tenant-cadon' || c.company_id === myTenant
        );
      }
    } else {
      const accessibleCompanies = (await db.prepare(`
        SELECT company_id FROM user_company_access
        WHERE user_id = ? AND is_active = 1
      `).all(session.userId)) as any[];
      const compIds = new Set(accessibleCompanies.map((c: any) => c.company_id));

      const allCases = (await db.prepare(`${baseSelect} ORDER BY qc.rowid DESC`).all()) as any[];
      cases = allCases.filter((c: any) => {
        const isOwner = c.created_by_user_id === session.userId;
        const userTenant = session.tenant_id || session.companyId;
        const isMyTenant = !c.tenant_id || c.tenant_id === userTenant || c.tenant_id === 'tenant-cadon' || (userTenant && c.company_id === userTenant);
        const hasCompanyAccess = compIds.size === 0 || !c.company_id || c.company_id === 'comp_unassigned' || compIds.has(c.company_id) || (userTenant && c.company_id === userTenant);
        const hasVisibility = !c.visibility || c.visibility === 'SHARED' || isOwner;

        return (isOwner || (isMyTenant && hasCompanyAccess)) && hasVisibility;
      });
    }

    const RETENTION_DAYS = 30;
    const nowMs = Date.now();
    for (const c of cases) {
      c.created_by_name = userMap.get(c.created_by_user_id) || '담당자';
      c.is_deleted = !!c.deleted_at || c.status === 'DELETED';
      if (c.deleted_at) {
        const deletedMs = new Date(c.deleted_at).getTime();
        const elapsedDays = Math.floor((nowMs - deletedMs) / (1000 * 60 * 60 * 24));
        c.remaining_days = Math.max(0, RETENTION_DAYS - elapsedDays);
      } else {
        c.remaining_days = null;
      }
    }

    return NextResponse.json({ cases });
  } catch (err: any) {
    console.error('[quotation-cases GET Error]:', err);
    return NextResponse.json({ error: err.message || '견적건 목록 조회 실패' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { companyId, projectId, caseName, requestDate } = await req.json();
    if (!companyId || !projectId || !caseName) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const countRow = (await db.prepare(`
      SELECT COUNT(*) as cnt FROM quotation_cases WHERE case_no LIKE ?
    `).get(`QT-${dateStr}-%`)) as { cnt: number };

    const seq = String(countRow.cnt + 1).padStart(3, '0');
    const caseNo = `QT-${dateStr}-${seq}`;
    const id = `case_${Date.now()}`;

    await db.prepare(`
      INSERT INTO quotation_cases (
        id, case_no, company_id, project_id, case_name, request_date,
        status, revision, quote_readiness, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, caseNo, companyId, projectId, caseName,
      requestDate || now.toISOString().slice(0, 10),
      'DRAFT', '0', 'NOT_READY', session.userId, now.toISOString(), now.toISOString()
    );

    // Audit log: CASE_CREATE
    await recordActivity(req, session, {
      activityType: 'CASE_CREATE',
      quotationCaseId: id,
      caseName: `[${caseNo}] ${caseName}`,
      details: `신규 견적의뢰 건 등록: [${caseNo}] ${caseName}`
    });

    return NextResponse.json({ success: true, caseId: id, caseNo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '견적건 생성 실패' }, { status: 500 });
  }
}
