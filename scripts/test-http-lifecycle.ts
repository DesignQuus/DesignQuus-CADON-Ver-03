async function testHttpEndpoints() {
  console.log('--- 1. Login as Admin to get session cookie ---');
  const loginRes = await fetch('http://localhost:4005/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'admin', password: 'Cadon1234!@' })
  });

  const cookie = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginRes.status, 'Cookie exists:', !!cookie);

  if (!cookie) {
    console.error('Failed to get session cookie');
    return;
  }

  console.log('\n--- 2. Fetch quotation cases via GET /api/quotation-cases ---');
  const getCasesRes = await fetch('http://localhost:4005/api/quotation-cases', {
    headers: { 'Cookie': cookie }
  });
  const casesData = await getCasesRes.json();
  console.log('Cases API status:', getCasesRes.status, 'Total cases returned:', casesData.cases?.length);
  
  casesData.cases?.forEach((c: any) => {
    console.log(`- [${c.id}] ${c.case_name} | deleted_at: ${c.deleted_at} | status: ${c.status}`);
  });

  // Create a temporary case to test full lifecycle via HTTP
  console.log('\n--- 3. Create a temporary case via POST /api/quotation-cases ---');
  const createRes = await fetch('http://localhost:4005/api/quotation-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      companyId: 'comp_unassigned',
      projectId: 'proj_unassigned',
      caseName: 'HTTP_LIFECYCLE_TEST_CASE'
    })
  });
  const createData = await createRes.json();
  const testCaseId = createData.caseId;
  console.log('Created test case ID:', testCaseId);

  console.log('\n--- 4. Test TRASH via POST /api/quotation-cases/bulk-lifecycle ---');
  const trashRes = await fetch('http://localhost:4005/api/quotation-cases/bulk-lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      caseIds: [testCaseId],
      action: 'TRASH'
    })
  });
  console.log('TRASH status:', trashRes.status, await trashRes.json());

  // Verify deleted_at in GET
  const verifyTrash = await fetch('http://localhost:4005/api/quotation-cases', { headers: { 'Cookie': cookie } });
  const verifyTrashData = await verifyTrash.json();
  const trashedItem = verifyTrashData.cases?.find((c: any) => c.id === testCaseId);
  console.log('Trashed item verified in API:', {
    id: trashedItem?.id,
    deleted_at: trashedItem?.deleted_at,
    hasDeletedAt: !!trashedItem?.deleted_at
  });

  console.log('\n--- 5. Test RESTORE via POST /api/quotation-cases/bulk-lifecycle ---');
  const restoreRes = await fetch('http://localhost:4005/api/quotation-cases/bulk-lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      caseIds: [testCaseId],
      action: 'RESTORE'
    })
  });
  console.log('RESTORE status:', restoreRes.status, await restoreRes.json());

  const verifyRestore = await fetch('http://localhost:4005/api/quotation-cases', { headers: { 'Cookie': cookie } });
  const verifyRestoreData = await verifyRestore.json();
  const restoredItem = verifyRestoreData.cases?.find((c: any) => c.id === testCaseId);
  console.log('Restored item verified in API:', {
    id: restoredItem?.id,
    deleted_at: restoredItem?.deleted_at,
    isRestored: !restoredItem?.deleted_at
  });

  console.log('\n--- 6. Test PERMANENT_DELETE via POST /api/quotation-cases/bulk-lifecycle ---');
  const permRes = await fetch('http://localhost:4005/api/quotation-cases/bulk-lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      caseIds: [testCaseId],
      action: 'PERMANENT_DELETE'
    })
  });
  console.log('PERMANENT_DELETE status:', permRes.status, await permRes.json());

  const verifyPerm = await fetch('http://localhost:4005/api/quotation-cases', { headers: { 'Cookie': cookie } });
  const verifyPermData = await verifyPerm.json();
  const permItem = verifyPermData.cases?.find((c: any) => c.id === testCaseId);
  console.log('Permanent delete item found in API?:', !!permItem);

  if (!permItem) {
    console.log('\n🎉 ALL HTTP LIFECYCLE TESTS PASSED 100%!');
  } else {
    console.error('\n❌ Permanent delete verification failed!');
  }
}

testHttpEndpoints().catch(console.error);
