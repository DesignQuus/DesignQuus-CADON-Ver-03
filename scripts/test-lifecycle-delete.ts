import { db } from '../src/lib/db';
import { queryTable } from '../egdesk-helpers';

async function runLifecycleVerification() {
  console.log('=== Starting Lifecycle & Deletion Verification ===');

  const testCaseId = `case_test_del_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Create temporary test case
  console.log('1. Creating test case:', testCaseId);
  await db.prepare(`
    INSERT INTO quotation_cases (
      id, case_no, case_name, company_id, project_id, status, request_date, quote_readiness, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testCaseId,
    'QT-TEST-DEL',
    '테스트 삭제 견적건',
    'comp_unassigned',
    'proj_unassigned',
    'DRAFT',
    '2026-09-16',
    'NOT_READY',
    'usr_admin',
    now
  );

  // Verify created
  let check = (await queryTable('quotation_cases', { filters: { id: testCaseId } }))?.rows?.[0];
  console.log('Created case deleted_at:', check?.deleted_at);
  if (check?.deleted_at) throw new Error('New case should not have deleted_at');

  // 2. Perform TRASH (soft delete)
  console.log('2. Performing TRASH (soft delete)...');
  const trashTime = new Date().toISOString();
  await db.prepare(`
    UPDATE quotation_cases
    SET deleted_at = ?,
        deleted_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(trashTime, 'usr_admin', trashTime, testCaseId);

  check = (await queryTable('quotation_cases', { filters: { id: testCaseId } }))?.rows?.[0];
  console.log('After TRASH deleted_at:', check?.deleted_at);
  if (!check?.deleted_at) throw new Error('Case must have deleted_at after TRASH');

  // Check active filter simulation
  const isActive = !check.deleted_at && (!check.lifecycle_status || check.lifecycle_status === 'ACTIVE');
  const isTrashed = Boolean(check.deleted_at) || check.lifecycle_status === 'TRASHED';
  console.log('Filter check: isActive =', isActive, ', isTrashed =', isTrashed);
  if (isActive) throw new Error('Case must NOT be active after TRASH');
  if (!isTrashed) throw new Error('Case MUST be trashed after TRASH');

  // 3. Perform RESTORE
  console.log('3. Performing RESTORE...');
  const restoreTime = new Date().toISOString();
  await db.prepare(`
    UPDATE quotation_cases
    SET deleted_at = NULL,
        deleted_by = NULL,
        restored_at = ?,
        restored_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(restoreTime, 'usr_admin', restoreTime, testCaseId);

  check = (await queryTable('quotation_cases', { filters: { id: testCaseId } }))?.rows?.[0];
  console.log('After RESTORE deleted_at:', check?.deleted_at);
  const isActiveAfterRestore = !check?.deleted_at && (!check?.lifecycle_status || check?.lifecycle_status === 'ACTIVE');
  console.log('After RESTORE isActive =', isActiveAfterRestore);
  if (!isActiveAfterRestore) throw new Error('Case must be active after RESTORE');

  // 4. Perform PERMANENT_DELETE
  console.log('4. Performing PERMANENT_DELETE...');
  await db.prepare('DELETE FROM quotation_cases WHERE id = ?').run(testCaseId);

  const finalCheck = (await queryTable('quotation_cases', { filters: { id: testCaseId } }))?.rows;
  console.log('After PERMANENT_DELETE remaining rows:', finalCheck?.length);
  if (finalCheck && finalCheck.length > 0) throw new Error('Case should be completely gone');

  console.log('=== All 4 Lifecycle Verification Tests Passed 100%! ===');
}

runLifecycleVerification().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
