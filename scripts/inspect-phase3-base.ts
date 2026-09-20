import { executeSQL } from '../egdesk-helpers';

async function checkPhase3Base() {
  const caseId = 'case_1789766302590';
  
  // 1. target case Features by process_type
  const feats = await executeSQL(`
    SELECT process_type, COUNT(*) as cnt
    FROM part_fabrication_features
    WHERE quotation_case_id = '${caseId}'
    GROUP BY process_type
  `);
  console.log('=== 1. Target Case Features by process_type ===');
  console.table(feats.rows);

  // 2. target case drawing_relationships
  const rels = await executeSQL(`
    SELECT relationship_type, COUNT(*) as cnt
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
    GROUP BY relationship_type
  `);
  console.log('=== 2. Target Case Drawing Relationships ===');
  console.table(rels.rows);

  // 3. Drawing relationships sample
  const relSample = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no, relationship_type, confidence_score
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
    LIMIT 5
  `);
  console.log('=== 3. Drawing Relationships Sample ===');
  console.table(relSample.rows);

  // 4. Sample candidate parts for Human Verification (Machining 10, Sheet Metal 10, Purchase 5)
  console.log('=== 4. Machining Candidates (10 items) ===');
  const machSamples = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.material_candidate, b.quantity, 
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness
    FROM normalized_bom_items b
    JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND f.process_type = 'MACHINING'
    ORDER BY f.part_weight_kg DESC
    LIMIT 10
  `);
  console.table(machSamples.rows);

  console.log('=== 5. Sheet Metal Candidates (10 items) ===');
  const sheetSamples = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.material_candidate, b.quantity, 
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.cutting_length_total
    FROM normalized_bom_items b
    JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND f.process_type = 'SHEET_METAL'
    ORDER BY f.part_weight_kg DESC
    LIMIT 10
  `);
  console.table(sheetSamples.rows);

  console.log('=== 6. Purchase / Unextracted Candidates (8 items) ===');
  const purSamples = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.spec_candidate, b.quantity, f.process_type
    FROM normalized_bom_items b
    LEFT JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND (f.process_type = 'PURCHASE' OR f.drawing_id IS NULL)
    LIMIT 8
  `);
  console.table(purSamples.rows);
}

checkPhase3Base().catch(console.error);
