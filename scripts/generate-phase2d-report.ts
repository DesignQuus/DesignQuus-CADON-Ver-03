import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  console.log('=== Phase 2-D 최종 완료 실측 데이터 조회 ===\n');

  const featRes = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeats = featRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const costRes = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCosts = costRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  console.log(`part_fabrication_features: ${caseFeats.length}건`);
  console.log(`part_cost_breakdowns: ${caseCosts.length}건`);

  // 조립도, 판금, 절삭가공, 도면미존재 샘플 각 1건 추출
  const assyFeat = caseFeats.find(f => f.process_type === 'ASSEMBLY');
  const assyCost = caseCosts.find(c => c.feature_id === assyFeat?.id);

  const sheetFeat = caseFeats.find(f => f.process_type === 'SHEET_METAL');
  const sheetCost = caseCosts.find(c => c.feature_id === sheetFeat?.id);

  const machFeat = caseFeats.find(f => f.process_type === 'MACHINING');
  const machCost = caseCosts.find(c => c.feature_id === machFeat?.id);

  const noDwgFeat = caseFeats.find(f => !f.drawing_id);
  const noDwgCost = caseCosts.find(c => c.feature_id === noDwgFeat?.id);

  console.log('\n--- 1. 조립도 (ASSEMBLY, 원가 0원 배제) ---');
  console.log('피처:', JSON.stringify(assyFeat, null, 2));
  console.log('원가:', JSON.stringify(assyCost, null, 2));

  console.log('\n--- 2. 판금 커버 (SHEET_METAL) ---');
  console.log('피처:', JSON.stringify(sheetFeat, null, 2));
  console.log('원가:', JSON.stringify(sheetCost, null, 2));

  console.log('\n--- 3. 절삭 가공 부품 (MACHINING, 공수기반 모델) ---');
  console.log('피처:', JSON.stringify(machFeat, null, 2));
  console.log('원가:', JSON.stringify(machCost, null, 2));

  console.log('\n--- 4. 도면 미존재 (PURCHASE/NULL 엄격보존) ---');
  console.log('피처:', JSON.stringify(noDwgFeat, null, 2));
  console.log('원가:', JSON.stringify(noDwgCost, null, 2));
}

main().catch(console.error);
