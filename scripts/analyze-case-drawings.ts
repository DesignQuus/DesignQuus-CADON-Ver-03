import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const bomRes = await queryTable('normalized_bom_items', { limit: 200 });
  const caseBom = bomRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`case ${caseId} normalized_bom_items:`, caseBom.length);

  const dwgRes = await queryTable('drawings', { limit: 500 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`case ${caseId} drawings:`, caseDrawings.length);

  // BOM item 중 도면 번호나 명칭으로 매칭되는지 확인
  let matchedCount = 0;
  for (const b of caseBom) {
    const matchedDwg = caseDrawings.find(d => 
      d.drawing_no_normalized === b.spec_candidate || 
      d.drawing_no_raw === b.spec_candidate ||
      d.drawing_name_normalized === b.normalized_name
    );
    if (matchedDwg) matchedCount++;
  }
  console.log(`BOM items matched with drawings: ${matchedCount} / ${caseBom.length}`);

  // drawings의 frame_bbox_json 샘플 확인
  const dwgWithBbox = caseDrawings.filter(d => d.frame_bbox_json);
  console.log(`Drawings with frame_bbox_json: ${dwgWithBbox.length} / ${caseDrawings.length}`);
  if (dwgWithBbox.length > 0) {
    console.log('Sample frame_bbox:', dwgWithBbox[0].frame_bbox_json);
  }
}

main().catch(console.error);
