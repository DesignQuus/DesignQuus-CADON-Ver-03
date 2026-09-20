import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const test1 = await executeSQL(`
    SELECT f.id, f.raw_features_json, d.drawing_no_normalized
    FROM part_fabrication_features f
    LEFT JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
      AND (f.raw_features_json LIKE '%240314-03-001%' OR d.drawing_no_normalized = '240314-03-001')
  `);
  console.log('240314-03-001 in part_fabrication_features:', test1.rows);

  const testDwg = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, material
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
      AND drawing_no_normalized = '240314-03-001'
  `);
  console.log('240314-03-001 in drawings:', testDwg.rows);

  const testBom = await executeSQL(`
    SELECT id, raw_name, normalized_name, material_candidate
    FROM normalized_bom_items
    WHERE quotation_case_id = '${caseId}'
      AND (raw_name LIKE '%240314-03-001%' OR normalized_name LIKE '%240314-03-001%')
  `);
  console.log('240314-03-001 in normalized_bom_items:', testBom.rows);
}

main().catch(console.error);
