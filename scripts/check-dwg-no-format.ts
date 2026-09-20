import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const feats = await executeSQL(`
    SELECT f.id, f.drawing_id, f.raw_features_json, d.drawing_no_normalized
    FROM part_fabrication_features f
    LEFT JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
    LIMIT 10
  `);
  console.log('sample features:');
  for (const r of (feats.rows || [])) {
    console.log(`id: ${r.id}, dwg_id: ${r.drawing_id}, dwg_no: ${r.drawing_no_normalized}, raw_feat: ${r.raw_features_json}`);
  }
}

main().catch(console.error);
