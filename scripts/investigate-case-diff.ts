import { queryTable } from '../egdesk-helpers';

async function main() {
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const rows = phRes.rows || [];

  const sampleDwg = '240314-03-004';
  const matched = rows.filter(r => (r.part_key || '').includes(sampleDwg));
  console.log(`[도번 ${sampleDwg}의 케이스별 세부내역 비교]:`);
  matched.forEach(m => {
    console.log(`\n케이스: ${m.quotation_case_id}`);
    console.log(` - 단가: ${m.unit_price}원 (재료비: ${m.material_cost}, 공정비: ${m.process_cost})`);
    console.log(` - 단가기준: ${m.price_basis_type}`);
    console.log(` - basis_calc_json: ${m.basis_calc_json}`);
  });

  const sampleDwg2 = '240314-03-001';
  const matched2 = rows.filter(r => (r.part_key || '').includes(sampleDwg2));
  console.log(`\n[도번 ${sampleDwg2}의 케이스별 세부내역 비교]:`);
  matched2.forEach(m => {
    console.log(`\n케이스: ${m.quotation_case_id}`);
    console.log(` - 단가: ${m.unit_price}원 (재료비: ${m.material_cost}, 공정비: ${m.process_cost})`);
    console.log(` - 단가기준: ${m.price_basis_type}`);
    console.log(` - basis_calc_json: ${m.basis_calc_json}`);
  });
}

main().catch(console.error);
