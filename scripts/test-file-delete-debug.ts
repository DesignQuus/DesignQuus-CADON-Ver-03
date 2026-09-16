import { queryTable, insertRows, deleteRows } from '../egdesk-helpers';
import { db } from '../src/lib/db';

async function testFileDelete() {
  console.log('--- 1. Testing file insertion ---');
  const dummyFileId = 'test_file_' + Date.now();
  const dummyCaseId = 'test_case_for_file_' + Date.now();

  const insertRes = await insertRows('uploaded_files', [{
    id: dummyFileId,
    quotation_case_id: dummyCaseId,
    original_file_name: 'test_delete_sample.dwg',
    stored_file_name: 'stored_test_sample.dwg',
    storage_path: 'C:\\fake\\path\\test.dwg',
    file_type: 'DWG',
    file_role: 'SOURCE',
    file_size: 1024,
    checksum: 'test_checksum',
    upload_status: 'UPLOADED',
    uploaded_by_user_id: 'usr_admin',
    created_at: new Date().toISOString()
  }]);
  console.log('insertRes:', insertRes);

  const check1 = await queryTable('uploaded_files', { filters: { id: dummyFileId } });
  console.log('Check before delete: found', check1.rows.length, 'rows');

  console.log('--- 2. Testing file deletion via db.prepare DELETE ---');
  const delRes = await db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(dummyFileId);
  console.log('Delete result:', delRes);

  const check2 = await queryTable('uploaded_files', { filters: { id: dummyFileId } });
  console.log('Check after delete: found', check2.rows.length, 'rows');

  if (check2.rows.length === 0) {
    console.log('SUCCESS: Single file deleted properly!');
  } else {
    console.error('FAILURE: File still exists in uploaded_files!');
  }

  console.log('--- 3. Testing multiple file deletion (IN clause) ---');
  const f1 = 'test_in_1_' + Date.now();
  const f2 = 'test_in_2_' + Date.now();
  await insertRows('uploaded_files', [
    { id: f1, quotation_case_id: dummyCaseId, original_file_name: 'f1.dwg', stored_file_name: 'f1.dwg', storage_path: 'C:\\f1', file_type: 'DWG', file_role: 'SOURCE', file_size: 10, checksum: 'c1', upload_status: 'UPLOADED', uploaded_by_user_id: 'usr_admin', created_at: new Date().toISOString() },
    { id: f2, quotation_case_id: dummyCaseId, original_file_name: 'f2.dwg', stored_file_name: 'f2.dwg', storage_path: 'C:\\f2', file_type: 'DWG', file_role: 'SOURCE', file_size: 10, checksum: 'c2', upload_status: 'UPLOADED', uploaded_by_user_id: 'usr_admin', created_at: new Date().toISOString() }
  ]);

  const checkMultiBefore = await queryTable('uploaded_files', { filters: { quotation_case_id: dummyCaseId } });
  console.log('Check before IN delete: found', checkMultiBefore.rows.length, 'rows');

  const delMultiRes = await db.prepare('DELETE FROM uploaded_files WHERE id IN (?, ?)').run(f1, f2);
  console.log('Delete IN result:', delMultiRes);

  const checkMultiAfter = await queryTable('uploaded_files', { filters: { quotation_case_id: dummyCaseId } });
  console.log('Check after IN delete: found', checkMultiAfter.rows.length, 'rows');

  if (checkMultiAfter.rows.length === 0) {
    console.log('SUCCESS: Multiple files deleted properly via IN clause!');
  } else {
    console.error('FAILURE: Multiple files still exist!');
  }
}

testFileDelete().catch(console.error);
