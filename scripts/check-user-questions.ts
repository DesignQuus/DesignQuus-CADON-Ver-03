import { executeSQL } from '../egdesk-helpers';

async function main() {
  console.log('\n================================================================');
  console.log('【확인 1】 basis_calc_json 샘플 확인 (수식 출력 여부 분석)');
  console.log('================================================================');
  const samples = await executeSQL(`
    SELECT quotation_case_id, part_key, price_basis_type, material_cost, process_cost, margin_rate, unit_price, basis_calc_json
    FROM price_history_v2
    WHERE basis_calc_json IS NOT NULL AND basis_calc_json != ''
    LIMIT 3
  `);
  for (const s of (samples.rows || [])) {
    console.log(`\n[Case: ${s.quotation_case_id} | Part: ${s.part_key} | Type: ${s.price_basis_type} | UnitPrice: ${s.unit_price}]`);
    console.log('material_cost:', s.material_cost, 'process_cost:', s.process_cost, 'margin_rate:', s.margin_rate);
    try {
      console.log('basis_calc_json:', JSON.stringify(JSON.parse(s.basis_calc_json), null, 2));
    } catch {
      console.log('basis_calc_json (raw):', s.basis_calc_json);
    }
  }

  console.log('\n================================================================');
  console.log('【확인 4】 케이스 간 동일 part_key 단가 편차 실측');
  console.log('================================================================');
  const crossCase = await executeSQL(`
    SELECT part_key,
           COUNT(DISTINCT quotation_case_id) as num_cases,
           COUNT(*) as total_rows,
           MIN(unit_price) as min_price,
           MAX(unit_price) as max_price,
           ROUND(AVG(unit_price), 1) as avg_price,
           ROUND((MAX(unit_price) - MIN(unit_price)) * 100.0 / NULLIF(MIN(unit_price), 0), 2) as diff_pct,
           GROUP_CONCAT(quotation_case_id || ':' || unit_price || '(' || price_basis_type || ')') as detail
    FROM price_history_v2
    WHERE part_key IS NOT NULL AND part_key != ''
    GROUP BY part_key
    HAVING num_cases > 1
    ORDER BY diff_pct DESC
  `);
  console.log(`복수 케이스에 걸쳐 존재하는 고유 part_key 수: ${crossCase.rows?.length}개`);
  console.table(crossCase.rows?.slice(0, 15));

  // part_key별 편차 통계 요약 (동일 도번 간 단가 편차 통계)
  let exactMatchCount = 0;
  let diffUnder5 = 0;
  let diffUnder20 = 0;
  let diffOver20 = 0;
  const rows = crossCase.rows || [];
  for (const r of rows) {
    const diff = Number(r.diff_pct);
    if (diff === 0) exactMatchCount++;
    else if (diff <= 5) diffUnder5++;
    else if (diff <= 20) diffUnder20++;
    else diffOver20++;
  }
  console.log(`\n동일 part_key의 케이스 간 편차 통계 (총 ${rows.length}개 교집합 부품):`);
  console.log(`- 0% 완전 일치: ${exactMatchCount}개 (${(exactMatchCount*100/rows.length).toFixed(1)}%)`);
  console.log(`- 5% 이하 편차: ${diffUnder5}개 (${(diffUnder5*100/rows.length).toFixed(1)}%)`);
  console.log(`- 20% 이하 편차: ${diffUnder20}개 (${(diffUnder20*100/rows.length).toFixed(1)}%)`);
  console.log(`- 20% 초과 편차: ${diffOver20}개 (${(diffOver20*100/rows.length).toFixed(1)}%)`);

  console.log('\n================================================================');
  console.log('【확인 3】 홀드아웃 케이스 검증 준비 (case_1789566453823 vs 현재 엔진)');
  console.log('================================================================');
  // 케이스 1789566453823의 도면 및 BOM이 DB에 있는지 확인
  const holdoutDrawings = await executeSQL(`
    SELECT COUNT(*) as cnt FROM drawings WHERE quotation_case_id = 'case_1789566453823'
  `);
  console.log('case_1789566453823 drawings count:', holdoutDrawings.rows?.[0]?.cnt);

  const holdoutBom = await executeSQL(`
    SELECT COUNT(*) as cnt FROM normalized_bom_items WHERE quotation_case_id = 'case_1789566453823'
  `);
  console.log('case_1789566453823 normalized_bom_items count:', holdoutBom.rows?.[0]?.cnt);

  const allCasesInBom = await executeSQL(`
    SELECT quotation_case_id, COUNT(*) as cnt, COUNT(DISTINCT item_name) as unique_items
    FROM normalized_bom_items
    GROUP BY quotation_case_id
  `);
  console.log('normalized_bom_items by quotation_case_id:');
  console.table(allCasesInBom.rows);

  const allCasesInDrawings = await executeSQL(`
    SELECT quotation_case_id, COUNT(*) as cnt, COUNT(DISTINCT drawing_number) as unique_dwg
    FROM drawings
    GROUP BY quotation_case_id
  `);
  console.log('drawings by quotation_case_id:');
  console.table(allCasesInDrawings.rows);
}

main().catch(console.error);
