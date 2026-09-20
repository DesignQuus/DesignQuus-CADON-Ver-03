import { db } from '../src/lib/db';

async function checkRelationships() {
  const caseId = 'case_1789766302590';
  const rels = await db.prepare(`
    SELECT * FROM drawing_relationships WHERE quotation_case_id = ? LIMIT 20
  `).all(caseId);
  console.log('Relationships count:', rels.length);
  console.log('Sample rels:', rels.slice(0, 5));

  const totalRels = await db.prepare(`
    SELECT COUNT(*) as c FROM drawing_relationships WHERE quotation_case_id = ?
  `).all(caseId);
  console.log('Total relationships:', totalRels);
}

checkRelationships().catch(console.error);
