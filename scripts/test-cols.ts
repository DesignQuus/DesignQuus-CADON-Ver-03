import { insertRows, deleteRows } from '../egdesk-helpers';

async function testCols() {
  const testId = 'test_feat_col_check_2';
  try {
    const res = await insertRows('part_fabrication_features', [{
      id: testId,
      quotation_case_id: 'case_test',
      process_type: 'MACHINING',
      material_code: 'UNKNOWN',
      material_density: 0,
      bbox_width: 0,
      bbox_length: 0,
      bbox_thickness: 0,
      cutting_length_total: 0,
      pierce_count: 0,
      bending_count: 0,
      through_hole_count: 0,
      tap_hole_count: 0,
      part_weight_kg: 0,
      drawing_id: null,
      bom_item_id: null,
      surface_area_cm2: null,
      heat_treatment: null,
      surface_treatment: null,
      raw_features_json: null,
      created_at: new Date().toISOString()
    }]);
    console.log('insert result:', res);
    await deleteRows('part_fabrication_features', { ids: [testId] });
    console.log('cleanup completed');
  } catch (err: any) {
    console.error('failed:', err);
  }
}

testCols().catch(console.error);
