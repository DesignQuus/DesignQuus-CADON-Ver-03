import { insertRows, deleteRows, executeSQL } from '../egdesk-helpers';

async function testNullFeature() {
  const testId = 'test_feat_null_check_1';
  try {
    const res = await insertRows('part_fabrication_features', [{
      id: testId,
      quotation_case_id: 'case_test_null',
      process_type: 'MACHINING',
      material_code: null,
      material_density: null,
      bbox_width: null,
      bbox_length: null,
      bbox_thickness: null,
      cutting_length_total: null,
      pierce_count: null,
      bending_count: null,
      through_hole_count: null,
      tap_hole_count: null,
      part_weight_kg: null,
      created_at: new Date().toISOString()
    }]);
    console.log('insert with NULLs success:', res);
    // 정리
    await deleteRows('part_fabrication_features', { id: testId });
    console.log('cleanup completed');
  } catch (err: any) {
    console.error('insert with NULLs failed:', err?.message || err);
  }
}

testNullFeature().catch(console.error);
