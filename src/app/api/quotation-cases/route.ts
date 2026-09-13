import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const baseSelect = `
    SELECT qc.*, c.company_name, c.company_code, p.project_name, p.project_code,
      (SELECT COUNT(DISTINCT uf.original_file_name) FROM uploaded_files uf WHERE uf.quotation_case_id = qc.id AND uf.file_role = 'SOURCE') as files_count,
      (SELECT COUNT(*) FROM drawings d WHERE d.quotation_case_id = qc.id) as drawings_count,
      COALESCE(NULLIF((SELECT COUNT(*) FROM final_bom_items fbi WHERE fbi.quotation_case_id = qc.id), 0), (SELECT COUNT(*) FROM normalized_bom_items nbi WHERE nbi.quotation_case_id = qc.id), 0) as bom_items_count,
      (SELECT q.total_amount FROM quotes q WHERE q.quotation_case_id = qc.id ORDER BY q.quote_version DESC LIMIT 1) as quote_total_amount
    FROM quotation_cases qc
    JOIN companies c ON qc.company_id = c.id
    JOIN projects p ON qc.project_id = p.id
  `;

  const allUsers = (await db.prepare('SELECT id, name FROM users').all()) as any[];
  const userMap = new Map(allUsers.map((u: any) => [u.id, u.name]));

  let cases: any[];
  if (session.role === 'SUPER_ADMIN') {
    cases = (await db.prepare(`${baseSelect} ORDER BY qc.rowid DESC`).all()) as any[];
  } else {
    const accessibleCompanies = (await db.prepare(`
      SELECT company_id FROM user_company_access
      WHERE user_id = ? AND is_active = 1
    `).all(session.userId)) as any[];
    const compIds = new Set(accessibleCompanies.map((c: any) => c.company_id));

    const allCases = (await db.prepare(`${baseSelect} ORDER BY qc.rowid DESC`).all()) as any[];
    cases = allCases.filter((c: any) =>
      compIds.has(c.company_id) && (c.visibility === 'SHARED' || c.created_by_user_id === session.userId)
    );
  }

  for (const c of cases) {
    c.created_by_name = userMap.get(c.created_by_user_id) || '담당자';
  }

  return NextResponse.json({ cases });
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
