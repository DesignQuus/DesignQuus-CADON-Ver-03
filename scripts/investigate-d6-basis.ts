import { queryTable } from '../egdesk-helpers';

async function main() {
  const phRes = await queryTable('price_history_v2', { limit: 10 });
  console.log('[price_history_v2의 basis_calc_json 샘플]:');
  for (const row of (phRes.rows || []).slice(0, 5)) {
    console.log(`\npart_key: ${row.part_key} | unit_price: ${row.unit_price} | basis_type: ${row.price_basis_type}`);
    console.log(`  - material_cost: ${row.material_cost}, process_cost: ${row.process_cost}, margin_rate: ${row.margin_rate}`);
    console.log(`  - basis_calc_json: ${row.basis_calc_json}`);
  }
}

main().catch(console.error);
