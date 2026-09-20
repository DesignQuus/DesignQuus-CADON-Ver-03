import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const res = await executeSQL(`
    SELECT d.drawing_no_normalized, d.drawing_name_raw, f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg, f.raw_features_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}' AND f.bbox_thickness = 20
  `);
  console.log(`t20으로 잡힌 부품 수: ${res.rows?.length}건`);
  console.table((res.rows || []).slice(0, 20).map((r: any) => ({
    도번: r.drawing_no_normalized,
    품명: r.drawing_name_raw,
    W: r.bbox_width,
    L: r.bbox_length,
    T: r.bbox_thickness,
    중량: r.part_weight_kg
  })));
}

main().catch(console.error);
