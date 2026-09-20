/**
 * scripts/seed-masters-from-history.ts
 * 
 * [CADON-BOM AI Ver-03] Phase 1-A: 역시딩 (Back-seeding)
 * price_history_v2 (241건)을 바탕으로 정제/중복제거 후 product_masters 및 master_aliases를 시딩합니다.
 * 
 * 실행 방법: npx tsx scripts/seed-masters-from-history.ts
 */

import { executeSQL, queryTable, insertRows } from '../egdesk-helpers';

const TENANT_ID = 'tenant-cadon';
const COMPANY_ID = 'comp_ag_borgwarner';

// 8개 이상치/도면주기 배제 목록
const EXCLUDED_NAMES = new Set([
  '10U+00B0',
  '2.P/N',
  'A3',
  'NO.',
  '열처리 HRC 45~55',
  '열처리 HRC 45~55',
  'UNKNOWN',
  'ITOH',
  'MISUMI'
]);

function categorizeItem(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('SHAFT') || upper.includes('PIN')) return 'SHAFT';
  if (upper.includes('PLATE') || upper.includes('CAP')) return 'PLATE';
  if (upper.includes('BRACKET') || upper.includes('B/K')) return 'BRACKET';
  if (upper.includes('ROLLER')) return 'ROLLER';
  if (upper.includes('COVER')) return 'COVER';
  if (upper.includes('GUIDE') || upper.includes('POST') || upper.includes('STAY') || upper.includes('STOPPER') || upper.includes('COLLAR')) return 'GUIDE';
  if (upper.includes('CDQ') || upper.includes('LMF')) return 'PURCHASED_STD';
  if (upper.includes('CONVEYOR') || upper.includes('DRIVE') || upper.includes('GATE') || upper.includes('MAIN C/V') || upper.includes('SUB C/V')) return 'ASSY';
  return 'ETC';
}

function getCategoryPrefix(cat: string): string {
  switch (cat) {
    case 'SHAFT': return 'SHT';
    case 'PLATE': return 'PLT';
    case 'BRACKET': return 'BKT';
    case 'ROLLER': return 'ROL';
    case 'COVER': return 'CVR';
    case 'GUIDE': return 'GDE';
    case 'PURCHASED_STD': return 'PUR';
    case 'ASSY': return 'ASY';
    default: return 'ETC';
  }
}

