export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, queryTable, insertRows, updateRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import bcrypt from 'bcryptjs';

function normalizeRows(res: any): any[] {
  if (Array.isArray(res)) return res;
  return res?.rows || [];
}

/**
 * GET /api/companies
 * 회원사 목록 조회 (통계 지표 포함 지원)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includeDeleted = searchParams.get('include_deleted') === 'true';
    const includeStats = searchParams.get('include_stats') === 'true';

    const res = await queryTable('companies');
    const all = normalizeRows(res);

    let filtered = all;
    if (!includeDeleted) {
      filtered = all.filter((c: any) => !c.deleted_at && c.is_active !== 0);
    }
    filtered.sort((a: any, b: any) => (a.company_name || '').localeCompare(b.company_name || ''));

    if (includeStats) {
      const [usersRes, casesRes, projectsRes] = await Promise.all([
        queryTable('users').catch(() => []),
        queryTable('quotation_cases').catch(() => []),
        queryTable('projects').catch(() => [])
      ]);

      const allUsers = normalizeRows(usersRes);
      const allCases = normalizeRows(casesRes);
      const allProjects = normalizeRows(projectsRes);

      const companiesWithStats = filtered.map((c: any) => {
        const companyUsers = allUsers.filter((u: any) => !u.deleted_at && (u.company_id === c.id || u.tenant_id === c.id));
        const memberCount = companyUsers.length;
        const caseCount = allCases.filter((qc: any) => !qc.deleted_at && (qc.company_id === c.id || qc.tenant_id === c.id)).length;
        const projectCount = allProjects.filter((p: any) => !p.deleted_at && (p.company_id === c.id || p.tenant_id === c.id)).length;
        const tenantAdmin = companyUsers.find((u: any) => u.role === 'TENANT_ADMIN');
        return {
          ...c,
          memberCount,
          caseCount,
          projectCount,
          tenantAdmin: tenantAdmin ? {
            id: tenantAdmin.id,
            login_id: tenantAdmin.login_id,
            name: tenantAdmin.name
          } : null,
          is_deleted: Boolean(c.deleted_at || c.is_active === 0)
        };
      });

      return NextResponse.json({ success: true, companies: companiesWithStats });
    }

    return NextResponse.json({ success: true, companies: filtered });
  } catch (err: any) {
    console.error('GET /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/companies
 * 신규 회원사 등록 (옵션: 대표 관리자 계정 원클릭 동시 발급)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const isTenantOrSales = session.role === 'TENANT_ADMIN' || session.role === 'SALES_USER';
  if (!isSuperAdmin && !isTenantOrSales) {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const companyName = (body.companyName || body.company_name || '').trim();
    const companyCode = (body.companyCode || body.company_code || '').trim();
    // 비 최고관리자(영업사원)는 거래처(CUSTOMER)로만 등록 가능
    const companyType = isSuperAdmin
      ? (body.companyType || body.company_type || 'CUSTOMER').toUpperCase()
      : 'CUSTOMER';
    const createAdmin = isSuperAdmin && Boolean(body.createAdminWithCompany || body.create_admin);
    const adminLoginId = (body.adminLoginId || body.compAdminLoginId || '').trim();
    const adminPassword = (body.adminPassword || body.compAdminPassword || '').trim();
    const adminName = (body.adminName || body.compAdminName || '대표 관리자').trim();
    const adminEmpNum = (body.adminEmpNum || body.compAdminEmpNum || '').trim();
    const adminPhone = (body.adminPhone || body.compAdminPhone || '').trim();

    if (!companyName) {
      return NextResponse.json({ success: false, error: '회사명을 입력해주세요.' }, { status: 400 });
    }

    // 중복 검사: 이미 동일한 이름의 고객사가 있으면 해당 고객사를 즉시 반환
    const all = normalizeRows(await queryTable('companies'));
    const existing = all.find((c: any) => !c.deleted_at && c.company_name.toLowerCase() === companyName.toLowerCase());
    if (existing) {
      return NextResponse.json({ success: true, company: existing, isExisting: true });
    }

    const newId = `comp_${Date.now()}`;
    const code = companyCode || `CUST-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    // 발주 고객사(CUSTOMER) 등록인 경우 (영업 사원 및 실무자 원스톱 처리)
    if (companyType === 'CUSTOMER') {
      const myTenantId = session.tenant_id || session.companyId || 'tenant-cadon';
      await insertRows('companies', [{
        id: newId,
        company_code: code,
        company_name: companyName,
        company_type: 'CUSTOMER',
        is_active: 1,
        tenant_id: myTenantId,
        uuid: newId,
        created_at: now,
        updated_at: now
      }]);

      await insertRows('user_company_access', [{
        id: `uca_${session.userId}_${newId}`,
        user_id: session.userId,
        company_id: newId,
        access_role: 'MANAGER',
        is_active: 1,
        tenant_id: myTenantId,
        uuid: `uca_${session.userId}_${newId}`,
        updated_at: now
      }]);

      return NextResponse.json({
        success: true,
        company: { id: newId, company_code: code, company_name: companyName, company_type: 'CUSTOMER' }
      });
    }

    // 1. 테넌트 회원사 등록 (최고관리자 전용)
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

    // 2. 최고관리자-회사 접근 권한 매핑
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

    // 4. 대표 관리자(TENANT_ADMIN) 계정 동시 생성
    let createdAdminUser: any = null;
    if (createAdmin && adminLoginId && adminPassword) {
      // 아이디 중복 확인
      const allUsers = normalizeRows(await queryTable('users'));
      if (allUsers.some((u: any) => !u.deleted_at && u.login_id === adminLoginId)) {
        return NextResponse.json({
          success: true,
          company: { id: newId, company_code: code, company_name: companyName },
          warning: '회원사는 등록되었으나, 입력한 대표자 아이디가 이미 사용 중이어서 대표 계정은 생성되지 않았습니다.'
        });
      }

      const passHash = bcrypt.hashSync(adminPassword, 10);
      const newUserId = `usr_${Date.now()}`;
      await insertRows('users', [{
        id: newUserId,
        login_id: adminLoginId,
        password_hash: passHash,
        name: adminName,
        role: 'TENANT_ADMIN',
        company_id: newId,
        employee_number: adminEmpNum || `CEO-${Date.now().toString().slice(-4)}`,
        phone: adminPhone || null,
        is_active: 1,
        tenant_id: newId,
        uuid: newUserId,
        created_at: now,
        updated_at: now
      }]);

      await insertRows('user_company_access', [{
        id: `uca_${newUserId}_${newId}`,
        user_id: newUserId,
        company_id: newId,
        access_role: 'MANAGER',
        is_active: 1,
        tenant_id: newId,
        uuid: `uca_${newUserId}_${newId}`,
        updated_at: now
      }]);

      createdAdminUser = { id: newUserId, login_id: adminLoginId, name: adminName, role: 'TENANT_ADMIN' };
    }

    // 감사 로그 기록
    await recordActivity(req, session, {
      activityType: 'COMPANY_CREATE',
      details: `신규 회원사 '${companyName}' (${code}) 등록 완료${createdAdminUser ? ` (대표 계정: ${adminLoginId})` : ''}`
    });

    return NextResponse.json({
      success: true,
      message: '신규 회원사가 성공적으로 등록되었습니다.',
      company: {
        id: newId,
        company_code: code,
        company_name: companyName,
        company_type: companyType,
        tenant_id: newId,
        is_active: 1,
        created_at: now
      },
      adminUser: createdAdminUser
    });
  } catch (err: any) {
    console.error('POST /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message || '회원사 등록 실패' }, { status: 500 });
  }
}

/**
 * PUT /api/companies
 * 회원사 정보 수정 (회사명, 코드, 구분, 활성 상태)
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ success: false, error: '최고관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = (body.id || '').trim();
    const companyName = (body.company_name || body.companyName || '').trim();
    const companyCode = (body.company_code || body.companyCode || '').trim();
    const companyType = (body.company_type || body.companyType || 'CUSTOMER').toUpperCase();
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;

    if (!id) {
      return NextResponse.json({ success: false, error: '회원사 ID가 누락되었습니다.' }, { status: 400 });
    }
    if (!companyName) {
      return NextResponse.json({ success: false, error: '회원사명을 입력해주세요.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows('companies', {
      company_name: companyName,
      company_code: companyCode,
      company_type: companyType,
      is_active: isActive,
      updated_at: now,
      updated_by: session.userId
    }, { filters: { id } });

    // 대표 관리자 비밀번호 초기화 요청이 있는 경우 처리
    const resetAdminPassword = (body.reset_admin_password || body.resetAdminPassword || '').trim();
    let resetAdminSuccess = false;
    if (resetAdminPassword) {
      const usersRes = await queryTable('users');
      const allUsers = normalizeRows(usersRes);
      const adminUser = allUsers.find((u: any) => !u.deleted_at && (u.company_id === id || u.tenant_id === id) && u.role === 'TENANT_ADMIN');
      if (adminUser) {
        const passHash = bcrypt.hashSync(resetAdminPassword, 10);
        await updateRows('users', {
          password_hash: passHash,
          updated_at: now
        }, { filters: { id: adminUser.id } });

        await recordActivity(req, session, {
          activityType: 'USER_PASSWORD_RESET',
          details: `회원사 '${companyName}' 대표 관리자(${adminUser.login_id}) 비밀번호 초기화`
        });
        resetAdminSuccess = true;
      }
    }

    await recordActivity(req, session, {
      activityType: 'COMPANY_UPDATE',
      details: `회원사 정보 수정: '${companyName}' (${id})`
    });

    return NextResponse.json({
      success: true,
      resetAdminSuccess,
      message: '회원사 정보가 성공적으로 수정되었습니다.'
    });
  } catch (err: any) {
    console.error('PUT /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message || '회원사 정보 수정 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies
 * 회원사 서비스 정지 (소프트 삭제)
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ success: false, error: '최고관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ success: false, error: '정지할 회원사 ID가 필요합니다.' }, { status: 400 });
    }


    const now = new Date().toISOString();
    await updateRows('companies', {
      is_active: 0,
      deleted_at: now,
      deleted_by: session.userId,
      updated_at: now,
      updated_by: session.userId
    }, { filters: { id } });

    await recordActivity(req, session, {
      activityType: 'COMPANY_DELETE',
      details: `회원사 서비스 정지(소프트 삭제): ${id}`
    });

    return NextResponse.json({
      success: true,
      message: '회원사가 성공적으로 서비스 정지(비활성화) 처리되었습니다.'
    });
  } catch (err: any) {
    console.error('DELETE /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message || '회원사 비활성화 실패' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies
 * 정지된 회원사 복원
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ success: false, error: '최고관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = (body.id || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: '복원할 회원사 ID가 필요합니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows('companies', {
      is_active: 1,
      deleted_at: null,
      deleted_by: null,
      restored_at: now,
      restored_by: session.userId,
      updated_at: now,
      updated_by: session.userId
    }, { filters: { id } });

    await recordActivity(req, session, {
      activityType: 'COMPANY_RESTORE',
      details: `정지 회원사 서비스 정상 복원: ${id}`
    });

    return NextResponse.json({
      success: true,
      message: '회원사가 정상 가동 상태로 복원되었습니다.'
    });
  } catch (err: any) {
    console.error('PATCH /api/companies error:', err);
    return NextResponse.json({ success: false, error: err.message || '회원사 복원 실패' }, { status: 500 });
  }
}
