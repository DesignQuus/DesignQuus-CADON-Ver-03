import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. price_history_v2 241건 로드
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];
  console.log(`price_history_v2 총 건수: ${phRows.length}건`);

  // 2. quotation_case_id 분포 확인
  const caseCounts: Record<string, number> = {};
  for (const ph of phRows) {
    const c = ph.quotation_case_id || 'NULL';
    caseCounts[c] = (caseCounts[c] || 0) + 1;
  }
  console.log('\n[price_history_v2의 quotation_case_id 분포]');
  console.log(caseCounts);

  // 3. qty_tier 분포 확인
  const tierCounts: Record<string, number> = {};
  for (const ph of phRows) {
    const t = ph.qty_tier || 'NULL';
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }
  console.log('\n[price_history_v2의 qty_tier 분포]');
  console.log(tierCounts);

  // 4. case_1789766302590의 도면 목록 로드
  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  const dwgSet = new Set(caseDrawings.map(d => d.drawing_no_normalized?.trim()));

  // 139건 제외 사유 분류
  let unmatchedCase = 0;
  let unmatchedDwgNo = 0;
  let otherTier = 0;
  let zeroPrice = 0;
  const unmatchedDwgSamples: string[] = [];

  for (const ph of phRows) {
    const partKey = ph.part_key || '';
    const parts = partKey.split(':');
    const dwgNo = (parts.length >= 2 ? parts[1] : partKey).trim();

    if (Number(ph.unit_price || 0) <= 0) {
      zeroPrice++;
      continue;
    }

    if (!dwgSet.has(dwgNo)) {
      unmatchedDwgNo++;
      if (unmatchedDwgSamples.length < 15) {
        unmatchedDwgSamples.push(`part_key=${partKey} (case=${ph.quotation_case_id}, tier=${ph.qty_tier})`);
      }
    }
  }

  console.log('\n[대조 제외 사유 분석]');
  console.log(` - 현재 케이스 도면번호(${dwgSet.size}개)에 없는 도번: ${unmatchedDwgNo}건`);
  console.log(` - 단가 0원 이하: ${zeroPrice}건`);
  console.log('\n[미매칭 도번 샘플 15건]:');
  unmatchedDwgSamples.forEach(s => console.log('  ', s));
}

main().catch(console.error);
