import { db } from '../src/lib/db';

async function checkRaw() {
  const caseId = 'case_1789766302590';
  const queries = ['F3S25N', 'DV2', 'DV3', 'CDQ2B63', 'MISUMI', 'LMF16', 'FLOATING', '24V', 'ITOH', 'FR381BW'];
  for (const q of queries) {
    const rows = (await db.prepare(`
      SELECT drawing_no, item_no_raw, part_no_raw, name_raw, specification_raw, material_raw, quantity_raw, remark_raw
      FROM raw_bom_items
      WHERE quotation_case_id = ? AND (
        part_no_raw LIKE ? OR name_raw LIKE ? OR specification_raw LIKE ? OR remark_raw LIKE ?
      )
      LIMIT 3
    `).all(caseId, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)) as any[];
    console.log(`\n=== Query: "${q}" (matches: ${rows.length}) ===`);
    rows.forEach(r => console.log('  ->', r));
  }
}

checkRaw().catch(console.error);
