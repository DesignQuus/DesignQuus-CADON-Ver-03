import { executeSQL, queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log(`=== [조건 2] D-1 치수 추출 방안 3대 대안 비교 검증 ===\n`);

  // 도면 3개 샘플 선정:
  // 1) 240314-03-001 (MOTOR BRACKET - 판금 브라켓)
  // 2) 240314-DV3-017 (FREE ROLLER-1 - 가공 롤러)
  // 3) 240314-DV1-003 (MAIN C/V BRACKET - 판금)
  const targetDwgNos = ['240314-03-001', '240314-DV3-017', '240314-DV1-003'];

  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const baRes = await queryTable('bom_areas', { limit: 500 });
  const caseBa = baRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  for (const dwgNo of targetDwgNos) {
    const dwg = caseDrawings.find(d => d.drawing_no_normalized === dwgNo);
    if (!dwg) continue;

    console.log(`\n======================================================`);
    console.log(`[검증 도면: ${dwgNo}] ${dwg.drawing_name_normalized} (재질: ${dwg.material})`);
    console.log(`======================================================`);

    const frame = JSON.parse(dwg.frame_bbox_json || '{}');
    const title = dwg.title_block_bbox_json ? JSON.parse(dwg.title_block_bbox_json) : null;
    const frameW = Math.round(frame.max_x - frame.min_x);
    const frameH = Math.round(frame.max_y - frame.min_y);
    console.log(`[기존 잘못된 방식: 용지 프레임] W=${frameW}mm, L=${frameH}mm (종횡비: ${(frameW/frameH).toFixed(3)})`);

    // 도면 내 bom_area 확인
    const matchedBa = caseBa.find(ba => ba.drawing_no === dwgNo);
    let baBox: any = null;
    if (matchedBa) {
      baBox = JSON.parse(matchedBa.bbox_json);
      console.log(`[BOM Area 검출]: 있음 (${Math.round(baBox.max_x - baBox.min_x)}x${Math.round(baBox.max_y - baBox.min_y)})`);
    } else {
      console.log(`[BOM Area 검출]: 없음 (단품 도면)`);
    }

    // 도면 내부 cad_objects 쿼리
    const sql = `
      SELECT id, entity_type, layer, raw_text, bounding_box_json 
      FROM cad_objects 
      WHERE parse_run_id = '${parseRunId}'
    `;
    const coRes = await executeSQL(sql);

    // --- 대안 A: DIMENSION 레이어 텍스트 파싱 ---
    const dimTexts: number[] = [];
    // --- 대안 B: 실제 외곽 기하(LWPOLYLINE/LINE)에서 BBox 계산 (표제란, 프레임 테두리, 구역선 제외) ---
    const partGeomObjs: any[] = [];

    const fMinX = frame.min_x, fMaxX = frame.max_x;
    const fMinY = frame.min_y, fMaxY = frame.max_y;
    const tMinX = title ? title.min_x : fMaxX;
    const tMaxY = title ? title.max_y : fMinY;

    for (const row of (coRes.rows || [])) {
      if (!row.bounding_box_json) continue;
      try {
        const b = JSON.parse(row.bounding_box_json);
        const cx = (b.min_x + b.max_x) / 2;
        const cy = (b.min_y + b.max_y) / 2;

        if (cx >= fMinX && cx <= fMaxX && cy >= fMinY && cy <= fMaxY) {
          const bw = Math.abs(b.max_x - b.min_x);
          const bh = Math.abs(b.max_y - b.min_y);

          // 1. 도면 가장 바깥 테두리 및 마진선 제외 (폭 500 이상 또는 높이 350 이상)
          if (bw >= frameW * 0.9 || bh >= frameH * 0.9) continue;

          // 2. 표제란 영역 제외
          if (title && cx >= title.min_x && cy <= title.max_y) continue;

          // 3. BOM Area 영역 제외
          if (baBox && cx >= baBox.min_x && cx <= baBox.max_x && cy >= baBox.min_y && cy <= baBox.max_y) continue;

          // 4. 구역 마진(도면 프레임 가장자리 25mm 이내의 눈금선/문자) 제외
          const margin = 25;
          if (cx <= fMinX + margin || cx >= fMaxX - margin || cy <= fMinY + margin || cy >= fMaxY - margin) continue;

          // 대안 A 수집: DIMENSION 텍스트
          if (row.layer === 'DIMENSION' && row.raw_text) {
            const num = parseFloat(row.raw_text.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > 0 && num < 1000) {
              dimTexts.push(num);
            }
          }

          // 대안 B 수집: 실제 외곽 형상선 (레이어 '0' 또는 비치수선 LWPOLYLINE/LINE)
          if (row.layer !== 'DIMENSION' && (row.entity_type === 'LWPOLYLINE' || row.entity_type === 'LINE')) {
            partGeomObjs.push({ b, bw, bh, layer: row.layer });
          }
        }
      } catch {}
    }

    // 대안 A 계산 결과
    console.log(`\n▶ [대안 A: DIMENSION 치수 텍스트 파싱]`);
    if (dimTexts.length > 0) {
      dimTexts.sort((a, b) => b - a);
      const maxDim1 = dimTexts[0];
      const maxDim2 = dimTexts.find(d => d < maxDim1 && d >= maxDim1 * 0.3) || dimTexts[1] || maxDim1;
      console.log(`  - 검출된 치수 목록 상위 5개:`, dimTexts.slice(0, 5));
      console.log(`  - 추정 외곽: W=${maxDim1}mm, L=${maxDim2}mm`);
    } else {
      console.log(`  - 치수 텍스트 없음`);
    }

    // 대안 B 계산 결과
    console.log(`\n▶ [대안 B: 기하 지오메트리(LWPOLYLINE/LINE) 직접 BBox 산출]`);
    if (partGeomObjs.length > 0) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      partGeomObjs.forEach(g => {
        gMinX = Math.min(gMinX, g.b.min_x);
        gMinY = Math.min(gMinY, g.b.min_y);
        gMaxX = Math.max(gMaxX, g.b.max_x);
        gMaxY = Math.max(gMaxY, g.b.max_y);
      });
      const geomW = Math.round(gMaxX - gMinX);
      const geomH = Math.round(gMaxY - gMinY);
      console.log(`  - 부품 뷰 기하 객체 수: ${partGeomObjs.length}개`);
      console.log(`  - 기하 바운딩 박스: W=${geomW}mm, L=${geomH}mm (종횡비: ${(geomW/geomH).toFixed(3)})`);
    } else {
      console.log(`  - 부품 뷰 기하 객체 없음`);
    }
  }
}

main().catch(console.error);
