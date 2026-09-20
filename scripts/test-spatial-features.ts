import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. 도면 목록
  const allDwg = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = allDwg.rows?.filter(r => r.quotation_case_id === caseId) || [];
  
  // 2. parse_runs
  const pr = await queryTable('cad_parse_runs', { limit: 10 });
  console.log('parse_runs:', pr.rows?.map(p => ({ id: p.id, total_entities: p.total_entities })));

  // 3. 도면 2번(MAIN CHAIN DRIVE-1)의 frame_bbox 내 엔티티 조회 테스트
  const dwg = caseDrawings[1];
  console.log('Dwg:', dwg.drawing_no_normalized, dwg.drawing_name_normalized);
  const bbox = JSON.parse(dwg.frame_bbox_json || '{}');
  console.log('Frame bbox:', bbox);

  // cad_objects 샘플 100건 중 이 bbox 범위에 들어오는 객체 확인
  const co = await queryTable('cad_objects', { limit: 1000 });
  let insideCount = 0;
  for (const obj of (co.rows || [])) {
    if (!obj.bounding_box_json) continue;
    try {
      const ob = JSON.parse(obj.bounding_box_json);
      // obj 중심이 frame bbox 내부인지
      const cx = (ob.min_x + ob.max_x) / 2;
      const cy = (ob.min_y + ob.max_y) / 2;
      if (cx >= bbox.min_x && cx <= bbox.max_x && cy >= bbox.min_y && cy <= bbox.max_y) {
        insideCount++;
      }
    } catch {}
  }
  console.log(`Entities inside sample 1000 cad_objects: ${insideCount}`);
}

main().catch(console.error);
