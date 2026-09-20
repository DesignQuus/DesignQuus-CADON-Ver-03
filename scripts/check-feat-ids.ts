import { db } from '../src/lib/db';

async function checkFeatIds() {
  const caseId = 'case_1789894718545';
  const feats = await db.prepare(`SELECT * FROM part_fabrication_features WHERE quotation_case_id = ? LIMIT 3`).all(caseId);
  console.log('feats:', feats);

  const dwgs = await db.prepare(`SELECT * FROM drawings WHERE quotation_case_id = ? LIMIT 3`).all(caseId);
  console.log('dwgs:', dwgs);
}

checkFeatIds().catch(console.error);
