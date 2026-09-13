import { getTableSchema, queryTable, insertRows, deleteRows, executeSQL } from '../egdesk-helpers';

async function runPhase2Test() {
  console.log('=== [PHASE 2: DATABASE SCHEMA & MIGRATION TEST] ===');

  // 1. Verify 'users' table schema has employee_number, phone, tenant_id, deleted_at, etc.
  console.log('\n--- 1. Checking "users" table schema ---');
  const userSchema = await getTableSchema('users');
  const userCols = (userSchema?.schema || []).map((c: any) => c.name.toLowerCase());
  console.log('User columns count:', userCols.length);

  const requiredUserCols = ['tenant_id', 'employee_number', 'phone', 'deleted_at', 'restored_at'];
  for (const col of requiredUserCols) {
    if (!userCols.includes(col)) {
      console.error(`❌ Missing column in users: ${col}`);
      process.exit(1);
    }
    console.log(`✓ users has column: ${col}`);
  }
  console.log('✅ "users" schema verification: PASS');

  // 2. Verify 'system_settings' table exists and test CRUD
  console.log('\n--- 2. Checking "system_settings" table & CRUD ---');
  const settingsSchema = await getTableSchema('system_settings');
  const settingsCols = (settingsSchema?.schema || []).map((c: any) => c.name.toLowerCase());
  console.log('System settings columns count:', settingsCols.length);

  const requiredSettingsCols = ['id', 'key', 'value', 'tenant_id', 'description'];
  for (const col of requiredSettingsCols) {
    if (!settingsCols.includes(col)) {
      console.error(`❌ Missing column in system_settings: ${col}`);
      process.exit(1);
    }
    console.log(`✓ system_settings has column: ${col}`);
  }

  // Insert a test setting
  const testId = 'setting_test_' + Date.now();
  await insertRows('system_settings', [{
    id: testId,
    key: 'site_name',
    value: 'CADON BOM AI',
    tenant_id: 'tenant-cadon',
    description: '테스트 설정 항목'
  }]);
  console.log('✓ Inserted test setting:', testId);

  // Query back
  const queryRes = await queryTable('system_settings', {
    filters: { id: testId }
  });
  const rows = Array.isArray(queryRes) ? queryRes : (queryRes?.rows || []);
  if (rows.length === 0 || rows[0].value !== 'CADON BOM AI') {
    console.error('❌ Failed to retrieve inserted system setting');
    process.exit(1);
  }
  console.log('✓ Successfully retrieved system setting:', rows[0].key, '=', rows[0].value);

  // Clean up
  await deleteRows('system_settings', { filters: { id: testId } });
  console.log('✓ Cleaned up test setting');

  console.log('✅ "system_settings" CRUD verification: PASS');

  console.log('\n=== [PHASE 2 ALL TESTS PASSED] ===');
}

runPhase2Test().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
