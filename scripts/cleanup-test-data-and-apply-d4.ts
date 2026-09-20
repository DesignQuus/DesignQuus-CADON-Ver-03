/**
 * scripts/cleanup-test-data-and-apply-d4.ts
 * 
 * 1. price_history_v2 테스트 데이터 3건 삭제 (241건 원복)
 * 2. master_aliases 카운트 원복 (POST, ROLLER POST -> approval_count=1, rejection_count=0)
 * 3. D-4 승인된 추가 별칭 2건 (FREE ROLLER-1, FREE ROLLER-2) 등록
 */

import { queryTable, deleteRows, updateRows, insertRows, executeSQL } from '../egdesk-helpers';

async function cleanupAndFinalize() {
  console.log('=== 테스트 데이터 격리 및 D-4 별칭 등록 시작 ===\n');

  const now = new Date().toISOString();

  // 1. price_history_v2 테스트 데이터 3건 삭제
  const testIds = [
    'prc_v2_1789864534657_52r1',
    'prc_v2_1789864535840_f78a',
    'prc_v2_1789864536149_wt9c'
  ];

  console.log(`[격리] price_history_v2 테스트 레코드 ${testIds.length}건 삭제 진행...`);
  for (const tid of testIds) {
    try {
      await deleteRows('price_history_v2', { filters: { id: tid } });
      console.log(` - 삭제 완료: ${tid}`);
    } catch (err) {
      console.warn(` - 삭제 경고: ${tid}`, err);
    }
  }

  // 2. master_aliases 시험 카운트 원복
  const targetMasterIds = ['pm_1789864026824_vm4ty', 'pm_1789864026824_yiiux'];
  for (const mid of targetMasterIds) {
    const alRes = await queryTable('master_aliases', { filters: { master_id: mid }, limit: 5 });
    for (const al of alRes.rows || []) {
      await updateRows('master_aliases', {
        filters: { id: al.id },
        updates: { approval_count: 1, rejection_count: 0, updated_at: now }
      });
      console.log(`[원복] ${al.alias_name} approval_count=1, rejection_count=0 리셋 완료`);
    }
  }

  // 3. D-4 승인된 별칭 2건 (FREE ROLLER-1, FREE ROLLER-2) 등록
  // FREE ROLLER 마스터 ID 찾기
  const pmRes = await queryTable('product_masters', { filters: { standard_name: 'FREE ROLLER' }, limit: 5 });
  const freeRollerMaster = pmRes.rows?.[0];

  if (freeRollerMaster) {
    const newAliases = [
      {
        id: `alias_${Date.now()}_fr1`,
        company_id: 'comp_ag_borgwarner',
        master_id: freeRollerMaster.id,
        alias_name: 'FREE ROLLER-1',
        alias_normalized: 'FREE ROLLER-1',
        approval_count: 1,
        rejection_count: 0,
        scope: 'COMPANY',
        tenant_id: 'tenant-cadon',
        created_at: now,
        updated_at: now
      },
      {
        id: `alias_${Date.now()}_fr2`,
        company_id: 'comp_ag_borgwarner',
        master_id: freeRollerMaster.id,
        alias_name: 'FREE ROLLER-2',
        alias_normalized: 'FREE ROLLER-2',
        approval_count: 1,
        rejection_count: 0,
        scope: 'COMPANY',
        tenant_id: 'tenant-cadon',
        created_at: now,
        updated_at: now
      }
    ];

    await insertRows('master_aliases', newAliases);
    console.log(`[D-4] FREE ROLLER-1, FREE ROLLER-2 신규 별칭 2건 등록 완료`);
  }

  // 4. 최종 행 수 실측
  const countsRes = await executeSQL(`
    SELECT 
      (SELECT count(*) FROM product_masters) as pm_count,
      (SELECT count(*) FROM master_aliases) as ma_count,
      (SELECT count(*) FROM master_candidates) as mc_count,
      (SELECT count(*) FROM price_history_v2) as ph_count
  `);

  console.log('\n=== 최종 DB 실측 행 수 ===');
  console.table(countsRes.rows);
}

cleanupAndFinalize().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
