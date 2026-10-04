import { db, insertRows } from '../src/lib/db';

async function runStep2Verification() {
  console.log('=== [Step 2 Verification: File-scoped Isolation] Starting test ===');
  
  const now = new Date().toISOString();
  const testCaseId = `case_test_step2_${Date.now()}`;
  const testFileA = `file_test_a_${Date.now()}`;
  const testFileB = `file_test_b_${Date.now()}`;

  try {
    // 1. Create a dummy test quotation case
    await db.prepare(`
      INSERT INTO quotation_cases (
        id, case_no, case_name, status, quote_readiness, created_at, updated_at
      ) VALUES (?, ?, ?, 'REGISTERED', 'PENDING_BOM', ?, ?)
    `).run(testCaseId, `QT-TEST-${Date.now().toString().slice(-4)}`, '격리 테스트 견적건', now, now);

    // 2. Register File A and File B
    await db.prepare(`
      INSERT INTO uploaded_files (
        id, quotation_case_id, original_file_name, stored_file_name, storage_path,
        file_type, file_role, file_size, checksum, upload_status, created_at
      ) VALUES (?, ?, 'part_a.dxf', 'part_a.dxf', 'test/part_a.dxf', 'DXF', 'PRIMARY', 1000, 'chk_a', 'UPLOADED', ?)
    `).run(testFileA, testCaseId, now);

    await db.prepare(`
      INSERT INTO uploaded_files (
        id, quotation_case_id, original_file_name, stored_file_name, storage_path,
        file_type, file_role, file_size, checksum, upload_status, created_at
      ) VALUES (?, ?, 'part_b.dxf', 'part_b.dxf', 'test/part_b.dxf', 'DXF', 'PRIMARY', 1000, 'chk_b', 'UPLOADED', ?)
    `).run(testFileB, testCaseId, now);

    console.log('[1/4] Test case and 2 files registered successfully.');

    // 3. Simulate Pipeline Run for File A
    // (A) Drawings & Relationships
    await insertRows('drawings', [{
      id: `dwg_${testFileA}_1`,
      quotation_case_id: testCaseId,
      source_file_id: testFileA,
      drawing_index: 1,
      drawing_no_raw: 'DWG-A-001',
      drawing_no_normalized: 'DWG-A-001',
      confidence_score: 1.0,
      status: 'VERIFIED',
      created_at: now
    }]);

    await insertRows('drawing_relationships', [{
      id: `rel_${testFileA}_1`,
      quotation_case_id: testCaseId,
      parent_drawing_no: 'DWG-A-001',
      child_drawing_no: 'DWG-A-002',
      relationship_type: 'ASSEMBLY_COMPONENT',
      confidence_score: 0.95,
      created_at: now
    }]);

    // (B) BOM Areas & Raw BOM
    await insertRows('bom_areas', [{
      id: `ba_${testFileA}_1`,
      quotation_case_id: testCaseId,
      source_file_id: testFileA,
      drawing_no: 'DWG-A-001',
      table_type: 'PARTS_LIST',
      bbox_json: '{}',
      confidence_score: 0.9,
      status: 'CONFIRMED',
      created_at: now
    }]);

    await insertRows('raw_bom_items', [{
      id: `rb_${testFileA}_1`,
      quotation_case_id: testCaseId,
      source_file_id: testFileA,
      drawing_no: 'DWG-A-001',
      row_index: 1,
      name_raw: '샤프트 A',
      quantity_numeric: 2,
      status: 'RAW',
      created_at: now
    }]);

    // (C) Flattened, Normalized, Candidates
    await insertRows('flattened_bom_items', [{
      id: `fb_${testFileA}_1`,
      quotation_case_id: testCaseId,
      item_key: 'DWG-A-001-1',
      part_no: 'DWG-A-001',
      name: '샤프트 A',
      total_quantity: 2,
      unit: 'EA',
      created_at: now
    }]);

    await insertRows('normalized_bom_items', [{
      id: `norm_${testFileA}_1`,
      quotation_case_id: testCaseId,
      raw_item_id: `rb_${testFileA}_1`,
      raw_name: '샤프트 A',
      normalized_name: '샤프트 A',
      search_name: '샤프트A',
      quantity: 2,
      unit: 'EA',
      status: 'NORMALIZED',
      created_at: now
    }]);

    await insertRows('master_candidates', [{
      id: `cand_norm_${testFileA}_1_1`,
      normalized_item_id: `norm_${testFileA}_1`,
      master_code: 'M-SHAFT-01',
      standard_name: '샤프트',
      rank: 1,
      total_score: 95.0,
      candidate_status: 'TOP_CANDIDATE',
      created_at: now
    }]);

    console.log('[2/4] File A data populated.');

    // 4. Simulate Pipeline Run for File B (Testing File B Isolation)
    // Check if other sources exist (must be true)
    const otherSourcesB = (await db.prepare(`
      SELECT COUNT(*) as cnt FROM uploaded_files
      WHERE quotation_case_id = ? AND id != ? AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
    `).get(testCaseId, testFileB)) as any;

    if (otherSourcesB.cnt === 0) {
      throw new Error('Expected otherSources to be > 0 for File B');
    }

    // Isolate deletions for File B only:
    await db.prepare("DELETE FROM flattened_bom_items WHERE quotation_case_id = ? AND id LIKE 'fb_' || ? || '_%'").run(testCaseId, testFileB);
    await db.prepare("DELETE FROM master_candidates WHERE normalized_item_id IN (SELECT id FROM normalized_bom_items WHERE quotation_case_id = ? AND id LIKE 'norm_' || ? || '_%')").run(testCaseId, testFileB);
    await db.prepare("DELETE FROM normalized_bom_items WHERE quotation_case_id = ? AND id LIKE 'norm_' || ? || '_%'").run(testCaseId, testFileB);

    // Insert File B items
    await insertRows('drawings', [{
      id: `dwg_${testFileB}_1`,
      quotation_case_id: testCaseId,
      source_file_id: testFileB,
      drawing_index: 1,
      drawing_no_raw: 'DWG-B-001',
      drawing_no_normalized: 'DWG-B-001',
      confidence_score: 1.0,
      status: 'VERIFIED',
      created_at: now
    }]);

    await insertRows('flattened_bom_items', [{
      id: `fb_${testFileB}_1`,
      quotation_case_id: testCaseId,
      item_key: 'DWG-B-001-1',
      part_no: 'DWG-B-001',
      name: '플레이트 B',
      total_quantity: 4,
      unit: 'EA',
      created_at: now
    }]);

    await insertRows('normalized_bom_items', [{
      id: `norm_${testFileB}_1`,
      quotation_case_id: testCaseId,
      raw_item_id: `rb_${testFileB}_1`,
      raw_name: '플레이트 B',
      normalized_name: '플레이트 B',
      search_name: '플레이트B',
      quantity: 4,
      unit: 'EA',
      status: 'NORMALIZED',
      created_at: now
    }]);

    await insertRows('master_candidates', [{
      id: `cand_norm_${testFileB}_1_1`,
      normalized_item_id: `norm_${testFileB}_1`,
      master_code: 'M-PLATE-02',
      standard_name: '플레이트',
      rank: 1,
      total_score: 92.0,
      candidate_status: 'TOP_CANDIDATE',
      created_at: now
    }]);

    console.log('[3/4] File B data populated.');

    // 5. Verification: Check that File A data STILL EXISTS alongside File B
    const dwgs = await db.prepare('SELECT id, source_file_id FROM drawings WHERE quotation_case_id = ?').all(testCaseId) as any[];
    const fbs = await db.prepare('SELECT id, name FROM flattened_bom_items WHERE quotation_case_id = ?').all(testCaseId) as any[];
    const norms = await db.prepare('SELECT id, raw_name FROM normalized_bom_items WHERE quotation_case_id = ?').all(testCaseId) as any[];
    const cands = await db.prepare('SELECT mc.id, mc.normalized_item_id FROM master_candidates mc JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id WHERE ni.quotation_case_id = ?').all(testCaseId) as any[];

    console.log('Verification Counts:');
    console.log(`- Drawings: ${dwgs.length} (Expected 2: File A & File B)`);
    console.log(`- Flattened BOM: ${fbs.length} (Expected 2: File A & File B)`);
    console.log(`- Normalized BOM: ${norms.length} (Expected 2: File A & File B)`);
    console.log(`- Master Candidates: ${cands.length} (Expected 2: File A & File B)`);

    if (dwgs.length !== 2 || fbs.length !== 2 || norms.length !== 2 || cands.length !== 2) {
      throw new Error(`Data isolation failure! Expected 2 items each, got: dwgs=${dwgs.length}, fbs=${fbs.length}, norms=${norms.length}, cands=${cands.length}`);
    }

    // Verify JOIN integrity between normalized_bom_items and flattened_bom_items
    const joinCheck = await db.prepare(`
      SELECT ni.id as norm_id, fb.id as fb_id, ni.raw_name, fb.name
      FROM normalized_bom_items ni
      LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
      WHERE ni.quotation_case_id = ?
    `).all(testCaseId) as any[];

    console.log('JOIN Integrity Check:', joinCheck);
    for (const jc of joinCheck) {
      if (!jc.fb_id) {
        throw new Error(`JOIN broken! normalized item ${jc.norm_id} did not match any flattened bom item`);
      }
    }

    console.log('[4/4] File-scoped isolation and JOIN integrity verified perfectly! SUCCESS!');

  } finally {
    // Cleanup test data
    console.log('Cleaning up test data...');
    await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id LIKE ?').run(`%${testCaseId}%`);
    await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id LIKE ?').run(`%${testFileA}%`);
    await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id LIKE ?').run(`%${testFileB}%`);
    await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM flattened_bom_items WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM raw_bom_items WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM bom_areas WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM drawing_relationships WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM drawings WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM uploaded_files WHERE quotation_case_id = ?').run(testCaseId);
    await db.prepare('DELETE FROM quotation_cases WHERE id = ?').run(testCaseId);
    console.log('Cleanup finished.');
  }
}

runStep2Verification().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
