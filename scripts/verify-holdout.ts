import { executeSQL } from '../egdesk-helpers';

async function main() {
  console.log('================================================================');
  console.log('【확인 3】 홀드아웃 케이스 (case_1789566453823) 블라인드 테스트');
  console.log('================================================================');

  // 1. case_1789566453823의 price_history_v2 (정답셋)
  const gtRes = await executeSQL(`
    SELECT part_key, price_basis_type, unit_price, material_cost, process_cost, basis_calc_json
    FROM price_history_v2
    WHERE quotation_case_id = 'case_1789566453823'
  `);
  const gtRows = gtRes.rows || [];
  console.log(`홀드아웃 case_1789566453823 정답셋 건수: ${gtRows.length}건`);

  // 2. 현재 엔진 산출값 (part_cost_breakdowns + part_fabrication_features)
  const calcRes = await executeSQL(`
    SELECT f.raw_features_json, c.final_unit_price, c.material_cost, c.machining_cost, c.calc_formula_json
    FROM part_cost_breakdowns c
    JOIN part_fabrication_features f ON c.feature_id = f.id
    WHERE c.quotation_case_id = 'case_1789766302590'
  `);
  const calcRows = calcRes.rows || [];
  const calcMap = new Map<string, any>();
  for (const c of calcRows) {
    try {
      const feat = JSON.parse(c.raw_features_json);
      if (feat.drawingNo) {
        calcMap.set(feat.drawingNo, c);
      }
    } catch {}
  }
  console.log(`현재 엔진 산출 단품 도번 수: ${calcMap.size}건`);

  // 3. 대조 수행
  let matchedCount = 0;
  let totalErrorSum = 0;
  let errorUnder5 = 0;
  let errorUnder20 = 0;
  let errorOver20 = 0;

  const comparisonDetails: any[] = [];

  for (const gt of gtRows) {
    const parts = gt.part_key.split(':');
    const dwgNo = parts[1] || gt.part_key;
    const calc = calcMap.get(dwgNo);
    if (!calc) continue;

    matchedCount++;
    const gtPrice = Number(gt.unit_price);
    const enginePrice = Number(calc.final_unit_price);
    const errPct = Math.abs(enginePrice - gtPrice) * 100.0 / Math.max(gtPrice, 1);
    totalErrorSum += errPct;

    if (errPct <= 5) errorUnder5++;
    else if (errPct <= 20) errorUnder20++;
    else errorOver20++;

    comparisonDetails.push({
      dwgNo,
      basisType: gt.price_basis_type,
      gtPrice,
      enginePrice,
      diff: enginePrice - gtPrice,
      errPct: Number(errPct.toFixed(2))
    });
  }

  comparisonDetails.sort((a, b) => b.errPct - a.errPct);

  console.log(`\n[홀드아웃 블라인드 테스트 실측 결과 (총 ${matchedCount}건 매칭)]:`);
  console.log(`- 평균 오차율: ${(totalErrorSum / matchedCount).toFixed(2)}%`);
  console.log(`- 5% 이하 일치: ${errorUnder5}건 (${(errorUnder5*100/matchedCount).toFixed(1)}%)`);
  console.log(`- 20% 이하 일치: ${errorUnder20}건 (${(errorUnder20*100/matchedCount).toFixed(1)}%)`);
  console.log(`- 20% 초과 오차: ${errorOver20}건 (${(errorOver20*100/matchedCount).toFixed(1)}%)`);

  console.log('\n[오차 상위 10건 상세]:');
  console.table(comparisonDetails.slice(0, 10));

  console.log('\n[오차 하위(일치) 10건 상세]:');
  console.table(comparisonDetails.slice(-10));

  // 유형별 오차율 분석 (MACHINING_MODEL vs SHEET_METAL_MODEL vs ELECTRICAL_CATALOG)
  const byType: Record<string, { count: number, sumErr: number }> = {};
  for (const item of comparisonDetails) {
    if (!byType[item.basisType]) byType[item.basisType] = { count: 0, sumErr: 0 };
    byType[item.basisType].count++;
    byType[item.basisType].sumErr += item.errPct;
  }
  console.log('\n[정답셋 유형별 평균 오차율]:');
  for (const [k, v] of Object.entries(byType)) {
    console.log(`- ${k}: ${v.count}건, 평균 오차율 ${(v.sumErr / v.count).toFixed(2)}%`);
  }
}

main().catch(console.error);