async function runBackSeeding() {
  console.log('=== [1-A] 마스터 품목 및 별칭 역시딩 (Back-seeding) 시작 ===');

  // 1. 기존 price_history_v2 및 quote_items/normalized_bom_items 조인 조회
  // executeSQL 키워드 필터 회피: CREATE, DELETE 등의 단어가 포함되지 않도록 단순 SELECT 사용
  const rawRowsRes = await executeSQL(`
    SELECT 
      p.id as price_id,
      p.part_key,
      p.unit_price,
      p.lot_quantity,
      p.qty_tier,
      coalesce(q.item_name, n.raw_name, '') as item_name,
      coalesce(q.specification, n.spec_candidate, '-') as specification,
      coalesce(q.material, n.material_candidate, '-') as material,
      q.drawing_no,
      q.unit
    FROM price_history_v2 p
    LEFT JOIN quote_items q ON p.part_master_id = q.id OR p.quote_item_id = q.id
    LEFT JOIN normalized_bom_items n ON p.part_master_id = n.id
  `);

  const rawRows = rawRowsRes.rows || [];
  console.log(`[1-A] 조회된 price_history_v2 레코드 수: ${rawRows.length}건`);

  // 2. 그룹핑 및 정제
  const groups = new Map<string, {
    standardName: string;
    specification: string;
    material: string;
    unit: string;
    category: string;
    rawNames: Set<string>;
    sampleDrawing: string;
    count: number;
  }>();

  let excludedCount = 0;

  for (const row of rawRows) {
    let name = (row.item_name || '').trim();
    if (!name || name === '') {
      excludedCount++;
      continue;
    }

    const cleanUpper = name.toUpperCase();
    if (EXCLUDED_NAMES.has(cleanUpper)) {
      excludedCount++;
      continue;
    }

    const spec = (row.specification || '-').trim();
    const mat = (row.material || '-').trim();
    const unit = (row.unit || 'EA').trim();
    const category = categorizeItem(cleanUpper);

    // 표준화 그룹 키: 대문자 품명 + 규격 + 재질
    const groupKey = `${cleanUpper}__${spec.toUpperCase()}__${mat.toUpperCase()}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        standardName: cleanUpper,
        specification: spec,
        material: mat,
        unit: unit,
        category: category,
        rawNames: new Set<string>(),
        sampleDrawing: row.drawing_no || '',
        count: 0
      });
    }

    const g = groups.get(groupKey)!;
    g.count++;
    g.rawNames.add(name);
  }

  console.log(`[1-A] 정제 결과: 이상치 배제 ${excludedCount}건, 정제된 표준 품목 그룹: ${groups.size}건`);

  // 3. 기존 등록된 product_masters 조회 (queryTable 활용하여 안전하게 조회)
  const existingMastersRes = await queryTable('product_masters', { limit: 2000 });
  const existingMasters = (existingMastersRes.rows || []).filter((r: any) => !r.deleted_at);
  const existingMasterMap = new Map<string, any>();
  for (const em of existingMasters) {
    const key = `${(em.standard_name || '').toUpperCase()}__${(em.specification || '').toUpperCase()}__${(em.material || '').toUpperCase()}`;
    existingMasterMap.set(key, em);
  }

  // 기존 등록된 master_aliases 조회
  const existingAliasesRes = await queryTable('master_aliases', { limit: 5000 });
  const existingAliases = (existingAliasesRes.rows || []).filter((r: any) => !r.deleted_at);
  const existingAliasSet = new Set<string>();
  for (const ea of existingAliases) {
    existingAliasSet.add(`${ea.master_id}__${(ea.alias_normalized || '').toUpperCase()}`);
  }

  const now = new Date().toISOString();
  const productMastersToInsert: any[] = [];
  const masterAliasesToInsert: any[] = [];

  const categoryCounters = new Map<string, number>();

  for (const [groupKey, g] of groups.entries()) {
    let masterId = '';
    let masterCode = '';

    if (existingMasterMap.has(groupKey)) {
      const existing = existingMasterMap.get(groupKey);
      masterId = existing.id;
      masterCode = existing.master_code;
    } else {
      const prefix = getCategoryPrefix(g.category);
      const curCount = (categoryCounters.get(prefix) || 0) + 1;
      categoryCounters.set(prefix, curCount);

      masterCode = `STD-${prefix}-${String(curCount).padStart(3, '0')}`;
      masterId = `pm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      productMastersToInsert.push({
        id: masterId,
        company_id: COMPANY_ID,
        master_code: masterCode,
        standard_name: g.standardName,
        category: g.category,
        specification: g.specification,
        material: g.material,
        unit: g.unit,
        status: 'ACTIVE',
        tenant_id: TENANT_ID,
        created_at: now,
        updated_at: now
      });

      // 캐시에 즉시 추가하여 동일 키 중복 방지
      existingMasterMap.set(groupKey, { id: masterId, master_code: masterCode });
    }

    // 마스터 별칭(master_aliases) 생성
    for (const rawName of g.rawNames) {
      const normAlias = rawName.trim().toUpperCase();
      const aliasKey = `${masterId}__${normAlias}`;

      if (!existingAliasSet.has(aliasKey)) {
        const aliasId = `alias_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        masterAliasesToInsert.push({
          id: aliasId,
          company_id: COMPANY_ID,
          master_id: masterId,
          alias_name: rawName,
          alias_normalized: normAlias,
          approval_count: 1, // 초기 승인값 1
          rejection_count: 0,
          scope: 'COMPANY',
          tenant_id: TENANT_ID,
          created_at: now,
          updated_at: now
        });
        existingAliasSet.add(aliasKey);
      }
    }
  }

  // 4. DB Insert 실행
  if (productMastersToInsert.length > 0) {
    console.log(`[1-A] product_masters 신규 인서트: ${productMastersToInsert.length}건`);
    await insertRows('product_masters', productMastersToInsert);
  } else {
    console.log(`[1-A] product_masters 신규 인서트 대상 없음 (이미 시딩됨)`);
  }

  if (masterAliasesToInsert.length > 0) {
    console.log(`[1-A] master_aliases 신규 인서트: ${masterAliasesToInsert.length}건`);
    await insertRows('master_aliases', masterAliasesToInsert);
  } else {
    console.log(`[1-A] master_aliases 신규 인서트 대상 없음 (이미 시딩됨)`);
  }

  // 5. 검증 조회
  const finalMastersRes = await queryTable('product_masters', { limit: 2000 });
  const finalAliasesRes = await queryTable('master_aliases', { limit: 5000 });
  const validMasters = (finalMastersRes.rows || []).filter((r: any) => !r.deleted_at);
  const validAliases = (finalAliasesRes.rows || []).filter((r: any) => !r.deleted_at);

  console.log(`[1-A] 시딩 후 총 건수 - product_masters: ${validMasters.length}건, master_aliases: ${validAliases.length}건`);

  // 6. 대표 샘플 10건 출력
  console.log('[1-A] 대표 샘플 10건:');
  const samples = validMasters.slice(0, 10).map((m: any, idx: number) => {
    const alias = validAliases.find((a: any) => a.master_id === m.id);
    return {
      No: idx + 1,
      master_code: m.master_code,
      standard_name: m.standard_name,
      category: m.category,
      spec: m.specification,
      mat: m.material,
      alias_name: alias ? alias.alias_name : '-',
      approval_count: alias ? alias.approval_count : 0
    };
  });
  console.table(samples);

  console.log('=== [1-A] 마스터 품목 및 별칭 역시딩 완료 ===');
}

runBackSeeding().catch(err => {
  console.error('[1-A] 에러 발생:', err);
  process.exit(1);
});
