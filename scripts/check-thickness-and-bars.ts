import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  console.log('================================================================');
  console.log('【확인 2】 part_fabrication_features의 bbox_thickness 분포 실측');
  console.log('================================================================');
  const thickDist = await executeSQL(`
    SELECT bbox_thickness, COUNT(*) as cnt, 
           ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM part_fabrication_features WHERE quotation_case_id = '${caseId}'), 2) as pct
    FROM part_fabrication_features
    WHERE quotation_case_id = '${caseId}'
    GROUP BY bbox_thickness
    ORDER BY cnt DESC
  `);
  console.log('bbox_thickness 분포:');
  console.table(thickDist.rows);

  console.log('\n================================================================');
  console.log('【확인 2-2】 도면 텍스트 / 표제란 / 품명 내 두께(t, T) 및 직경(Ø) 표기 실측');
  console.log('================================================================');
  const textSamples = await executeSQL(`
    SELECT b.raw_name, b.normalized_name, b.material_candidate, b.spec_candidate,
           d.drawing_name_raw, d.material as dwg_material, f.bbox_thickness, f.part_weight_kg
    FROM normalized_bom_items b
    JOIN part_fabrication_features f ON b.id = f.bom_item_id
    LEFT JOIN drawings d ON f.drawing_id = d.id
    WHERE b.quotation_case_id = '${caseId}'
    LIMIT 15
  `);
  console.table(textSamples.rows);

  console.log('\n================================================================');
  console.log('【확인 3】 봉재/축류 58 EA 상세 실측 (중량 누락 여부 및 부품 목록)');
  console.log('================================================================');
  // t0 또는 두께 0인 부품들
  const zeroThickParts = await executeSQL(`
    SELECT b.drawing_number, b.raw_name, b.normalized_name, b.material_candidate,
           f.process_type, f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg
    FROM part_fabrication_features f
    JOIN normalized_bom_items b ON f.bom_item_id = b.id
    WHERE f.quotation_case_id = '${caseId}'
      AND (f.bbox_thickness = 0 OR f.bbox_thickness IS NULL)
    LIMIT 20
  `);
  console.log(`두께 0/NULL 부품 수 (총 ${zeroThickParts.rows?.length}건 조회됨):`);
  console.table(zeroThickParts.rows?.slice(0, 15));

  // 84.687kg에 이 58 EA가 포함되었는지 실측
  const weightCheck = await executeSQL(`
    SELECT 
      SUM(CASE WHEN bbox_thickness > 0 THEN part_weight_kg ELSE 0 END) as thick_gt0_weight,
      SUM(CASE WHEN bbox_thickness = 0 OR bbox_thickness IS NULL THEN part_weight_kg ELSE 0 END) as thick_zero_weight,
      SUM(part_weight_kg) as total_feature_weight
    FROM part_fabrication_features
    WHERE quotation_case_id = '${caseId}'
      AND process_type != 'ASSEMBLY'
  `);
  console.log('중량 보존 실측 분해:');
  console.table(weightCheck.rows);

  // t3 부품 샘플
  const t3Samples = await executeSQL(`
    SELECT b.raw_name, b.material_candidate, f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg, f.raw_features_json
    FROM part_fabrication_features f
    JOIN normalized_bom_items b ON f.bom_item_id = b.id
    WHERE f.quotation_case_id = '${caseId}'
      AND f.bbox_thickness = 3
    LIMIT 5
  `);
  console.log('\nt3 부품 샘플 raw_features_json:');
  for (const r of (t3Samples.rows || [])) {
    console.log(`[${r.raw_name}] W: ${r.bbox_width}, L: ${r.bbox_length}, T: ${r.bbox_thickness}, Weight: ${r.part_weight_kg}`);
    try {
      console.log('raw_features_json:', JSON.parse(r.raw_features_json));
    } catch {}
  }
}

main().catch(console.error);
