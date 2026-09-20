import { db } from '../src/lib/db';

async function runQueries() {
  const caseId = 'case_1789766302590';
  console.log('=== START VERIFICATION QUERIES ===');

  // 1. 업로드 파일 이력
  console.log('--- 1. uploaded_files ---');
  const q1 = await db.prepare(`
    SELECT id, original_file_name, file_size, created_at
    FROM uploaded_files
    WHERE quotation_case_id = ?
    ORDER BY created_at
  `).all(caseId);
  console.log(JSON.stringify(q1, null, 2));

  // 2. 각 테이블 건수
  console.log('--- 2. table counts ---');
  const q2 = await db.prepare(`
    SELECT 'drawings' t, COUNT(*) c FROM drawings WHERE quotation_case_id = ?
    UNION ALL SELECT 'raw_bom_items', COUNT(*) FROM raw_bom_items WHERE quotation_case_id = ?
    UNION ALL SELECT 'normalized_bom_items', COUNT(*) FROM normalized_bom_items WHERE quotation_case_id = ?
    UNION ALL SELECT 'flattened_bom_items', COUNT(*) FROM flattened_bom_items WHERE quotation_case_id = ?
    UNION ALL SELECT 'final_bom_items', COUNT(*) FROM final_bom_items WHERE quotation_case_id = ?
  `).all(caseId, caseId, caseId, caseId, caseId);
  console.log(JSON.stringify(q2, null, 2));

  // 3. drawing_type별 분포
  console.log('--- 3. drawing_type distribution ---');
  const q3 = await db.prepare(`
    SELECT drawing_type, COUNT(*) as cnt
    FROM drawings
    WHERE quotation_case_id = ?
    GROUP BY drawing_type
  `).all(caseId);
  console.log(JSON.stringify(q3, null, 2));

  // 4. 견적 제외 항목
  console.log('--- 4. excluded items ---');
  const q4_cnt = await db.prepare(`
    SELECT COUNT(*) as cnt
    FROM drawings
    WHERE quotation_case_id = ? AND is_quote_included = 0
  `).all(caseId);
  console.log('제외 건수:', JSON.stringify(q4_cnt, null, 2));

  const q4_list = await db.prepare(`
    SELECT drawing_no_normalized, drawing_name_raw, drawing_type
    FROM drawings
    WHERE quotation_case_id = ? AND is_quote_included = 0
  `).all(caseId);
  console.log('제외 목록:', JSON.stringify(q4_list, null, 2));

  // 5. 피처 및 중량
  console.log('--- 5. features and weight ---');
  const q5 = await db.prepare(`
    SELECT COUNT(*) as cnt, ROUND(SUM(part_weight_kg), 3) as total_weight
    FROM part_fabrication_features
    WHERE quotation_case_id = ?
  `).all(caseId);
  console.log(JSON.stringify(q5, null, 2));

  // 6. 마스터 매칭
  console.log('--- 6. master candidates ---');
  const q6_all = await db.prepare(`
    SELECT COUNT(*) as total_candidates
    FROM master_candidates
    WHERE normalized_item_id IN (
      SELECT id FROM normalized_bom_items WHERE quotation_case_id = ?
    )
  `).all(caseId);
  console.log('후보 총 건수:', JSON.stringify(q6_all, null, 2));

  const q6_dist = await db.prepare(`
    SELECT COUNT(DISTINCT normalized_item_id) as distinct_matched_items
    FROM master_candidates
    WHERE normalized_item_id IN (
      SELECT id FROM normalized_bom_items WHERE quotation_case_id = ?
    )
  `).all(caseId);
  console.log('후보 매칭된 고유 품목 수:', JSON.stringify(q6_dist, null, 2));

  // 7. 파싱 이력
  console.log('--- 7. cad_parse_runs (linked via source_file_id) ---');
  const q7 = await db.prepare(`
    SELECT id, source_file_id, status, total_entities, duration_ms, created_at
    FROM cad_parse_runs
    WHERE source_file_id IN (
      SELECT id FROM uploaded_files WHERE quotation_case_id = ?
    )
    ORDER BY created_at
  `).all(caseId);
  console.log('케이스 연동 파싱 이력:', JSON.stringify(q7, null, 2));

  const q7_all = await db.prepare(`
    SELECT id, source_file_id, status, total_entities, duration_ms, created_at
    FROM cad_parse_runs
    ORDER BY created_at DESC
    LIMIT 5
  `).all();
  console.log('최근 전체 파싱 이력 (최근 5건):', JSON.stringify(q7_all, null, 2));

  console.log('=== END VERIFICATION QUERIES ===');
}

runQueries().catch(err => {
  console.error(err);
  process.exit(1);
});
