import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. BOM 아이템 가져오기
  const allBom = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = allBom.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`caseBom count: ${caseBom.length}`);

  // 2. 도면 가져오기
  const allDwg = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = allDwg.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`caseDrawings count: ${caseDrawings.length}`);

  // 3. raw_bom_items에서 추가 정보(part_no_raw, remark_raw 등) 확인
  const allRaw = await queryTable('raw_bom_items', { limit: 3000 });
  const caseRaw = allRaw.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`caseRaw count: ${caseRaw.length}`);

  // 매칭 맵 구축
  const dwgByNo = new Map<string, any>();
  const dwgByName = new Map<string, any>();
  for (const d of caseDrawings) {
    if (d.drawing_no_normalized) dwgByNo.set(d.drawing_no_normalized.trim(), d);
    if (d.drawing_name_normalized) dwgByName.set(d.drawing_name_normalized.trim(), d);
  }

  let directNoMatch = 0;
  let nameMatch = 0;
  let noMatch = 0;

  for (const b of caseBom) {
    const rawNo = b.spec_candidate?.trim();
    const rawName = b.normalized_name?.trim();
    if (rawNo && dwgByNo.has(rawNo)) {
      directNoMatch++;
    } else if (rawName && dwgByName.has(rawName)) {
      nameMatch++;
    } else {
      noMatch++;
    }
  }

  console.log(`BOM to Drawing Matching: directNoMatch=${directNoMatch}, nameMatch=${nameMatch}, noMatch=${noMatch}`);

  // 도면의 샘플 데이터 및 frame_bbox_json 분석
  console.log('\nSample Drawings:');
  caseDrawings.slice(0, 5).forEach((d, i) => {
    console.log(`[Dwg ${i+1}] No: ${d.drawing_no_normalized}, Name: ${d.drawing_name_normalized}, Mat: ${d.material}, Frame: ${d.frame_bbox_json}`);
  });
}

main().catch(console.error);
