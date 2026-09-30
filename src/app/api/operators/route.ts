export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryTable, insertRows, updateRows } from '@/lib/db';
import { getSessionUser } from '@/lib/tenant';
import bcrypt from 'bcryptjs';
import { invalidateCasesCache } from '../quotation-cases/route';

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
 * - ?check_active_cases=[user_id]: 특정 사원의 진행 중인 활성 견적건 검사
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // [특정 사원의 진행 중인 견적건 조회 (인수인계 사전 검사)]
    const checkCasesUserId = searchParams.get('check_active_cases');
    if (checkCasesUserId) {
      const casesRes = await queryTable('quotation_cases');
      const allCases = normalizeRows(casesRes);
      const companiesRes = await queryTable('companies').catch(() => []);
      const allCompanies = normalizeRows(companiesRes);
      const companyMap = new Map(allCompanies.map((c: any) => [String(c.id), c.company_name]));

      const isCaseDeleted = (c: any) => Boolean(c.deleted_at) && c.deleted_at !== 'NULL' && c.deleted_at !== 'null';
      const activeCases = allCases.filter((c: any) =>
        String(c.created_by_user_id) === String(checkCasesUserId) &&
        !isCaseDeleted(c) &&
        c.lifecycle_status !== 'TRASHED' &&
        c.lifecycle_status !== 'ARCHIVED' &&
        c.status !== 'ARCHIVED' &&
        c.status !== 'DELETED'
      ).map((c: any) => ({
        id: c.id,
        case_no: c.case_no || '-',
        case_name: c.case_name || '무제 견적건',
        status: c.status || 'DRAFT',
        company_name: companyMap.get(String(c.company_id)) || c.company_name || '고객사 미지정',
        created_at: c.created_at || null,
      }));

      return NextResponse.json({
        success: true,
        active_cases_count: activeCases.length,
        active_cases: activeCases
      });
    }
    const requestedTenantId = searchParams.get('tenant_id');
    const includeDeleted = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN'
      ? searchParams.get('include_deleted') === 'true'
      : false;

    const [usersRes, casesRes] = await Promise.all([
      queryTable('users'),
      queryTable('quotation_cases').catch(() => [])
    ]);
    const allUsers = normalizeRows(usersRes);
    const allCases = normalizeRows(casesRes);

    // 진행 중인 활성 견적건 수 집계 (사원별)
    const isCaseDeleted = (c: any) => Boolean(c.deleted_at) && c.deleted_at !== 'NULL' && c.deleted_at !== 'null';
    const activeCasesCountMap = new Map<string, number>();
    for (const c of allCases) {
      if (
        c.created_by_user_id &&
        !isCaseDeleted(c) &&
        c.lifecycle_status !== 'TRASHED' &&
        c.lifecycle_status !== 'ARCHIVED' &&
        c.status !== 'ARCHIVED' &&
        c.status !== 'DELETED'
      ) {
        const uid = String(c.created_by_user_id);
        activeCasesCountMap.set(uid, (activeCasesCountMap.get(uid) || 0) + 1);
      }
    }

    // 1. 테넌트 스코프 적용
    let scopedUsers = allUsers;
    if (session.role === 'SUPER_ADMIN') {
      if (requestedTenantId && requestedTenantId !== 'ALL') {
        scopedUsers = allUsers.filter((u: any) => u.tenant_id === requestedTenantId || u.company_id === requestedTenantId);
      }
    } else {
      // TENANT_ADMIN 및 일반 사원(SALES_USER): 본인 테넌트 임직원 목록만 조회
      const myTenant = session.tenant_id || session.companyId || 'comp_unassigned';
      scopedUsers = allUsers.filter((u: any) => (u.tenant_id === myTenant || u.company_id === myTenant));
    }

    // 2. 삭제 상태 필터링 (기본: 활성 사용자만)
    if (!includeDeleted) {
      scopedUsers = scopedUsers.filter((u: any) => !u.deleted_at);
    }

    // 3. 보안을 위해 password_hash 제거 및 부서 필드 동적 정규화
    const isCandidateDept = (v: any) => v && typeof v === 'string' && !v.startsWith('comp_') && !v.startsWith('tenant-') && !v.startsWith('usr_');
    const safeUsers = scopedUsers.map((u: any) => {
      const { password_hash, ...rest } = u;
      const dept = isCandidateDept(u.tenant_id) ? u.tenant_id : (isCandidateDept(u.company_id) ? u.company_id : null);
      const activeCount = activeCasesCountMap.get(String(u.id)) || 0;
      return {
        ...rest,
        department: dept,
        active_cases_count: activeCount,
        // 호환 필드
        username: u.login_id,
        login_id: u.login_id,
        tenant_id: u.tenant_id || u.company_id || 'comp_unassigned',
        company_id: u.company_id || u.tenant_id || 'comp_unassigned',
        is_deleted: Boolean(u.deleted_at)
      };
    });

    // 4. 저장된 정렬 순서(MEMBERS_ORDER) 적용
    try {
      const settingsRes = await queryTable('system_settings').catch(() => []);
      const settingsRows = normalizeRows(settingsRes);
      const orderRow = settingsRows.find((r: any) => r.key === 'MEMBERS_ORDER');
      if (orderRow?.value) {
        const parsedOrder = typeof orderRow.value === 'string' ? JSON.parse(orderRow.value) : orderRow.value;
        if (Array.isArray(parsedOrder) && parsedOrder.length > 0) {
          const orderMap = new Map(parsedOrder.map((id: any, idx: number) => [String(id), idx]));
          safeUsers.sort((a: any, b: any) => {
            const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id))! : 999999;
            const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id))! : 999999;
            if (idxA !== idxB) return idxA - idxB;
            return (a.created_at || '').localeCompare(b.created_at || '');
          });
        }
      }
    } catch (orderErr) {
      console.warn('Failed to apply MEMBERS_ORDER sorting:', orderErr);
    }

    return NextResponse.json({ success: true, operators: safeUsers });
  } catch (error: any) {
    console.error('GET /api/operators error:', error);
    let msg = error.message || '임직원 목록을 불러오지 못했습니다.';
    if (msg.includes('X-Api-Key') || msg.toLowerCase().includes('unauthorized')) {
      msg = '데이터베이스 인증 연결을 확인 중입니다. 잠시 후 [새로고침]을 눌러주세요.';
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/operators
 * 신규 임직원 등록 및 순서 변경(REORDER)
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '운영자 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();

    // [사원 표시 순서 일괄 저장 (REORDER) 처리]
    if (body.action === 'REORDER') {
      const newOrder = body.newOrder;
      if (!Array.isArray(newOrder)) {
        return NextResponse.json({ success: false, error: '유효하지 않은 순서 데이터입니다.' }, { status: 400 });
      }

      const jsonStr = JSON.stringify(newOrder);
      const now = new Date().toISOString();
      const settingsRes = await queryTable('system_settings');
      const rows = normalizeRows(settingsRes);
      const existing = rows.find((r: any) => r.key === 'MEMBERS_ORDER');

      if (existing) {
        await updateRows(
          'system_settings',
          { value: jsonStr, updated_at: now, updated_by: session.loginId || session.name },
          { filters: { key: 'MEMBERS_ORDER' } }
        );
      } else {
        const newId = `set_${Date.now()}`;
        await insertRows('system_settings', [{
          id: newId,
          key: 'MEMBERS_ORDER',
          value: jsonStr,
          tenant_id: 'tenant-cadon',
          description: '사내 임직원 표시 순서',
          updated_at: now,
          updated_by: session.loginId || session.name
        }]);
      }

      return NextResponse.json({ success: true, message: '사원 표시 순서가 저장되었습니다.' });
    }
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
        return NextResponse.json({ success: false, error: '해당 회원사에 이미 존재하는 사원번호입니다.' }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const dateStr = new Date().toISOString();
    const newUserId = `usr_${Date.now()}`;

    const isDept = Boolean(tenantId && !tenantId.startsWith('comp_') && !tenantId.startsWith('tenant-') && !tenantId.startsWith('usr_'));
    const companyIdToUse = isDept ? 'comp_1789386587951' : (tenantId || 'comp_1789386587951');

    await insertRows('users', [{
      id: newUserId,
      login_id: loginId,
      password_hash: passwordHash,
      name,
      role,
      company_id: companyIdToUse,
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
            error: `소속 회원사의 대표 관리자(${suspendedOwner.name}) 계정이 정지 상태입니다. 대표 관리자부터 먼저 복원해 주세요.`
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
        return NextResponse.json({ success: false, error: '해당 회원사에 이미 존재하는 사원번호입니다.' }, { status: 400 });
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
      const isDept = Boolean(assignedTenant && !assignedTenant.startsWith('comp_') && !assignedTenant.startsWith('tenant-') && !assignedTenant.startsWith('usr_'));
      if (!isDept) {
        updates.company_id = assignedTenant;
      } else if (!targetUser.company_id || targetUser.company_id === 'comp_unassigned') {
        updates.company_id = 'comp_1789386587951';
      }
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
    let id = searchParams.get('id');
    let successorId = searchParams.get('successor_id');

    // JSON 본문 지원 (body에 전달된 경우)
    if (req.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = await req.json();
        if (body.id) id = body.id;
        if (body.successor_id) successorId = body.successor_id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ success: false, error: '사용자 ID가 누락되었습니다.' }, { status: 400 });
    }

    const allUsers = normalizeRows(await queryTable('users'));
    const targetUser = allUsers.find((u: any) => String(u.id) === String(id));

    if (!targetUser) {
      return NextResponse.json({ success: false, error: '존재하지 않는 사용자 계정입니다.' }, { status: 404 });
    }

    // 관리자 자신 스스로 삭제 차단
    if (String(targetUser.id) === String(session.userId) || targetUser.login_id === session.loginId) {
      return NextResponse.json({ success: false, error: '현재 로그인 중인 본인 계정은 비활성화할 수 없습니다.' }, { status: 400 });
    }

    // 시스템 기본 최고관리자 admin 삭제 차단
    if (targetUser.login_id === 'admin') {
      return NextResponse.json({ success: false, error: '시스템 최고관리자(admin) 계정은 비활성화할 수 없습니다.' }, { status: 400 });
    }

    // 1. 진행 중인 활성 견적건 검사
    const casesRes = await queryTable('quotation_cases');
    const allCases = normalizeRows(casesRes);
    const isCaseDeleted = (c: any) => Boolean(c.deleted_at) && c.deleted_at !== 'NULL' && c.deleted_at !== 'null';
    const activeCases = allCases.filter((c: any) =>
      String(c.created_by_user_id) === String(id) &&
      !isCaseDeleted(c) &&
      c.lifecycle_status !== 'TRASHED' &&
      c.lifecycle_status !== 'ARCHIVED' &&
      c.status !== 'ARCHIVED' &&
      c.status !== 'DELETED'
    );

    // 진행 중인 견적건이 있는데 후임자 지정이 없는 경우: 인수인계 모달 팝업 요청 반환
    if (activeCases.length > 0 && !successorId) {
      return NextResponse.json({
        success: false,
        require_handover: true,
        active_cases_count: activeCases.length,
        error: `'${targetUser.name}' 담당자가 진행 중인 견적건이 ${activeCases.length}건 있습니다. 업무를 인수인계할 후임 담당자를 지정해 주세요.`
      }, { status: 400 });
    }

    const dateStr = new Date().toISOString();

    // 2. 후임자가 지정된 경우: 진행 중인 견적건 및 관련 견적서 담당자 일괄 이관
    if (successorId) {
      if (String(successorId) === String(id)) {
        return NextResponse.json({ success: false, error: '자기 자신에게는 업무를 인수인계할 수 없습니다.' }, { status: 400 });
      }

      const successor = allUsers.find((u: any) => String(u.id) === String(successorId) && !u.deleted_at);
      if (!successor) {
        return NextResponse.json({ success: false, error: '인수인계할 후임 담당자 계정이 유효하지 않거나 비활성화 상태입니다.' }, { status: 400 });
      }

      // (1) 진행 중인 견적건(quotation_cases) 담당자를 후임자로 이관
      for (const c of activeCases) {
        await updateRows('quotation_cases', {
          created_by_user_id: String(successor.id),
          updated_at: dateStr,
          updated_by: session.loginId || session.name
        }, { filters: { id: String(c.id) } });
      }

      // (2) 해당 활성 견적건에 종속된 견적서(quotes) 담당자도 동기화
      const activeCaseIds = new Set(activeCases.map((c: any) => String(c.id)));
      try {
        const quotesRes = await queryTable('quotes');
        const allQuotes = normalizeRows(quotesRes);
        const relatedQuotes = allQuotes.filter((q: any) =>
          activeCaseIds.has(String(q.quotation_case_id)) || String(q.created_by_user_id) === String(id)
        );
        for (const q of relatedQuotes) {
          await updateRows('quotes', {
            created_by_user_id: String(successor.id),
            updated_at: dateStr,
            updated_by: session.loginId || session.name
          }, { filters: { id: String(q.id) } });
        }
      } catch (qErr) {
        console.warn('Quotes transfer warning during member deactivation:', qErr);
      }

      try {
        invalidateCasesCache();
      } catch {}
    }

    // 3. 소프트 삭제(Soft Delete) 수행
    // 과거 완료/보관된 견적건은 원본 작성자(targetUser.id)가 그대로 유지되어 이력 및 감사 데이터가 100% 보존됩니다.
    await updateRows('users', {
      is_active: 0,
      deleted_at: dateStr,
      deleted_by: session.loginId || session.name,
      updated_at: dateStr
    }, { filters: { id: String(id) } });

    const message = successorId && activeCases.length > 0
      ? `'${targetUser.name}' 담당자의 진행 견적 ${activeCases.length}건이 성공적으로 이관되었으며, 계정이 비활성화되었습니다.`
      : `'${targetUser.name}' 계정이 비활성화되었습니다.`;

    return NextResponse.json({
      success: true,
      message,
      transferred_count: activeCases.length
    });
  } catch (error: any) {
    console.error('DELETE /api/operators error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
