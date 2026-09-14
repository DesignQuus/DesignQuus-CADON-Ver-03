import { SignJWT } from 'jose';
import { queryTable, deleteRows, updateRows } from '../egdesk-helpers';

const PORT = process.env.PORT || '4004';
const BASE_URL = `http://localhost:${PORT}`;
const JWT_SECRET = new TextEncoder().encode('cadon-bom-secret-key-super-secure-production-2026');

async function createTestAdminToken() {
  return new SignJWT({
    userId: 'usr_admin',
    loginId: 'admin',
    name: '시스템 최고관리자',
    role: 'SUPER_ADMIN',
    tenant_id: 'tenant-cadon',
    companyId: 'tenant-cadon'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);
}

async function runPhase3Test() {
  console.log('=== [PHASE 3: OPERATORS API VERIFICATION] ===');

  const adminToken = await createTestAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `auth_token=${adminToken}; cadon_session=${adminToken}`
  };

  const testTenant = 'tenant_test_corp';
  const ownerEmpNum = 'EMP-TEST-001';
  const staffEmpNum = 'EMP-TEST-002';
  const ownerLogin = 'test_boss_' + Date.now();
  const staffLogin = 'test_staff_' + Date.now();

  let ownerId = '';
  let staffId = '';

  try {
    // 1. 대표 관리자 등록 (POST)
    console.log('\n--- 1. Registering Tenant Admin (대표 관리자) ---');
    const resOwner = await fetch(`${BASE_URL}/api/operators`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        login_id: ownerLogin,
        password: 'Password123!',
        name: '테스트 대표이사',
        role: 'TENANT_ADMIN',
        employee_number: ownerEmpNum,
        phone: '010-1111-2222',
        tenant_id: testTenant
      })
    });
    const ownerData = await resOwner.json();
    console.log('Register owner response:', ownerData);
    if (!ownerData.success) throw new Error(`Owner creation failed: ${ownerData.error}`);
    ownerId = ownerData.id;
    console.log('✓ Registered Tenant Admin ID:', ownerId);

    // 2. 사원 등록 (POST)
    console.log('\n--- 2. Registering Staff Member (일반 영업 사원) ---');
    const resStaff = await fetch(`${BASE_URL}/api/operators`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        login_id: staffLogin,
        password: 'Password123!',
        name: '테스트 영업사원',
        role: 'SALES_USER',
        employee_number: staffEmpNum,
        phone: '010-3333-4444',
        tenant_id: testTenant
      })
    });
    const staffData = await resStaff.json();
    console.log('Register staff response:', staffData);
    if (!staffData.success) throw new Error(`Staff creation failed: ${staffData.error}`);
    staffId = staffData.id;
    console.log('✓ Registered Staff Member ID:', staffId);

    // 3. 사원번호 중복 등록 방어 검증
    console.log('\n--- 3. Testing Duplicate Employee Number Prevention ---');
    const resDup = await fetch(`${BASE_URL}/api/operators`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        login_id: 'dup_user_' + Date.now(),
        password: 'Password123!',
        name: '중복 사원',
        role: 'SALES_USER',
        employee_number: ownerEmpNum, // 중복된 사원번호
        tenant_id: testTenant
      })
    });
    const dupData = await resDup.json();
    console.log('Duplicate check response (should fail):', dupData);
    if (dupData.success || !dupData.error.includes('사원번호')) {
      throw new Error('Duplicate employee number was not prevented!');
    }
    console.log('✅ Duplicate employee number successfully blocked: PASS');

    // 4. 목록 조회 (GET) 및 비밀번호 마스킹 확인
    console.log('\n--- 4. Testing GET /api/operators ---');
    const resGet = await fetch(`${BASE_URL}/api/operators?tenant_id=${testTenant}`, {
      method: 'GET',
      headers
    });
    const getData = await resGet.json();
    console.log('Retrieved operators count:', getData.operators?.length);
    const retrievedStaff = getData.operators?.find((o: any) => o.id === staffId);
    if (!retrievedStaff) throw new Error('Registered staff not found in list');
    if (retrievedStaff.password_hash) throw new Error('Security violation: password_hash was leaked!');
    console.log('✓ Staff retrieved without password_hash:', retrievedStaff.name, retrievedStaff.role);
    console.log('✅ GET list & security check: PASS');

    // 5. 대표 관리자 및 사원 소프트 삭제 (DELETE)
    console.log('\n--- 5. Soft-deleting Owner and Staff ---');
    const resDelOwner = await fetch(`${BASE_URL}/api/operators?id=${ownerId}`, {
      method: 'DELETE',
      headers
    });
    console.log('Delete owner response:', await resDelOwner.json());

    const resDelStaff = await fetch(`${BASE_URL}/api/operators?id=${staffId}`, {
      method: 'DELETE',
      headers
    });
    console.log('Delete staff response:', await resDelStaff.json());

    // 6. 대표 정지 시 사원 단독 복원 차단 (RESTORE Guard) 검증
    console.log('\n--- 6. Testing Dependency Restore Guard (Owner Suspended) ---');
    const resRestoreBlocked = await fetch(`${BASE_URL}/api/operators`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: staffId,
        action: 'RESTORE'
      })
    });
    const restoreBlockedData = await resRestoreBlocked.json();
    console.log('Restore blocked response (should fail):', restoreBlockedData);
    if (restoreBlockedData.success || !restoreBlockedData.error.includes('대표 관리자')) {
      throw new Error('Staff was restored while owner was suspended!');
    }
    console.log('✅ Restore guard successfully blocked staff restore: PASS');

    // 7. 대표 관리자 복원 후 사원 복원 성공 검증
    console.log('\n--- 7. Restoring Owner then Staff ---');
    const resRestoreOwner = await fetch(`${BASE_URL}/api/operators`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: ownerId,
        action: 'RESTORE'
      })
    });
    const restoreOwnerData = await resRestoreOwner.json();
    console.log('Restore owner response:', restoreOwnerData);
    if (!restoreOwnerData.success) throw new Error('Failed to restore owner');

    const resRestoreStaff = await fetch(`${BASE_URL}/api/operators`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: staffId,
        action: 'RESTORE'
      })
    });
    const restoreStaffData = await resRestoreStaff.json();
    console.log('Restore staff response:', restoreStaffData);
    if (!restoreStaffData.success) throw new Error('Failed to restore staff after owner was restored');
    console.log('✅ Dependency restore workflow: PASS');

    console.log('\n=== [PHASE 3 ALL TESTS PASSED] ===');
  } finally {
    // Clean up test users
    console.log('\n--- Cleaning up test records ---');
    if (ownerId) await deleteRows('users', { filters: { id: ownerId } });
    if (staffId) await deleteRows('users', { filters: { id: staffId } });
    console.log('✓ Test records cleaned up.');
  }
}

runPhase3Test().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
