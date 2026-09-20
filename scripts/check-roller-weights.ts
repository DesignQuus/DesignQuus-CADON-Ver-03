import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  // part_fabrication_features 상위 20개 부품 중량 및 규격
  const res = await executeSQL(`
    SELECT d.drawing_no_normalized, d.drawing_name_raw, f.process_type, f.material_code,
           f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg, f.raw_features_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
    ORDER BY f.part_weight_kg DESC
    LIMIT 25
  `);

  console.log('중량 상위 25개 부품:');
  console.table((res.rows || []).map((r: any) => {
    let meta: any = {};
    try { meta = JSON.parse(r.raw_features_json); } catch {}
    return {
      도번: r.drawing_no_normalized,
      품명: r.drawing_name_raw,
      재질: r.material_code,
      형상: meta.materialShape,
      W: r.bbox_width,
      L: r.bbox_length,
      T: meta.realThickness ?? r.bbox_thickness,
      Ø: meta.diameter,
      중량kg: r.part_weight_kg
    };
  }));

  // FREE ROLLER 부품 찾기
  const rollerRes = await executeSQL(`
    SELECT d.drawing_no_normalized, d.drawing_name_raw, f.process_type, f.material_code,
           f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg, f.raw_features_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
      AND d.drawing_name_raw LIKE '%ROLLER%'
  `);
  console.log('\nROLLER 관련 부품:');
  console.table((rollerRes.rows || []).map((r: any) => {
    let meta: any = {};
    try { meta = JSON.parse(r.raw_features_json); } catch {}
    return {
      도번: r.drawing_no_normalized,
      품명: r.drawing_name_raw,
      재질: r.material_code,
      형상: meta.materialShape,
      W: r.bbox_width,
      L: r.bbox_length,
      T: meta.realThickness ?? r.bbox_thickness,
      Ø: meta.diameter,
      중량kg: r.part_weight_kg
    };
  }));
}

main().catch(console.error);
