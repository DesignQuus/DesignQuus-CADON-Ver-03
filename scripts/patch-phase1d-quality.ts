/**
 * scripts/patch-phase1d-quality.ts
 * 
 * [CADON-BOM AI Ver-03] Phase 1-D: 데이터 품질 보완 스크립트
 * 
 * 1. D-1: 카테고리 6대 실무 분류 매핑 (MACHINING, SHEET_METAL, COMMERCIAL, ASSEMBLY)
 * 2. D-2: 구매품 재질 SS400 오염 정정 (NULL화)
 * 3. D-3: 규격(specification) 정규식 보강
 * 4. D-4: raw_bom_items / normalized_bom_items 표기 변형 별칭 후보 스캔 및 보고
 */

import { queryTable, updateRows, executeSQL } from '../egdesk-helpers';

async function patchDataQuality() {
  console.log('=== [1-D] 데이터 품질 보완 작업 시작 ===\n');

  const now = new Date().toISOString();

  // -------------------------------------------------------------
  // 【D-1】 카테고리 6대 실무 분류 매핑 & 【D-2】 구매품 재질 NULL 정정
  // -------------------------------------------------------------
  console.log('--- [D-1 & D-2] 카테고리 6대 분류 매핑 및 구매품 재질 NULL 정정 ---');

  const mastersRes = await queryTable('product_masters', { limit: 1000 });
  const masters = (mastersRes.rows || []).filter((r: any) => !r.deleted_at);
  console.log(`[D-1] 대상 마스터 품목: ${masters.length}건`);

  let d1UpdatedCount = 0;
  let d2UpdatedCount = 0;

  const categoryMapping: Record<string, string> = {
    'SHAFT': 'MACHINING',
    'ROLLER': 'MACHINING',
    'PLATE': 'SHEET_METAL',
    'BRACKET': 'SHEET_METAL',
    'COVER': 'SHEET_METAL',
    'GUIDE': 'SHEET_METAL',
    'PURCHASED_STD': 'COMMERCIAL',
    'ASSY': 'ASSEMBLY',
    'ETC': 'MACHINING'
  };

  for (const m of masters) {
    const origCat = m.category;
    const targetCat = categoryMapping[origCat] || origCat;

    const isPurchased = targetCat === 'COMMERCIAL' || 
                        m.standard_name.includes('CDQ') || 
                        m.standard_name.includes('LMF');

    const updates: Record<string, any> = {};

    if (origCat !== targetCat) {
      updates.category = targetCat;
      d1UpdatedCount++;
    }

    if (isPurchased && (m.material === 'SS400' || m.material === '-')) {
      updates.material = null;
      d2UpdatedCount++;
    }

    // D-3 규격 치수 보강 (품명 내 치수 정보 추출)
    // 예: "365 - SHAFT & FLANGE" -> 365
    // "FREE ROLLER-2" -> 1/
    if ((!m.specification || m.specification === '-') && m.standard_name.includes('365')) {
      updates.specification = '365L';
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = now;
      await updateRows('product_masters', {
        filters: { id: m.id },
        updates
      });
    }
  }

  console.log(`[D-1] 카테고리 6대 분류 매핑 업데이트: ${d1UpdatedCount}건`);
  console.log(`[D-2] 구매품 재질 NULL 정정: ${d2UpdatedCount}건`);

  // /admin/masters stats 쿼리 검증
  const adminStatsRes = await executeSQL(`
    SELECT 
      COUNT(*) as total_count,
      SUM(CASE WHEN category = 'MACHINING' THEN 1 ELSE 0 END) as machining_count,
      SUM(CASE WHEN category = 'SHEET_METAL' THEN 1 ELSE 0 END) as sheet_metal_count,
      SUM(CASE WHEN category = 'CASTING' THEN 1 ELSE 0 END) as casting_count,
      SUM(CASE WHEN category = 'COMMERCIAL' THEN 1 ELSE 0 END) as commercial_count,
      SUM(CASE WHEN category = 'ELECTRICAL' THEN 1 ELSE 0 END) as electrical_count,
      SUM(CASE WHEN category = 'ASSEMBLY' THEN 1 ELSE 0 END) as assembly_count
    FROM product_masters
  `);
  console.log('\n[D-1 검증] /admin/masters 통계 카드 연동 실측치:');
  console.table(adminStatsRes.rows);

  // -------------------------------------------------------------
  // 【D-4】 별칭 사전 다변화: 실제 도면 표기 변형 스캔
  // -------------------------------------------------------------
  console.log('\n--- [D-4] raw_bom_items (2,488건) 및 normalized_bom_items (500건) 도면 표기 변형 스캔 ---');

  const rawRes = await executeSQL(`SELECT DISTINCT name_raw, specification_raw, material_raw FROM raw_bom_items WHERE name_raw != ''`);
  const normRes = await executeSQL(`SELECT DISTINCT raw_name, normalized_name, spec_candidate, material_candidate FROM normalized_bom_items WHERE raw_name != ''`);

  const rawRows = rawRes.rows || [];
  const normRows = normRes.rows || [];
  console.log(`[D-4] 도면 내 고유 원본 표기: raw_bom ${rawRows.length}건, normalized_bom ${normRows.length}건`);

  // 기존 등록된 aliases 조회
  const aliasRes = await queryTable('master_aliases', { limit: 5000 });
  const existingAliases = new Set((aliasRes.rows || []).map((a: any) => `${a.master_id}__${(a.alias_normalized || '').toUpperCase()}`));

  // 57개 마스터 대조하여 변형 후보 추출
  const proposedAliases: {
    master_code: string;
    standard_name: string;
    master_id: string;
    alias_name: string;
    alias_normalized: string;
    reason: string;
  }[] = [];

  const cleanText = (s: string) => (s || '').trim().toUpperCase();

  for (const m of masters) {
    const stdName = cleanText(m.standard_name);
    const mId = m.id;

    // 변형 규칙 정의
    const nameWithoutHyphen = stdName.replace(/-/g, ' ');
    const nameWithHyphen = stdName.replace(/\s+/g, '-');
    const nameWithoutSpace = stdName.replace(/[\s-_]/g, '');

    // 도면 표기 후보 수집
    const candidateTexts = new Set<string>();
    rawRows.forEach((r: any) => candidateTexts.add(r.name_raw));
    normRows.forEach((r: any) => {
      candidateTexts.add(r.raw_name);
      candidateTexts.add(r.normalized_name);
    });

    for (const rawText of candidateTexts) {
      if (!rawText) continue;
      const clean = cleanText(rawText);
      if (clean === stdName) continue; // 기존 완전 일치는 이미 등록됨

      const key = `${mId}__${clean}`;
      if (existingAliases.has(key)) continue;

      let matchReason = '';

      // 1. 공백 / 하이픈 / 언더바 변형 (예: SIDE PLATE 1 vs SIDE PLATE-1)
      if (clean.replace(/[\s-_]/g, '') === nameWithoutSpace) {
        matchReason = '공백/하이픈 구분 표기 변형';
      }
      // 2. 약어 변형 (BRACKET <-> B/K, CONVEYOR <-> C/V)
      else if (stdName.includes('BRACKET') && clean.includes('B/K') && clean.replace('B/K', 'BRACKET').replace(/[\s-_]/g, '') === nameWithoutSpace) {
        matchReason = '약어 표기 변형 (B/K ➔ BRACKET)';
      }
      else if (stdName.includes('CONVEYOR') && clean.includes('C/V') && clean.replace('C/V', 'CONVEYOR').replace(/[\s-_]/g, '') === nameWithoutSpace) {
        matchReason = '약어 표기 변형 (C/V ➔ CONVEYOR)';
      }
      // 3. 방향 접미사 변형 (예: MOTOR BASE-LH vs MOTOR BASE)
      else if ((clean.endsWith('-LH') || clean.endsWith('_LH') || clean.endsWith(' LH') || 
                clean.endsWith('-RH') || clean.endsWith('_RH') || clean.endsWith(' RH')) &&
               clean.replace(/[\s-_]?(LH|RH)$/, '').replace(/[\s-_]/g, '') === nameWithoutSpace) {
        matchReason = '방향 접미사(LH/RH) 변형';
      }
      // 4. 순번 접미사 변형 (예: FREE ROLLER vs FREE ROLLER-1 / FREE ROLLER-2)
      else if (stdName === 'FREE ROLLER' && (clean === 'FREE ROLLER-1' || clean === 'FREE ROLLER-2' || clean === 'FREE ROLLER 1')) {
        matchReason = '순번 파생 부품 표기';
      }

      if (matchReason) {
        proposedAliases.push({
          master_code: m.master_code,
          standard_name: m.standard_name,
          master_id: mId,
          alias_name: rawText,
          alias_normalized: clean,
          reason: matchReason
        });
        existingAliases.add(key);
      }
    }
  }

  console.log(`\n[D-4] 추출된 추가 별칭(Alias) 후보: 총 ${proposedAliases.length}건`);
  console.log('--- [D-4] 승인 요청용 대표 후보 목록 (상위 20건) ---');
  console.table(proposedAliases.slice(0, 20).map((p, idx) => ({
    No: idx + 1,
    마스터코드: p.master_code,
    표준품명: p.standard_name,
    추가_별칭표기: p.alias_name,
    변형_유형: p.reason
  })));

  // -------------------------------------------------------------
  // 【D-5】 구매 표준품 제조사 보존 분석 (SMC / MISUMI / ITOH 등)
  // -------------------------------------------------------------
  console.log('\n--- [D-5] 구매 표준품 및 제조사 식별 분석 ---');
  const makerItems = rawRows.filter((r: any) => {
    const upper = (r.name_raw || '').toUpperCase() + ' ' + (r.specification_raw || '').toUpperCase();
    return upper.includes('MISUMI') || upper.includes('ITOH') || upper.includes('SMC') || upper.includes('CDQ') || upper.includes('LMF');
  });
  console.log(`[D-5] 제조사/구매품 관련 도면 레코드 건수: ${makerItems.length}건`);
  console.log('[D-5] 제조사 관련 샘플 5건:');
  console.table(makerItems.slice(0, 5));

  console.log('\n=== [1-D] 데이터 품질 보완 작업 및 후보 추출 완료 ===');
}

patchDataQuality().catch(err => {
  console.error('[1-D] 에러 발생:', err);
  process.exit(1);
});
