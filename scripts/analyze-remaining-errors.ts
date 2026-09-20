import { queryTable, executeSQL } from '../egdesk-helpers';

async function main() {
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];

  // case_1789642175904 기준 상위 오차 항목의 실제 단가 및 재료비/공정비 구조 확인
  const samples = ['240314-DV3-014', '240314-DV3-001', '240314-DV3-006', '240314-DV1-003', '240324-02-001'];
  for (const s of samples) {
    const matched = phRows.find(r => (r.part_key || '').includes(s) && r.quotation_case_id === 'case_1789642175904');
    if (matched) {
      console.log(`\n[도번: ${s}] GT 단가: ${matched.unit_price}원`);
      console.log(`  - 재료비: ${matched.material_cost}, 공정비: ${matched.process_cost}`);
      console.log(`  - basis: ${matched.price_basis_type}`);
      console.log(`  - calc: ${matched.basis_calc_json}`);
    }
  }
}

main().catch(console.error);
