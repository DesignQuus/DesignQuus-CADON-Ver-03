import { db } from '../src/lib/db';

async function inspectDiffs() {
  const caseId = 'case_1789766302590';
  const rows = await db.prepare(`
    SELECT f.id, f.drawing_id, d.drawing_no_normalized, d.drawing_name_raw,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.material_code, f.raw_features_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
      AND d.drawing_no_normalized IN ('240314-DV2-010', '240314-DV2-011', '240314-DV2-012', '240314-DV2-015', '240314-G1-014')
  `).all(caseId);

  console.log(JSON.stringify(rows, null, 2));
}

inspectDiffs().catch(console.error);
