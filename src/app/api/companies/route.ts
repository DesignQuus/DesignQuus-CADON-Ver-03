import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const companies = await db.prepare(`
    SELECT id, company_code, company_name, company_type, is_active
    FROM companies
    WHERE is_active = 1
    ORDER BY company_name ASC
  `).all();

  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { companyName, companyCode } = await req.json();
    if (!companyName || !companyName.trim()) {
      return NextResponse.json({ error: '고객사명을 입력해주세요.' }, { status: 400 });
    }

    const trimmed = companyName.trim();
    // Check if already exists
    const existing = (await db.prepare('SELECT * FROM companies WHERE company_name = ?').get(trimmed)) as any;
    if (existing) {
      return NextResponse.json({ company: existing });
    }

    const newId = `comp_${Date.now()}`;
    const code = (companyCode && companyCode.trim()) || `CUST-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO companies (id, company_code, company_name, company_type, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'CUSTOMER', 1, ?, ?)
    `).run(newId, code, trimmed, now, now);

    // Grant access to all users so everyone can view/quote
    const allUsers = (await db.prepare('SELECT id FROM users').all()) as any[];
    for (const u of allUsers) {
      await db.prepare(`
        INSERT OR IGNORE INTO user_company_access (user_id, company_id, access_role, is_active)
        VALUES (?, ?, 'MANAGER', 1)
      `).run(u.id, newId);
    }

    // Default project for this company
    const newProjId = `proj_${Date.now()}`;
    await db.prepare(`
      INSERT INTO projects (id, company_id, project_code, project_name, status, created_at, updated_at)
      VALUES (?, ?, 'PRJ-MAIN', ?, 'ACTIVE', ?, ?)
    `).run(newProjId, newId, `${trimmed} 표준 견적 프로젝트`, now, now);

    const company = await db.prepare('SELECT * FROM companies WHERE id = ?').get(newId);
    return NextResponse.json({ company, projectId: newProjId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '고객사 등록 실패' }, { status: 500 });
  }
}
