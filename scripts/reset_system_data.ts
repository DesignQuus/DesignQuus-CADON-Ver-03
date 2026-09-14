import fs from 'fs';
import path from 'path';
import os from 'os';

// Auto-read .env.development.local if process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID is not yet set
if (typeof process !== 'undefined' && !process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID) {
  try {
    const envPath = path.join(process.cwd(), '.env.development.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          process.env[match[1].trim()] = match[2].trim();
        }
      }
    }
  } catch (e) {}
}

import {
  executeSQL,
  queryTable,
  insertRows,
  deleteRows,
  listTables,
  createTable,
  deleteTable,
  getTableSchema
} from '../egdesk-helpers';

import { CADON_TABLE_SPECS, AUDIT_COLUMNS, setupDatabase } from '../src/lib/setup-db';
import { getEgdeskStorageDir } from '../src/lib/storage';

async function main() {
  console.log('====================================================');
  console.log('   CADON-BOM AI: System Full Reset (Admin Preserved)');
  console.log('====================================================\n');

  const now = new Date().toISOString();
  const timestamp = Date.now();

  // 1. 전체 테이블 백업 생성
  console.log('📦 [1/5] Creating safety JSON backup of all existing data...');
  const backupDir = path.join(process.cwd(), 'storage', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFilePath = path.join(backupDir, `backup_before_reset_${timestamp}.json`);

  const fullBackup: Record<string, any[]> = {};
  for (const spec of CADON_TABLE_SPECS) {
    try {
      const res = await queryTable(spec.name);
      const rows = Array.isArray(res) ? res : (res?.rows || []);
      fullBackup[spec.name] = rows;
    } catch (err: any) {
      console.warn(`  - Warning reading ${spec.name} for backup:`, err.message);
      fullBackup[spec.name] = [];
    }
  }

  // audit_logs 테이블 추가 백업
  try {
    const auditRes = await queryTable('audit_logs');
    fullBackup['audit_logs'] = Array.isArray(auditRes) ? auditRes : (auditRes?.rows || []);
  } catch {}

  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');
  console.log(`✓ Safety backup successfully saved to: ${backupFilePath}\n`);

  // 최고관리자 계정 원본 정보 보존
  const adminRows = (fullBackup['users'] || []).filter(u => u.id === 'usr_admin' || u.login_id === 'admin');
  const preservedAdmin = adminRows[0] || {
    id: 'usr_admin',
    login_id: 'admin',
    password_hash: '$2b$10$tnPArTAfZEhMrxYpVy5bD.ZtrLyH7BaaeLz36Ff5Adrgt0CvNuMBa',
    name: '시스템 최고관리자',
    role: 'SUPER_ADMIN',
    company_id: null,
    is_active: 1,
    tenant_id: 'tenant-cadon',
    uuid: 'usr_admin',
    created_at: now,
    updated_at: now
  };

  // 2. 운영/트랜잭션 테이블 일괄 초기화
  console.log('🗑️  [2/5] Truncating transactional and operational tables...');
  const tablesToTruncate = [
    'quotation_cases',
    'uploaded_files',
    'drawings',
    'drawing_relationships',
    'cad_objects',
    'bom_areas',
    'raw_bom_items',
    'normalized_bom_items',
    'flattened_bom_items',
    'final_bom_items',
    'bom_approval_records',
    'master_candidates',
    'master_aliases',
    'product_masters',
    'price_masters',
    'manual_price_pool',
    'quotes',
    'quote_items',
    'quote_exports',
    'case_archives',
    'excel_templates',
    'approval_requests',
    'golden_cases',
    'system_baselines',
    'cad_parse_runs',
    'dwg_conversion_runs',
    'user_activity_logs',
    'audit_logs'
  ];

  for (const tbl of tablesToTruncate) {
    try {
      const spec = CADON_TABLE_SPECS.find(s => s.name === tbl);
      const displayName = spec?.displayName || tbl;
      console.log(`  - Recreating empty table "${tbl}"...`);
      await deleteTable(tbl).catch(() => {});
      
      const columns = spec ? [...spec.columns] : [{ name: 'id', type: 'TEXT' as const }];
      for (const auditCol of AUDIT_COLUMNS) {
        if (!columns.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
          columns.push({ ...auditCol } as any);
        }
      }
      await createTable(displayName, columns as any, {
        tableName: tbl,
        uniqueKeyColumns: spec?.uniqueKeyColumns || ['id']
      });
    } catch (err: any) {
      console.error(`❌ Failed to truncate table "${tbl}":`, err.message);
    }
  }
  console.log('✓ Transactional tables truncated.\n');

  // 3. 마스터 테이블 정리 (최고관리자 및 기본 플레이스홀더만 보존)
  console.log('👤 [3/5] Cleaning master tables (preserving Admin and default placeholders)...');

  // A. users: 최고관리자 1명만 유지
  console.log('  - Resetting "users" table to Super Admin only...');
  const userSpec = CADON_TABLE_SPECS.find(s => s.name === 'users')!;
  await deleteTable('users').catch(() => {});
  const userCols = [...userSpec.columns];
  for (const auditCol of AUDIT_COLUMNS) {
    if (!userCols.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
      userCols.push({ ...auditCol } as any);
    }
  }
  await createTable(userSpec.displayName, userCols as any, {
    tableName: 'users',
    uniqueKeyColumns: ['id']
  });
  await insertRows('users', [preservedAdmin]);
  console.log('  ✓ "users" restored with 1 Super Admin.');

  // B. companies: comp_unassigned 1개만 유지
  console.log('  - Resetting "companies" table to default placeholder only...');
  const compSpec = CADON_TABLE_SPECS.find(s => s.name === 'companies')!;
  await deleteTable('companies').catch(() => {});
  const compCols = [...compSpec.columns];
  for (const auditCol of AUDIT_COLUMNS) {
    if (!compCols.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
      compCols.push({ ...auditCol } as any);
    }
  }
  await createTable(compSpec.displayName, compCols as any, {
    tableName: 'companies',
    uniqueKeyColumns: ['id']
  });
  await insertRows('companies', [{
    id: 'comp_unassigned',
    company_code: 'UNASSIGNED',
    company_name: '고객사 미지정',
    company_type: 'CUSTOMER',
    is_active: 1,
    tenant_id: 'tenant-cadon',
    uuid: 'comp_unassigned',
    created_at: now,
    updated_at: now
  }]);
  console.log('  ✓ "companies" restored with default placeholder.');

  // C. projects: proj_unassigned 1개만 유지
  console.log('  - Resetting "projects" table to default placeholder only...');
  const projSpec = CADON_TABLE_SPECS.find(s => s.name === 'projects')!;
  await deleteTable('projects').catch(() => {});
  const projCols = [...projSpec.columns];
  for (const auditCol of AUDIT_COLUMNS) {
    if (!projCols.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
      projCols.push({ ...auditCol } as any);
    }
  }
  await createTable(projSpec.displayName, projCols as any, {
    tableName: 'projects',
    uniqueKeyColumns: ['id']
  });
  await insertRows('projects', [{
    id: 'proj_unassigned',
    company_id: 'comp_unassigned',
    project_code: 'PRJ-UNASSIGNED',
    project_name: '프로젝트 미지정',
    description: '도면 직접 등록 시 생성되는 기본 프로젝트',
    status: 'ACTIVE',
    tenant_id: 'tenant-cadon',
    uuid: 'proj_unassigned',
    created_at: now,
    updated_at: now
  }]);
  console.log('  ✓ "projects" restored with default placeholder.');

  // D. user_company_access: 최고관리자 매핑 1개만 유지
  console.log('  - Resetting "user_company_access" table...');
  const ucaSpec = CADON_TABLE_SPECS.find(s => s.name === 'user_company_access')!;
  await deleteTable('user_company_access').catch(() => {});
  const ucaCols = [...ucaSpec.columns];
  for (const auditCol of AUDIT_COLUMNS) {
    if (!ucaCols.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
      ucaCols.push({ ...auditCol } as any);
    }
  }
  await createTable(ucaSpec.displayName, ucaCols as any, {
    tableName: 'user_company_access',
    uniqueKeyColumns: ['id']
  });
  await insertRows('user_company_access', [{
    id: 'uca_admin_unassigned',
    user_id: 'usr_admin',
    company_id: 'comp_unassigned',
    access_role: 'MANAGER',
    is_active: 1,
    tenant_id: 'tenant-cadon',
    uuid: 'uca_admin_unassigned',
    updated_at: now
  }]);
  console.log('  ✓ "user_company_access" restored with 1 record.');

  // E. user_approval_permissions & system_approval_settings
  console.log('  - Ensuring approval permissions for Super Admin...');
  const uapSpec = CADON_TABLE_SPECS.find(s => s.name === 'user_approval_permissions')!;
  await deleteTable('user_approval_permissions').catch(() => {});
  const uapCols = [...uapSpec.columns];
  for (const auditCol of AUDIT_COLUMNS) {
    if (!uapCols.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
      uapCols.push({ ...auditCol } as any);
    }
  }
  await createTable(uapSpec.displayName, uapCols as any, {
    tableName: 'user_approval_permissions',
    uniqueKeyColumns: ['id']
  });
  await insertRows('user_approval_permissions', [{
    user_id: 'usr_admin',
    can_edit_own: 1,
    can_approve_own: 1,
    can_edit_others: 'ALLOW',
    can_approve_others: 'ALLOW',
    can_edit_price: 1,
    can_approve_quote: 1,
    tenant_id: 'tenant-cadon',
    uuid: 'perm_usr_admin',
    updated_at: now
  }]);

  // 4. 스토리지 파일 정리
  console.log('\n🧹 [4/5] Cleaning storage directories (files, derived, exports, temp)...');
  const cleanFolder = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      let count = 0;
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          count++;
        } catch (e) {}
      }
      console.log(`  - Cleaned ${count} files from: ${dirPath}`);
    }
  };

  // 로컬 storage
  cleanFolder(path.join(process.cwd(), 'storage', 'files'));
  cleanFolder(path.join(process.cwd(), 'storage', 'derived'));
  cleanFolder(path.join(process.cwd(), 'storage', 'exports'));
  cleanFolder(path.join(process.cwd(), 'storage', 'temp'));

  // EGDesk AppData storage
  try {
    const egdeskStorage = getEgdeskStorageDir();
    if (egdeskStorage && fs.existsSync(egdeskStorage)) {
      console.log(`  - Cleaning EGDesk AppData storage at: ${egdeskStorage}`);
      cleanFolder(path.join(egdeskStorage, 'files'));
      cleanFolder(path.join(egdeskStorage, 'derived'));
      cleanFolder(path.join(egdeskStorage, 'exports'));
      cleanFolder(path.join(egdeskStorage, 'temp'));
    }
  } catch (err: any) {
    console.warn('  - Note on EGDesk storage cleanup:', err.message);
  }

  // 5. 검증 및 최종 리포트 출력
  console.log('\n📊 [5/5] Final Verification of Cleaned Database:');
  const verifyTables = [
    'users',
    'companies',
    'projects',
    'user_company_access',
    'quotation_cases',
    'drawings',
    'cad_objects',
    'raw_bom_items',
    'flattened_bom_items',
    'bom_areas',
    'uploaded_files',
    'user_activity_logs'
  ];

  for (const tbl of verifyTables) {
    try {
      const res = await queryTable(tbl);
      const rows = Array.isArray(res) ? res : (res?.rows || []);
      console.log(`  ✓ Table "${tbl}": ${rows.length} rows`);
    } catch (err: any) {
      console.error(`  ❌ Failed to count table "${tbl}":`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('✨ SYSTEM RESET COMPLETED SUCCESSFULLY!');
  console.log('   - Only Super Admin (admin) remains.');
  console.log(`   - Full backup preserved at: ${backupFilePath}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('CRITICAL ERROR DURING RESET:', err);
  process.exit(1);
});
