import { queryTable, executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  console.log('=== Phase 2 실측 보고용 데이터 조회 ===\n');

  // 1. 단가표 확인
  const mat = await queryTable('material_rates', { limit: 20 });
  const proc = await queryTable('process_rates', { limit: 20 });
  console.log(`[단가표] material_rates: ${mat.rows?.length}건, process_rates: ${proc.rows?.length}건`);

  // 2. 피처 테이블
  const featRes = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeats = featRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`[피처 대장] part_fabrication_features (${caseId}): ${caseFeats.length}건`);

  // 3. 원가 세부내역 테이블
  const costRes = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCosts = costRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`[원가 세부내역] part_cost_breakdowns (${caseId}): ${caseCosts.length}건`);

  // 4. 컬럼별 NULL 건수 및 비율
  const cols = [
    'drawing_id',
    'bom_item_id',
    'surface_area_cm2',
    'heat_treatment',
    'surface_treatment',
    'raw_features_json'
  ];
  console.log('\n[part_fabrication_features 컬럼별 NULL 현황]');
  for (const c of cols) {
    const nulls = caseFeats.filter(f => f[c] === null || f[c] === undefined).length;
    const pct = ((nulls / caseFeats.length) * 100).toFixed(1);
    console.log(` - ${c}: ${nulls}건 / ${caseFeats.length}건 (${pct}%)`);
  }

  // 5. 행 3건 원본 데이터 (도면 매칭 판금 1건, 가공 1건, 미매칭 1건)
  const sheetSample = caseFeats.find(f => f.process_type === 'SHEET_METAL' && f.drawing_id);
  const machSample = caseFeats.find(f => f.process_type === 'MACHINING' && f.drawing_id);
  const noDwgSample = caseFeats.find(f => !f.drawing_id);

  console.log('\n[행 3건 원본 데이터]');
  console.log('\n--- 1. 판금 부품 (SHEET_METAL) ---');
  console.log(JSON.stringify(sheetSample, null, 2));
  if (sheetSample) {
    const cost = caseCosts.find(c => c.feature_id === sheetSample.id);
    console.log('원가 연동:', JSON.stringify(cost, null, 2));
  }

  console.log('\n--- 2. 절삭 가공 부품 (MACHINING) ---');
  console.log(JSON.stringify(machSample, null, 2));
  if (machSample) {
    const cost = caseCosts.find(c => c.feature_id === machSample.id);
    console.log('원가 연동:', JSON.stringify(cost, null, 2));
  }

  console.log('\n--- 3. 도면 미존재 부품 (NULL 엄격 보존) ---');
  console.log(JSON.stringify(noDwgSample, null, 2));
  if (noDwgSample) {
    const cost = caseCosts.find(c => c.feature_id === noDwgSample.id);
    console.log('원가 연동:', JSON.stringify(cost, null, 2));
  }
}

main().catch(console.error);
