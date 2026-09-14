export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryTable, insertRows, updateRows } from '../../../../egdesk-helpers';
import { getSessionUser } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

function normalizeRows(res: any): any[] {
  if (Array.isArray(res)) return res;
  return res?.rows || [];
}

/**
 * GET /api/operators
 * 임직원 및 운영자 계정 목록 조회
 * - SUPER_ADMIN: 전체 테넌트 조회 가능 (또는 ?tenant_id= 로 필터링)
 * - TENANT_ADMIN: 본인 소속 tenant_id로 강제 스코프 제한
 * - ?include_deleted=true: 소프트 삭제된 계정 포함 여부
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '운영자 관리 권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const requestedTenantId = searchParams.get('tenant_id');
    const includeDeleted = searchParams.get('include_deleted') === 'true';

    const usersRes = await queryTable('users');
    const allUsers = normalizeRows(usersRes);

    // 1. 테넌트 스코프 적용
    let scopedUsers = allUsers;
    if (session.role === 'SUPER_ADMIN') {
      if (requestedTenantId && requestedTenantId !== 'ALL') {
        scopedUsers = allUsers.filter((u: any) => u.tenant_id === requestedTenantId || u.company_id === requestedTenantId);
      }
    } else {
      // TENANT_ADMIN: 본인 테넌트만
      const myTenant = session.tenant_id || session.companyId || 'comp_unassigned';
      scopedUsers = allUsers.filter((u: any) => (u.tenant_id === myTenant || u.company_id === myTenant));
    }

    // 2. 삭제 상태 필터링 (기본: 활성 사용자만)
    if (!includeDeleted) {
      scopedUsers = scopedUsers.filter((u: any) => !u.deleted_at);
    }

    // 3. 보안을 위해 password_hash 제거
    const safeUsers = scopedUsers.map((u: any) => {
      const { password_hash, ...rest } = u;
      return {
        ...rest,
        // 호환 필드
        username: u.login_id,
        login_id: u.login_id,
        tenant_id: u.tenant_id || u.company_id || 'comp_unassigned',
        company_id: u.company_id || u.tenant_id || 'comp_unassigned',
        is_deleted: Boolean(u.deleted_at)
      };
    });

    return NextResponse.json({ success: true, operators: safeUsers });
  } catch (error: any) {
    console.error('GET /api/operators error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/operators
 * 신규 임직원 등록
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '운영자 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const loginId = (body.login_id || body.username || '').trim();
    const password = (body.password || '').trim();
    const name = (body.name || '').trim();
    const role = (body.role || body.newRole || 'SALES_USER').toUpperCase();
    const employeeNumber = (body.employee_number || '').trim();
    const phone = (body.phone || '').trim();
    let tenantId = (body.tenant_id || body.company_id || '').trim();

    if (!loginId || !password || !name) {
      return NextResponse.json({ success: false, error: '아이디, 비밀번호, 이름은 필수 입력값입니다.' }, { status: 400 });
    }

    // 권한별 테넌트 할당
    if (session.role !== 'SUPER_ADMIN') {
      tenantId = session.tenant_id || session.companyId || 'comp_unassigned';
    } else if (!tenantId) {
      tenantId = 'comp_unassigned';
    }

    // 아이디 중복 체크 (활성 사용자 기준)
    const existingUsers = normalizeRows(await queryTable('users'));
    const isLoginDuplicate = existingUsers.some((u: any) => !u.deleted_at && u.login_id === loginId);
    if (isLoginDuplicate) {
      return NextResponse.json({ success: false, error: '이미 존재하는 아이디입니다.' }, { status: 400 });
    }

    // 사원번호 자동 부여 (선택 입력)
    let finalEmployeeNumber = employeeNumber;
    if (!finalEmployeeNumber) {
      const baseEmpNum = `EMP-${loginId}`;
      const existsInTenant = existingUsers.some(
        (u: any) => !u.deleted_at && u.employee_number === baseEmpNum && (u.tenant_id === tenantId || u.company_id === tenantId)
      );
      finalEmployeeNumber = existsInTenant ? `EMP-${loginId}-${Date.now().toString().slice(-4)}` : baseEmpNum;
    } else {
      // 직접 입력한 경우 사원번호 중복 체크 (해당 테넌트 내 활성 사용자 기준)
      const isEmpNumDuplicate = existingUsers.some(
        (u: any) => !u.deleted_at && u.employee_number === finalEmployeeNumber && (u.tenant_id === tenantId || u.company_id === tenantId)
      );
      if (isEmpNumDuplicate) {
        return NextResponse.json({ success: false, error: '해당 회사/테넌트에 이미 존재하는 사원번호입니다.' }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const dateStr = new Date().toISOString();
    const newUserId = `usr_${Date.now()}`;

    await insertRows('users', [{
      id: newUserId,
      login_id: loginId,
      password_hash: passwordHash,
      name,
      role,
      company_id: tenantId,
      tenant_id: tenantId,
      employee_number: finalEmployeeNumber,
      phone,
      is_active: 1,
      uuid: newUserId,
      created_at: dateStr,
      updated_at: dateStr
    }]);

    return NextResponse.json({ success: true, message: '임직원 계정이 등록되었습니다.', id: newUserId });
  } catch (error: any) {
    console.error('POST /api/operators error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/operators
 * 임직원 정보 수정 및 복원(RESTORE)
 */
