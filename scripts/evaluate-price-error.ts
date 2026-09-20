import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== price_history_v2 241건 정답셋 대비 표준원가 오차율 전수 실측 대조 ===\n`);

  // 1. 적재된 피처 및 원가 조회
  const featRes = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeats = featRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const costRes = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCosts = costRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  console.log(`적재된 피처: ${caseFeats.length}건, 원가: ${caseCosts.length}건`);

  // 피처의 도면 번호 맵 생성
  const costByDwgNo = new Map<string, any>();
  for (const f of caseFeats) {
    if (!f.raw_features_json) continue;
    try {
      const raw = JSON.parse(f.raw_features_json);
      if (raw.drawingNo) {
        const c = caseCosts.find(cost => cost.feature_id === f.id);
        if (c) {
          costByDwgNo.set(raw.drawingNo.trim(), {
            feat: f,
            cost: c,
            partName: raw.partName
          });
        }
      }
    } catch {}
  }
  console.log(`도면 번호 매핑 가능 산출 건수: ${costByDwgNo.size}건`);

  // 2. price_history_v2 241건 조회
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];
  console.log(`price_history_v2 총 건수: ${phRows.length}건`);

  const errors: any[] = [];
  let matchedCount = 0;
  let unpricedCount = 0;

  for (const ph of phRows) {
    const partKey = ph.part_key || '';
    const parts = partKey.split(':');
    const dwgNo = (parts.length >= 2 ? parts[1] : partKey).trim();
    const gtPrice = Number(ph.unit_price || 0);

    if (gtPrice <= 0) {
      unpricedCount++;
      continue;
    }

    const matched = costByDwgNo.get(dwgNo);
    if (matched) {
      matchedCount++;
      const calcPrice = Number(matched.cost.final_unit_price || 0);
      const absDiff = Math.abs(calcPrice - gtPrice);
      const errPct = Number(((absDiff / gtPrice) * 100).toFixed(2));

      errors.push({
        part_key: partKey,
        drawing_no: dwgNo,
        part_name: matched.partName,
        qty_tier: ph.qty_tier,
        gt_unit_price: gtPrice,
        calc_unit_price: calcPrice,
        material_cost_gt: ph.material_cost,
        material_cost_calc: matched.cost.material_cost,
        process_cost_gt: ph.process_cost,
        process_cost_calc: (matched.cost.subtotal_cost || 0) - (matched.cost.material_cost || 0),
        abs_diff: absDiff,
        error_rate_pct: errPct,
        price_basis_type: ph.price_basis_type
      });
    }
  }

  console.log(`\n1:1 대조 매칭 성공: ${matchedCount}건 / ${phRows.length}건`);

  errors.sort((a, b) => b.error_rate_pct - a.error_rate_pct);

  const avgError = errors.length > 0
    ? Number((errors.reduce((sum, e) => sum + e.error_rate_pct, 0) / errors.length).toFixed(2))
    : 0;

  const medianError = errors.length > 0
    ? errors[Math.floor(errors.length / 2)].error_rate_pct
    : 0;

  console.log(`\n=== 실측 오차율 통계 ===`);
  console.log(`대조 건수: ${errors.length}건`);
  console.log(`평균 오차율: ${avgError}%`);
  console.log(`중앙값 오차율: ${medianError}%`);

  console.log(`\n=== 오차 상위 10건 (Top 10) 세부 원인 분석 ===`);
  errors.slice(0, 10).forEach((e, idx) => {
    console.log(`\n[#${idx + 1}] 도번: ${e.drawing_no} | 품명: ${e.part_name} | 단가기준: ${e.price_basis_type}`);
    console.log(`  - 정답 단가(GT): ${e.gt_unit_price.toLocaleString()}원 (재료비: ${e.material_cost_gt?.toLocaleString()}원, 공정비: ${e.process_cost_gt?.toLocaleString()}원)`);
    console.log(`  - 산출 단가(Calc): ${e.calc_unit_price.toLocaleString()}원 (재료비: ${e.material_cost_calc?.toLocaleString()}원, 공정비: ${e.process_cost_calc?.toLocaleString()}원)`);
    console.log(`  - 절대오차: ${e.abs_diff.toLocaleString()}원 | 오차율: ${e.error_rate_pct}%`);
  });

  // 오차 구간별 분포
  const under5 = errors.filter(e => e.error_rate_pct <= 5).length;
  const under10 = errors.filter(e => e.error_rate_pct > 5 && e.error_rate_pct <= 10).length;
  const under20 = errors.filter(e => e.error_rate_pct > 10 && e.error_rate_pct <= 20).length;
  const over20 = errors.filter(e => e.error_rate_pct > 20).length;

  console.log(`\n=== 오차율 구간 분포 ===`);
  console.log(`  - 5% 이하 (매우 정밀): ${under5}건 (${((under5/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 5% 초과 ~ 10% 이하: ${under10}건 (${((under10/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 10% 초과 ~ 20% 이하: ${under20}건 (${((under20/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 20% 초과: ${over20}건 (${((over20/errors.length)*100).toFixed(1)}%)`);
}

main().catch(console.error);
