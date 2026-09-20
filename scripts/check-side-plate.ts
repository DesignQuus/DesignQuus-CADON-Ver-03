import { queryTable } from '../egdesk-helpers';

async function main() {
  const dwg = await queryTable('drawings', { limit: 1000 });
  const d = dwg.rows?.find(r => r.drawing_no_normalized === '240314-DV3-014');
  console.log('SIDE PLATE-2 drawing:', { no: d?.drawing_no_normalized, name: d?.drawing_name_normalized, mat: d?.material, scale: d?.scale });
  
  const ph = await queryTable('price_history_v2', { limit: 500 });
  const p = ph.rows?.find(r => (r.part_key || '').includes('240314-DV3-014'));
  console.log('GT:', { price: p?.unit_price, basis: p?.price_basis_type, calc: p?.basis_calc_json });
}

main().catch(console.error);
