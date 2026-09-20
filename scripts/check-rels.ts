import { executeSQL } from '../egdesk-helpers';

async function checkRel() {
  const caseId = 'case_1789766302590';
  const rels = await executeSQL(`
    SELECT relationship_type, COUNT(*) as cnt
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
    GROUP BY relationship_type
  `);
  console.log('=== Target Case Drawing Relationships ===');
  console.table(rels.rows);

  const allRels = await executeSQL(`
    SELECT quotation_case_id, COUNT(*) as cnt
    FROM drawing_relationships
    GROUP BY quotation_case_id
  `);
  console.log('=== All Drawing Relationships in DB ===');
  console.table(allRels.rows);
}

checkRel().catch(console.error);
