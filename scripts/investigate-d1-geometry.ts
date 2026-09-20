import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. bom_areas 확인 (전체 로드)
  const baRes = await queryTable('bom_areas', { limit: 500 });
  const caseBa = baRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`case ${caseId} bom_areas: ${caseBa.length}건 / 전체: ${baRes.rows?.length}건`);
  if (caseBa.length > 0) {
    console.log('Sample bom_area:', caseBa[0]);
  }

  // 2. drawings 확인 (전체 로드)
  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`case drawings: ${caseDrawings.length}건`);

  // 3. 샘플 도면 (예: MOTOR BRACKET, 도번 240324-02-001)
  const mbDwg = caseDrawings.find(d => d.drawing_no_normalized === '240324-02-001' || d.drawing_name_normalized?.includes('MOTOR BRACKET'));
  console.log('\n[MOTOR BRACKET 도면 정보]:', {
    id: mbDwg?.id,
    no: mbDwg?.drawing_no_normalized,
    name: mbDwg?.drawing_name_normalized,
    frame_bbox: mbDwg?.frame_bbox_json,
    title_bbox: mbDwg?.title_block_bbox_json,
    scale: mbDwg?.scale,
    material: mbDwg?.material
  });

  // 4. 이 도면의 frame_bbox 영역 내에 있는 cad_objects 탐색
  if (mbDwg && mbDwg.frame_bbox_json) {
    const fBox = JSON.parse(mbDwg.frame_bbox_json);
    const tBox = mbDwg.title_block_bbox_json ? JSON.parse(mbDwg.title_block_bbox_json) : null;
    console.log('\nFrame BBox:', fBox);
    console.log('Title BBox:', tBox);

    // executeSQL로 parse_run_id = 'parse_1789766345349' 대상 cad_objects 쿼리
    // min_x, max_x, min_y, max_y 범위
    const { executeSQL } = await import('../egdesk-helpers');
    const sql = `
      SELECT id, entity_type, layer, raw_text, bounding_box_json 
      FROM cad_objects 
      WHERE parse_run_id = 'parse_1789766345349'
      LIMIT 1000
    `;
    const res = await executeSQL(sql);
    console.log(`cad_objects 쿼리 성공: ${res.rows?.length}건`);
  }
}

main().catch(console.error);
