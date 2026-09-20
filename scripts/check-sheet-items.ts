import { queryTable } from '../egdesk-helpers';

async function main() {
  const ph = await queryTable('price_history_v2', { limit: 500 });
  const sheetItems = ph.rows?.filter(r => r.price_basis_type === 'SHEET_METAL_MODEL') || [];
  console.log(`SHEET_METAL_MODEL 품목 (${sheetItems.length}건):`);
  const uniqueKeys = new Set();
  for (const s of sheetItems) {
    if (!uniqueKeys.has(s.part_key)) {
      uniqueKeys.add(s.part_key);
      console.log(` - ${s.part_key} | price: ${s.unit_price}원 | calc: ${s.basis_calc_json}`);
    }
  }
}

main().catch(console.error);
