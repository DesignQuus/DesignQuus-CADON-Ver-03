import { queryTable } from '../egdesk-helpers';

async function main() {
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const rows = phRes.rows || [];

  console.log(`=== [조건 1] price_history_v2 케이스 간 동일 도번 단가 편차 실측 ===\n`);

  // 도번별로 케이스별 단가 그룹화
  const dwgMap = new Map<string, {
    part_key: string,
    cases: Record<string, { unit_price: number, material_cost: number, process_cost: number, qty_tier: string }>
  }>();

  for (const r of rows) {
    const partKey = r.part_key || '';
    const parts = partKey.split(':');
    const dwgNo = (parts.length >= 2 ? parts[1] : partKey).trim();
    const caseId = r.quotation_case_id || 'UNKNOWN';

    if (!dwgMap.has(dwgNo)) {
      dwgMap.set(dwgNo, { part_key: partKey, cases: {} });
    }
    dwgMap.get(dwgNo)!.cases[caseId] = {
      unit_price: Number(r.unit_price || 0),
      material_cost: Number(r.material_cost || 0),
      process_cost: Number(r.process_cost || 0),
      qty_tier: r.qty_tier || ''
    };
  }

  console.log(`전체 고유 도번 수 (Unique Drawing Numbers): ${dwgMap.size}개 (전체 행: ${rows.length}건)`);

  let multiCaseCount = 0;
  let exactMatchCount = 0;
  let diffPriceCount = 0;
  const diffSamples: any[] = [];

  for (const [dwgNo, data] of dwgMap.entries()) {
    const caseIds = Object.keys(data.cases);
    if (caseIds.length > 1) {
      multiCaseCount++;
      const prices = caseIds.map(c => data.cases[c].unit_price);
      const allEqual = prices.every(p => p === prices[0]);
      if (allEqual) {
        exactMatchCount++;
      } else {
        diffPriceCount++;
        diffSamples.push({
          dwgNo,
          part_key: data.part_key,
          cases: data.cases
        });
      }
    }
  }

  console.log(`\n복수 케이스에 존재하는 도번 수: ${multiCaseCount}개`);
  console.log(` - 케이스 간 단가 100% 일치 도번: ${exactMatchCount}개 (${((exactMatchCount/multiCaseCount)*100).toFixed(1)}%)`);
  console.log(` - 케이스 간 단가 편차 발생 도번: ${diffPriceCount}개 (${((diffPriceCount/multiCaseCount)*100).toFixed(1)}%)`);

  if (diffSamples.length > 0) {
    console.log('\n[단가 편차 발생 샘플]:');
    diffSamples.slice(0, 5).forEach(s => {
      console.log(`도번 ${s.dwgNo}:`, s.cases);
    });
  }

  // 케이스별 고유 도번 수
  const caseDwgCounts: Record<string, number> = {};
  for (const r of rows) {
    const c = r.quotation_case_id || 'UNKNOWN';
    caseDwgCounts[c] = (caseDwgCounts[c] || 0) + 1;
  }
  console.log('\n케이스별 행 수:', caseDwgCounts);
}

main().catch(console.error);
