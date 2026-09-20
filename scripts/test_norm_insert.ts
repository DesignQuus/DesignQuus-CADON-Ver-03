import { db, insertRows } from '../src/lib/db';
import fs from 'fs';

async function test() {
  const normData = JSON.parse(fs.readFileSync('storage/temp/test_norm.json', 'utf-8'));
  const quotationCaseId = 'case_1789766302590';
  const now = new Date().toISOString();

  console.log('Total items in test_norm.json:', normData.normalized_items.length);
  const normRows = normData.normalized_items.map((ni: any, idx: number) => ({
    id: `norm_${quotationCaseId}_${idx + 1}`,
    quotation_case_id: quotationCaseId,
    raw_name: ni.raw_name,
    normalized_name: ni.normalized_name,
    search_name: ni.search_name,
    direction: ni.direction,
    spec_candidate: ni.spec_candidate,
    material_candidate: ni.material_candidate,
    quantity: ni.quantity,
    unit: ni.unit,
    status: ni.status,
    created_at: now
  }));

  try {
    await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(quotationCaseId);
    console.log('Deleted old rows.');
    await insertRows('normalized_bom_items', normRows);
    console.log('Successfully inserted rows!');
    const cnt = ((await db.prepare('SELECT COUNT(*) as c FROM normalized_bom_items WHERE quotation_case_id = ?').get(quotationCaseId)) as any).c;
    console.log('Count in DB now:', cnt);
  } catch (e) {
    console.error('Insert error:', e);
  }
}

test().catch(console.error);
