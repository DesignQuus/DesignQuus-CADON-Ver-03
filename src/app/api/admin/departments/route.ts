export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { queryTable, insertRows, updateRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

const DEFAULT_DEPARTMENTS = [
  '시스템운영본부',
  '견적영업부',
  '가공기술부',
  '설계품질부',
  '경영지원부'
];

function normalizeRows(res: any): any[] {
  if (Array.isArray(res)) return res;
  return res?.rows || [];
}

async function getStoredDepartments(): Promise<string[]> {
  try {
    const res = await queryTable('system_settings');
    const rows = normalizeRows(res);
    const row = rows.find((r: any) => r.key === 'COMPANY_DEPARTMENTS');
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse COMPANY_DEPARTMENTS, using defaults:', e);
  }
  return DEFAULT_DEPARTMENTS;
}

async function saveDepartments(departments: string[], sessionUser?: string) {
  const jsonStr = JSON.stringify(departments);
  const now = new Date().toISOString();
  const res = await queryTable('system_settings');
  const rows = normalizeRows(res);
  const existing = rows.find((r: any) => r.key === 'COMPANY_DEPARTMENTS');

  if (existing) {
    await updateRows(
      'system_settings',
      { value: jsonStr, updated_at: now, updated_by: sessionUser || 'admin' },
      { filters: { key: 'COMPANY_DEPARTMENTS' } }
    );
  } else {
    const newId = `set_${Date.now()}`;
    await insertRows('system_settings', [{
      id: newId,
      key: 'COMPANY_DEPARTMENTS',
      value: jsonStr,
      tenant_id: 'tenant-cadon',
      description: '사내 소속 부서 목록',
      updated_at: now,
      updated_by: sessionUser || 'admin'
    }]);
  }
}

/**
 * GET /api/admin/departments
 * 사내 부서 목록 및 각 부서별 활성 사원수 조회
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const departments = await getStoredDepartments();
    const usersRes = await queryTable('users');
    const allUsers = normalizeRows(usersRes);
    const activeUsers = allUsers.filter((u: any) => !u.deleted_at && !u.is_deleted && u.is_active != 0);

    const deptCounts: Record<string, number> = {};
    for (const d of departments) {
      deptCounts[d] = 0;
    }

    for (const u of activeUsers) {
      if (u.tenant_id && deptCounts[u.tenant_id] !== undefined) {
        deptCounts[u.tenant_id]++;
      }
    }

    const result = departments.map((d) => ({
      name: d,
      memberCount: deptCounts[d] || 0
    }));

    return NextResponse.json({
      success: true,
      departments: result,
      names: departments
    });
  } catch (error: any) {
    console.error('GET /api/admin/departments error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/departments
 * 부서 추가, 부서명 수정, 부서 삭제
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role)) {
      return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { action, name, oldName, newName } = body;
    let departments = await getStoredDepartments();

    if (action === 'ADD') {
      const trimmed = (name || '').trim();
      if (!trimmed) {
        return NextResponse.json({ success: false, error: '부서명을 입력해주세요.' }, { status: 400 });
      }
      if (departments.includes(trimmed)) {
        return NextResponse.json({ success: false, error: '이미 존재하는 부서명입니다.' }, { status: 400 });
      }
      departments.push(trimmed);
      await saveDepartments(departments, session.loginId);

      await recordActivity(req, session, {
        activityType: 'ROLE_UPDATE',
        details: `신규 부서 '${trimmed}' 추가 등록 완료`
      });

      return NextResponse.json({ success: true, message: `'${trimmed}' 부서가 등록되었습니다.`, departments });
    }

    if (action === 'RENAME') {
      const from = (oldName || '').trim();
      const to = (newName || '').trim();
      if (!from || !to) {
        return NextResponse.json({ success: false, error: '기존 부서명과 새 부서명을 모두 입력해주세요.' }, { status: 400 });
      }
      if (from === to) {
        return NextResponse.json({ success: true, departments });
      }
      if (departments.includes(to)) {
        return NextResponse.json({ success: false, error: `이미 '${to}' 부서가 존재합니다.` }, { status: 400 });
      }

      departments = departments.map((d) => (d === from ? to : d));
      await saveDepartments(departments, session.loginId);

      // 소속 사원들의 부서명(tenant_id)도 일괄 갱신
      const usersRes = await queryTable('users');
      const allUsers = normalizeRows(usersRes);
      const toUpdate = allUsers.filter((u: any) => u.tenant_id === from);
      if (toUpdate.length > 0) {
        await updateRows(
          'users',
          { tenant_id: to },
          { filters: { tenant_id: from } }
        );
      }

      await recordActivity(req, session, {
        activityType: 'ROLE_UPDATE',
        details: `부서명 변경: '${from}' → '${to}' (소속 사원 ${toUpdate.length}명 동기화 완료)`
      });

      return NextResponse.json({ success: true, message: `'${from}' 부서가 '${to}'(으)로 변경되었습니다.`, departments });
    }

    if (action === 'DELETE') {
      const target = (name || '').trim();
      if (!target) {
        return NextResponse.json({ success: false, error: '삭제할 부서명을 지정해주세요.' }, { status: 400 });
      }

      // 소속 활성 사원 수 확인
      const usersRes = await queryTable('users');
      const allUsers = normalizeRows(usersRes);
      const activeMembers = allUsers.filter((u: any) => u.tenant_id === target && !u.deleted_at && !u.is_deleted);
      if (activeMembers.length > 0) {
        return NextResponse.json({
          success: false,
          error: `'${target}' 부서에 소속된 사원이 ${activeMembers.length}명 있습니다. 먼저 사원의 소속 부서를 변경한 후 삭제해 주세요.`
        }, { status: 400 });
      }

      departments = departments.filter((d) => d !== target);
      if (departments.length === 0) {
        return NextResponse.json({ success: false, error: '최소 1개 이상의 부서가 유지되어야 합니다.' }, { status: 400 });
      }

      await saveDepartments(departments, session.loginId);

      await recordActivity(req, session, {
        activityType: 'ROLE_UPDATE',
        details: `부서 '${target}' 삭제 완료`
      });

      return NextResponse.json({ success: true, message: `'${target}' 부서가 삭제되었습니다.`, departments });
    }

    if (action === 'REORDER') {
      const { newOrder } = body;
      if (!Array.isArray(newOrder) || newOrder.length === 0) {
        return NextResponse.json({ success: false, error: '유효한 부서 순서 목록이 아닙니다.' }, { status: 400 });
      }

      const validNames = newOrder.map((s: any) => String(s).trim()).filter(Boolean);
      const uniqueNames = Array.from(new Set(validNames));

      for (const d of departments) {
        if (!uniqueNames.includes(d)) {
          uniqueNames.push(d);
        }
      }

      departments = uniqueNames;
      await saveDepartments(departments, session.loginId);

      await recordActivity(req, session, {
        activityType: 'ROLE_UPDATE',
        details: '부서 표시 순서 변경 완료'
      });

      return NextResponse.json({ success: true, message: '부서 순서가 저장되었습니다.', departments });
    }

    return NextResponse.json({ success: false, error: '유효하지 않은 액션입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('POST /api/admin/departments error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
