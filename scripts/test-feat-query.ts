import { executeSQL } from '../egdesk-helpers';

async function testFeatQuery() {
  const caseId = 'case_1789766302590';
  
  // 1. part_fabrication_features 테이블 단독 조회
  const feats = await executeSQL(`
    SELECT id, drawing_id, process_type, material_code, part_weight_kg, bbox_thickness, raw_features_json
    FROM part_fabrication_features
    WHERE quotation_case_id = '${caseId}'
  `);
  console.log('features count:', feats.rows?.length);
  if (feats.rows && feats.rows.length > 0) {
    console.log('sample feature 0:', feats.rows[0]);
  }

  // 2. drawings 와 JOIN 확인
  const joined = await executeSQL(`
    SELECT f.id, f.drawing_id, d.drawing_no_normalized
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
  `);
  console.log('joined count:', joined.rows?.length);
}

testFeatQuery().catch(console.error);
