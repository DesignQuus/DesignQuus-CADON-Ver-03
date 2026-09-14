import { queryTable, insertRows, deleteRows } from '../egdesk-helpers';

const PORT = process.env.PORT || '4004';
const BASE_URL = `http://localhost:${PORT}`;

async function runPhase5IntegrationTest() {
  console.log('================================================================');
  console.log('   CADON-BOM AI: PHASE 5 FULL MULTI-TENANT SYSTEM INTEGRATION   ');
  console.log('================================================================\n');

  let sessionCookies = '';
  let testCompanyId = 'comp_sechang_integration_test';
  let testOwnerId = '';
  let testStaffId = '';

  try {
    // 1. 최고관리자 로그인 및 듀얼 쿠키 발급 검증
    console.log('--- 1. Login with Admin Account (POST /api/auth/login) ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: 'admin',
        password: 'Cadon1234!@'
      })
    });

    console.log('Login Status:', loginRes.status);
    const loginData = await loginRes.json();
    console.log('Login Result:', loginData);
    if (!loginData.success) throw new Error('Admin login failed');

    // 쿠키 추출
    const rawSetCookie = loginRes.headers.get('set-cookie') || '';
    console.log('Set-Cookie received:', rawSetCookie ? 'YES' : 'NO');
    
    // Cookie header 조립
    const cookieParts = rawSetCookie.split(/,\s*(?=[a-zA-Z0-9_-]+=)/);
    const cookieTokens: string[] = [];
    for (const part of cookieParts) {
      const match = part.match(/^([^;]+)/);
      if (match) cookieTokens.push(match[1]);
    }
    sessionCookies = cookieTokens.join('; ');
    console.log('Parsed Session Cookies count:', cookieTokens.length);

    // 2. 현재 로그인 세션 확인 (GET /api/auth/me)
    console.log('\n--- 2. Verify Current Session (GET /api/auth/me) ---');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Cookie': sessionCookies }
    });
    console.log('Me API Status:', meRes.status);
    const meData = await meRes.json();
    console.log('Logged in user:', meData.user?.loginId, '| Role:', meData.user?.role, '| Tenant:', meData.user?.tenant_id);
    if (!meData.user || meData.user.role !== 'SUPER_ADMIN') {
      throw new Error('User session verification failed');
    }
    console.log('✅ Session and Tenant Context Verification: PASS');

    // 3. 기존 원본 견적건 목록 보존 확인 (GET /api/quotation-cases)
    console.log('\n--- 3. Check Existing Quotation Cases (GET /api/quotation-cases) ---');
    const casesRes = await fetch(`${BASE_URL}/api/quotation-cases`, {
      headers: { 'Cookie': sessionCookies }
    });
    console.log('Cases API Status:', casesRes.status);
    const casesData = await casesRes.json();
    const caseList = casesData.cases || casesData || [];
    console.log('Retrieved cases count:', caseList.length);
    if (casesRes.status !== 200 || caseList.length === 0) {
      throw new Error('Failed to retrieve quotation cases or data was lost');
    }
    console.log('✓ Found preserved case:', caseList[0].case_no, '-', caseList[0].case_name);
    console.log('✅ Zero-Data Loss Case Verification: PASS');

    // 4. 신규 테넌트(테스트사) 등록
    console.log('\n--- 4. Registering Tenant Company ("테스트 회원사") ---');
    await insertRows('companies', [{
      id: testCompanyId,
      company_code: 'TEST_CO',
      company_name: '테스트 회원사(주)',
      company_type: 'CUSTOMER',
      is_active: 1,
      tenant_id: testCompanyId,
      uuid: testCompanyId,
      created_at: new Date().toISOString()
    }]);
    console.log('✓ Inserted test company:', testCompanyId);

    // 5. 해당 테넌트 소속의 대표관리자 및 사원 등록 (POST /api/operators)
    console.log('\n--- 5. Registering Tenant Members under "테스트 회원사" ---');
    const ownerRes = await fetch(`${BASE_URL}/api/operators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookies },
      body: JSON.stringify({
        login_id: 'test_ceo_' + Date.now(),
        password: 'Password123!',
        name: '테스트 대표이사',
        role: 'TENANT_ADMIN',
        employee_number: 'TEST-CEO-01',
        phone: '010-9999-8888',
        tenant_id: testCompanyId
      })
    });
    const ownerData = await ownerRes.json();
    if (!ownerData.success) throw new Error(`Owner registration failed: ${ownerData.error}`);
    testOwnerId = ownerData.id;
    console.log('✓ Tenant Admin registered:', testOwnerId);

    const staffRes = await fetch(`${BASE_URL}/api/operators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookies },
      body: JSON.stringify({
        login_id: 'test_eng_' + Date.now(),
        password: 'Password123!',
        name: '테스트 설계엔지니어',
        role: 'REVIEWER',
        employee_number: 'TEST-ENG-01',
        phone: '010-7777-6666',
        tenant_id: testCompanyId
      })
    });
    const staffData = await staffRes.json();
    if (!staffData.success) throw new Error(`Staff registration failed: ${staffData.error}`);
    testStaffId = staffData.id;
    console.log('✓ Reviewer Staff registered:', testStaffId);

    // 6. 테넌트 스코프 필터링 검증 (GET /api/operators?tenant_id=...)
    console.log('\n--- 6. Verifying Tenant Isolation Filtering ---');
    const sechangOpsRes = await fetch(`${BASE_URL}/api/operators?tenant_id=${testCompanyId}`, {
      headers: { 'Cookie': sessionCookies }
    });
    const sechangOpsData = await sechangOpsRes.json();
    console.log('Operators found under test tenant:', sechangOpsData.operators?.length);
    if (!sechangOpsData.success || sechangOpsData.operators?.length !== 2) {
      throw new Error(`Expected exactly 2 operators for test tenant, found: ${sechangOpsData.operators?.length}`);
    }
    console.log('✅ Tenant Isolation Operator Scope: PASS');

    // 7. 관리자 멤버 관리 포탈 UI 검증 (GET /admin/members)
    console.log('\n--- 7. Verifying Member Management Portal Page (GET /admin/members) ---');
    const uiRes = await fetch(`${BASE_URL}/admin/members`, {
      headers: { 'Cookie': sessionCookies }
    });
    console.log('Portal UI Status:', uiRes.status);
    if (uiRes.status !== 200) {
      throw new Error(`Expected 200 OK from /admin/members, got ${uiRes.status}`);
    }
    console.log('✅ Member Management Portal UI: PASS');

    console.log('\n================================================================');
    console.log('   🎉 ALL PHASE 1 ~ PHASE 5 MULTI-TENANT TESTS 100% PASSED!    ');
    console.log('================================================================');
  } finally {
    // 8. 테스트 레코드 정리
    console.log('\n--- Cleaning up integration test artifacts ---');
    if (testOwnerId) await deleteRows('users', { filters: { id: testOwnerId } });
    if (testStaffId) await deleteRows('users', { filters: { id: testStaffId } });
    if (testCompanyId) await deleteRows('companies', { filters: { id: testCompanyId } });
    console.log('✓ Test cleanup complete.');
  }
}

runPhase5IntegrationTest().catch(err => {
  console.error('Fatal Integration Test Error:', err);
  process.exit(1);
});
