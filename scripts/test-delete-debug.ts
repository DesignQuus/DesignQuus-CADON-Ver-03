import { insertRows, updateRows, deleteRows, queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = `case_test_${Date.now()}`;
  const row = {
    id: caseId,
    case_no: 'QT-TEST-DEL',
    case_name: '테스트 삭제 견적건',
    company_id: 'comp_unassigned',
    project_id: 'proj_unassigned',
    status: 'DRAFT',
    revision: '0',
    request_date: '2026-09-16',
    quote_readiness: 'NOT_READY',
    created_by_user_id: 'usr_admin',
    created_at: new Date().toISOString()
  };

  const res = await insertRows('quotation_cases', [row]);
  console.log('1. insertRows result:', res);

  // Check inserted
  let check = (await queryTable('quotation_cases', { filters: { id: caseId } }))?.rows?.[0];
  console.log('2. Check after insert:', check?.id, 'deleted_at:', check?.deleted_at);

  // Soft delete (TRASH)
  const now = new Date().toISOString();
  const trashRes = await updateRows('quotation_cases', {
    deleted_at: now,
    deleted_by: 'usr_admin'
  }, {
    filters: { id: caseId }
  });
  console.log('3. updateRows (TRASH) result:', trashRes);

  check = (await queryTable('quotation_cases', { filters: { id: caseId } }))?.rows?.[0];
  console.log('4. Check after TRASH:', check?.id, 'deleted_at:', check?.deleted_at);

  // Restore
  const restoreRes = await updateRows('quotation_cases', {
    deleted_at: null,
    deleted_by: null,
    restored_at: now,
    restored_by: 'usr_admin'
  }, {
    filters: { id: caseId }
  });
  console.log('5. updateRows (RESTORE) result:', restoreRes);

  check = (await queryTable('quotation_cases', { filters: { id: caseId } }))?.rows?.[0];
  console.log('6. Check after RESTORE:', check?.id, 'deleted_at:', check?.deleted_at);

  // Permanent Delete
  const delRes = await deleteRows('quotation_cases', { filters: { id: caseId } });
  console.log('7. deleteRows (PERMANENT) result:', delRes);

  check = (await queryTable('quotation_cases', { filters: { id: caseId } }))?.rows;
  console.log('8. Check after PERMANENT remaining rows:', check?.length);
}

main().catch(console.error);
