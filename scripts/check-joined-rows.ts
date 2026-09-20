import { db } from '../src/lib/db';

async function checkDwgRows() {
  const caseId = 'case_1789894718545';
  const rows = await db.prepare(`
    SELECT f.id, f.drawing_id, d.drawing_type, d.is_quote_included, f.part_weight_kg
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`JOIN rows: ${rows.length}건`);
  console.log('Sample rows:', rows.slice(0, 5));
}

checkDwgRows().catch(console.error);