export async function PUT(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '운영자 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { id, action, password, name, role, newRole, employee_number, phone, tenant_id, company_id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '사용자 ID가 누락되었습니다.' }, { status: 400 });
    }

    const allUsers = normalizeRows(await queryTable('users'));
    const targetUser = allUsers.find((u: any) => String(u.id) === String(id));

    if (!targetUser) {
      return NextResponse.json({ success: false, error: '존재하지 않는 사용자 계정입니다.' }, { status: 404 });
    }

    // [복원 (RESTORE) 액션 처리]
    if (action === 'RESTORE') {
      const isOwnerRole = ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(String(targetUser.role || '').toUpperCase());
      const targetTenant = targetUser.tenant_id || targetUser.company_id;

      // 종속성 복원 가드: 사원 복원 시 소속 테넌트의 대표 관리자가 정지 상태이면 복원 차단
      if (!isOwnerRole && targetTenant && targetTenant !== 'comp_unassigned') {
        const tenantOwners = allUsers.filter((u: any) => {
          const uRole = String(u.role || '').toUpperCase();
          const uTenant = u.tenant_id || u.company_id;
          return uRole === 'TENANT_ADMIN' && uTenant === targetTenant;
        });

        const hasActiveOwner = tenantOwners.some((o: any) => !o.deleted_at);
        if (tenantOwners.length > 0 && !hasActiveOwner) {
          const suspendedOwner = tenantOwners[0];
          return NextResponse.json({
            success: false,
            error: `소속 회사/테넌트의 대표 관리자(${suspendedOwner.name}) 계정이 정지 상태입니다. 대표 관리자부터 먼저 복원해 주세요.`
          }, { status: 400 });
        }
      }

      const dateStr = new Date().toISOString();
      await updateRows('users', {
        is_active: 1,
        deleted_at: null,
        deleted_by: null,
        restored_at: dateStr,
        restored_by: session.loginId || session.name,
        updated_at: dateStr
      }, { filters: { id: String(id) } });

      return NextResponse.json({ success: true, message: '계정이 성공적으로 복원되었습니다.' });
    }

    // 일반 수정 처리
    if (targetUser.login_id === 'admin' && (newRole || role) && (newRole || role) !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: '시스템 최고관리자(admin)의 역할 등급은 변경할 수 없습니다.' }, { status: 400 });
    }

    // 사원번호 중복 검증
    let finalEmpNumber = (employee_number || targetUser.employee_number || '').trim();
    if (targetUser.login_id === 'admin' && !finalEmpNumber) {
      finalEmpNumber = 'EMP-ADMIN';
    }

    if (finalEmpNumber) {
      const finalTenant = tenant_id || company_id || targetUser.tenant_id || targetUser.company_id;
      const isDupEmp = allUsers.some(
        (u: any) => !u.deleted_at && String(u.id) !== String(id) && u.employee_number === finalEmpNumber && (u.tenant_id === finalTenant || u.company_id === finalTenant)
      );
      if (isDupEmp) {
        return NextResponse.json({ success: false, error: '해당 회사/테넌트에 이미 존재하는 사원번호입니다.' }, { status: 400 });
      }
    }

    const dateStr = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: dateStr,
      updated_by: session.loginId
    };

    if (name) updates.name = name.trim();
    if (newRole || role) updates.role = (newRole || role).toUpperCase();
    if (employee_number !== undefined) updates.employee_number = finalEmpNumber;
    if (phone !== undefined) updates.phone = (phone || '').trim();
    if (tenant_id !== undefined || company_id !== undefined) {
      const assignedTenant = (tenant_id || company_id || '').trim() || null;
      updates.tenant_id = assignedTenant;
      updates.company_id = assignedTenant;
    }

    // 비밀번호 변경
    if (password && password.trim() !== '') {
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    await updateRows('users', updates, { filters: { id: String(id) } });

    return NextResponse.json({ success: true, message: '임직원 정보가 수정되었습니다.' });
  } catch (error: any) {
    console.error('PUT /api/operators error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/operators
 * 소프트 삭제(Soft Delete)
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '운영자 관리 권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is missing' }, { status: 400 });
    }

    const allUsers = normalizeRows(await queryTable('users'));
    const targetUser = allUsers.find((u: any) => String(u.id) === String(id));

    if (!targetUser) {
      return NextResponse.json({ success: false, error: '존재하지 않는 사용자 계정입니다.' }, { status: 404 });
    }

    // 관리자 자신 스스로 삭제 차단
    if (String(targetUser.id) === String(session.userId) || targetUser.login_id === session.loginId) {
      return NextResponse.json({ success: false, error: '현재 로그인 중인 본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    // 시스템 기본 최고관리자 admin 삭제 차단
    if (targetUser.login_id === 'admin') {
      return NextResponse.json({ success: false, error: '시스템 최고관리자(admin) 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    // 소프트 삭제(Soft Delete) 수행
    const dateStr = new Date().toISOString();
    await updateRows('users', {
      is_active: 0,
      deleted_at: dateStr,
      deleted_by: session.loginId || session.name,
      updated_at: dateStr
    }, { filters: { id: String(id) } });

    return NextResponse.json({ success: true, message: '계정이 비활성화(소프트 삭제)되었습니다.' });
  } catch (error: any) {
    console.error('DELETE /api/operators error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
