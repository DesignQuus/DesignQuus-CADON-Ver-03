import { NextRequest, NextResponse } from 'next/server';
import { queryTable, insertRows } from '../../../../egdesk-helpers';
import { getSession } from '@/lib/auth';

function normalizeRows(res: any): any[] {
  if (Array.isArray(res)) return res;
  return res?.rows || [];
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const res = await queryTable('companies');
    const all = normalizeRows(res);
    const active = all
      .filter((c: any) => !c.deleted_at && c.is_active !== 0)
      .sort((a: any, b: any) => (a.company_name || '').localeCompare(b.company_name || ''));

    return NextResponse.json({ success: true, companies: active });
  } catch (err: any) {
    console.error('GET /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const companyName = (body.companyName || body.company_name || '').trim();
    const companyCode = (body.companyCode || body.company_code || '').trim();
    const companyType = (body.companyType || body.company_type || 'CUSTOMER').toUpperCase();

    if (!companyName) {
      return NextResponse.json({ success: false, error: '회원사명을 입력해주세요.' }, { status: 400 });
    }

    // 중복 검사
    const all = normalizeRows(await queryTable('companies'));
    const existing = all.find((c: any) => !c.deleted_at && c.company_name === companyName);
    if (existing) {
      return NextResponse.json({ success: true, company: existing, message: '이미 존재하는 회사입니다.' });
    }

    const newId = `comp_${Date.now()}`;
    const code = companyCode || `CUST-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    // 1. 테넌트 회사 등록
    await insertRows('companies', [{
      id: newId,
      company_code: code,
      company_name: companyName,
      company_type: companyType,
      is_active: 1,
      tenant_id: newId,
      uuid: newId,
      created_at: now,
      updated_at: now
    }]);

    // 2. 기본 접근 권한 생성 (현재 관리자)
    await insertRows('user_company_access', [{
      id: `uca_${session.userId}_${newId}`,
      user_id: session.userId,
      company_id: newId,
      access_role: 'MANAGER',
      is_active: 1,
      tenant_id: newId,
      uuid: `uca_${session.userId}_${newId}`,
      updated_at: now
    }]);

    // 3. 기본 프로젝트 생성
    const newProjId = `proj_${Date.now()}`;
    await insertRows('projects', [{
      id: newProjId,
      company_id: newId,
      project_code: 'PRJ-MAIN',
      project_name: `${companyName} 표준 견적 프로젝트`,
      description: `${companyName} 테넌트 기본 프로젝트`,
      status: 'ACTIVE',
      tenant_id: newId,
      uuid: newProjId,
      created_at: now,
      updated_at: now
    }]);

    const createdCompany = {
      id: newId,
      company_code: code,
      company_name: companyName,
      company_type: companyType,
      tenant_id: newId,
      is_active: 1,
      created_at: now
    };

    return NextResponse.json({
      success: true,
      message: '새로운 테넌트(회사)가 성공적으로 등록되었습니다.',
      company: createdCompany,
      projectId: newProjId
    });
  } catch (err: any) {
    console.error('POST /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message || '회사 등록 실패' }, { status: 500 });
  }
}
