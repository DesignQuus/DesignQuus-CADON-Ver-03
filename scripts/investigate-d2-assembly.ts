import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 피처 테이블
  const featRes = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeats = featRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  // 원가 테이블
  const costRes = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCosts = costRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  // 1. process_type 분포
  const pMap: Record<string, number> = {};
  caseFeats.forEach(f => {
    pMap[f.process_type] = (pMap[f.process_type] || 0) + 1;
  });
  console.log('[125건 process_type 분포]:', pMap);

  // 2. 조립도(ASSEMBLY) 항목 검출
  console.log('\n[조립도 의심 품목 및 원가 산출 상태]:');
  let assemblyCount = 0;
  for (const f of caseFeats) {
    const raw = JSON.parse(f.raw_features_json || '{}');
    const name = raw.partName || '';
    const isAssy = name.includes('조립') || name.toLowerCase().includes('assembly') || name.toLowerCase().includes('assy');
    if (isAssy) {
      assemblyCount++;
      const cost = caseCosts.find(c => c.feature_id === f.id);
      console.log(` - 품명: "${name}", 도번: "${raw.drawingNo}", process_type: ${f.process_type}, final_price: ${cost?.final_unit_price}원, machining_cost: ${cost?.machining_cost}원`);
    }
  }
  console.log(`조립도 검출 총 건수: ${assemblyCount}건`);
}

main().catch(console.error);
