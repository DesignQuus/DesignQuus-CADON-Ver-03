import { queryTable } from '../egdesk-helpers';

async function main() {
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const sheetPh = phRes.rows?.filter(r => r.price_basis_type === 'SHEET_METAL_MODEL') || [];
  console.log(`SHEET_METAL_MODEL 건수: ${sheetPh.length}건`);
  for (const row of sheetPh.slice(0, 3)) {
    console.log(`\npart_key: ${row.part_key} | unit_price: ${row.unit_price}`);
    console.log(`  - material_cost: ${row.material_cost}, process_cost: ${row.process_cost}`);
    console.log(`  - basis_calc_json: ${row.basis_calc_json}`);
  }
}

main().catch(console.error);
