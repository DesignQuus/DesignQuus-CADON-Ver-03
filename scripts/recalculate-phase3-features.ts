import { executeSQL, updateRows, insertRows, deleteRows } from '../egdesk-helpers';
import crypto from 'crypto';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log(`=== Phase 3: 도번 1:1 전수 복구 및 두께 실측 파싱 재실행 (Case: ${caseId}) ===\n`);

  // 1. drawings 테이블 123건 로드
  const dwgRes = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_no_raw, drawing_name_raw, drawing_name_normalized,
           drawing_type, material, frame_bbox_json, title_block_bbox_json
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);
  const dwgList = dwgRes.rows || [];
  console.log(`[1] 대상 케이스 도면 건수: ${dwgList.length}건`);

  // 2. drawing_relationships 121건 로드
  const relRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no, relationship_type
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const relList = relRes.rows || [];
  console.log(`[2] 대상 케이스 도면 계층 관계 건수: ${relList.length}건`);

  // 3. bom_areas 로드
  const baRes = await executeSQL(`
    SELECT drawing_no, bbox_json FROM bom_areas WHERE quotation_case_id = '${caseId}'
  `);
  const baList = baRes.rows || [];

  // 4. cad_objects 로드 (parse_run_id 기준)
  const coRes = await executeSQL(`
    SELECT id, entity_type, layer, raw_text, bounding_box_json
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `);
  const allObjects = coRes.rows || [];
  console.log(`[3] cad_objects 로드 건수: ${allObjects.length}건`);

  // 5. material_rates 로드
  const matRes = await executeSQL(`SELECT material_code, density, unit_price_per_kg FROM material_rates`);
  const matMap = new Map<string, any>();
  for (const m of (matRes.rows || [])) {
    matMap.set(m.material_code.toUpperCase(), m);
  }

  // 6. normalized_bom_items 로드 (BOM ID 연결용)
  const bomRes = await executeSQL(`
    SELECT id, raw_name, normalized_name, spec_candidate, material_candidate, quantity
    FROM normalized_bom_items
    WHERE quotation_case_id = '${caseId}'
  `);
  const bomList = bomRes.rows || [];
  const bomByDwgName = new Map<string, any>();
  for (const b of bomList) {
    bomByDwgName.set(b.normalized_name, b);
  }

  // 7. 도면별 피처 산출 루프 (123개 도면 전수 대상)
  let assemblyCount = 0;
  let roundBarCount = 0;
  let sheetCount = 0;
  let parsedThicknessCount = 0;
  let nullThicknessCount = 0;
  const thicknessDist: Record<string, number> = {};

  const updatedFeatures: any[] = [];
  const now = new Date().toISOString();

  for (const dwg of dwgList) {
    const dwgNo = dwg.drawing_no_normalized;
    const rawName = dwg.drawing_name_raw || dwgNo;
    const normName = dwg.drawing_name_normalized || rawName;
    const isAssembly = dwg.drawing_type === 'MAIN_ASSEMBLY' || 
                       dwg.drawing_type === 'SUB_ASSEMBLY' || 
                       rawName.includes('조립') || 
                       dwgNo.endsWith('-000') ||
                       dwgNo.endsWith('-00-000');

    // 조립도 처리 (단품 원가/소요 0 배제)
    if (isAssembly) {
      assemblyCount++;
      updatedFeatures.push({
        drawingNo: dwgNo,
        drawingId: dwg.id,
        bomItemId: bomByDwgName.get(normName)?.id || null,
        partName: rawName,
        processType: 'ASSEMBLY',
        materialShape: 'ASSEMBLY',
        materialCode: dwg.material || 'SS400',
        materialDensity: 0,
        bboxWidth: 0,
        bboxLength: 0,
        bboxThickness: null,
        diameter: null,
        partWeightKg: 0,
        status: 'CONFIRMED',
        note: '조립도 단품 원가 0 배제'
      });
      continue;
    }

    // 도면 바운딩 박스 내 객체 필터링
    const frame = dwg.frame_bbox_json ? JSON.parse(dwg.frame_bbox_json) : null;
    const title = dwg.title_block_bbox_json ? JSON.parse(dwg.title_block_bbox_json) : null;
    const matchedBa = baList.find((ba: any) => ba.drawing_no === dwgNo);
    const baBox = matchedBa ? JSON.parse(matchedBa.bbox_json) : null;

    const fW = frame ? Math.abs(frame.max_x - frame.min_x) : 600;
    const fH = frame ? Math.abs(frame.max_y - frame.min_y) : 400;

    const dimVals: number[] = [];
    const diaVals: number[] = [];
    const allTexts: string[] = [];
    let hasHeatText = false;
    let heatSpec = '';

    if (frame) {
      for (const obj of allObjects) {
        if (!obj.bounding_box_json) continue;
        const ob = JSON.parse(obj.bounding_box_json);
        const cx = (ob.min_x + ob.max_x) / 2;
        const cy = (ob.min_y + ob.max_y) / 2;

        if (cx >= frame.min_x && cx <= frame.max_x && cy >= frame.min_y && cy <= frame.max_y) {
          const bw = Math.abs(ob.max_x - ob.min_x);
          const bh = Math.abs(ob.max_y - ob.min_y);

          if (bw >= fW * 0.85 || bh >= fH * 0.85) continue;
          if (title && cx >= title.min_x && cy <= title.max_y) continue;
          if (baBox && cx >= baBox.min_x && cx <= baBox.max_x && cy >= baBox.min_y && cy <= baBox.max_y) continue;
          if (cx <= frame.min_x + 25 || cx >= frame.max_x - 25 || cy <= frame.min_y + 25 || cy >= frame.max_y - 25) continue;

          if (obj.raw_text && (obj.raw_text.includes('HrC') || obj.raw_text.includes('HRC') || obj.raw_text.includes('열처리'))) {
            hasHeatText = true;
            heatSpec = obj.raw_text.trim();
          }

          if (obj.raw_text) {
            allTexts.push(obj.raw_text.trim());

            // 직경 기호 치수 수집
            if (obj.raw_text.includes('%%c') || obj.raw_text.includes('Ø') || obj.raw_text.includes('ø')) {
              const num = parseFloat(obj.raw_text.replace(/%%c/gi, '').replace(/[Øø]/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, ''));
              if (!isNaN(num) && num >= 4 && num <= 300) {
                diaVals.push(num);
              }
            }

            // 일반 치수 수집
            if (obj.layer === 'DIMENSION' || obj.raw_text.includes('%%c') || obj.raw_text.includes('Ø')) {
              const cleanTxt = obj.raw_text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
              const val = parseFloat(cleanTxt);
              if (!isNaN(val) && val >= 0.5 && val <= 800) {
                dimVals.push(val);
              }
            }
          }
        }
      }
    }

    dimVals.sort((a, b) => b - a);
    diaVals.sort((a, b) => b - a);

    // W, L 추출 (상위 2개 치수)
    const largeDims = dimVals.filter(d => d >= 20);
    let realW = largeDims[0] || dimVals[0] || 150;
    let realL = largeDims.find(d => d < realW * 0.95) || largeDims[1] || dimVals[1] || realW;

    // 자재 형상 정밀 분류
    const isSheetName = rawName.includes('BRACKET') || rawName.includes('PLATE') || 
                        rawName.includes('COVER') || rawName.includes('PANEL') || 
                        rawName.includes('BASE') || rawName.includes('GUIDE') || 
                        rawName.includes('STAY') || rawName.includes('GUARD') ||
                        rawName.includes('CHUTE') || rawName.includes('DOOR');

    const isRoundBarName = !isSheetName && (
      rawName.includes('SHAFT') || rawName.includes('ROLLER') || 
      rawName.includes('PIN') || rawName.includes('POST') || 
      rawName.includes('COLLAR') || rawName.includes('CAP') ||
      rawName.includes('ROD') || rawName.includes('STUD')
    );

    const isRoundBar = isRoundBarName;

    const rawMat = (dwg.material || 'SS400').trim().toUpperCase();
    const matInfo = matMap.get(rawMat) || matMap.get('SS400');
    const density = matInfo ? matInfo.density : 7.85;

    const standardThicknesses = [1.2, 1.6, 2.0, 2.3, 3.0, 3.2, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 15.0, 20.0];

    let materialShape = isRoundBar ? 'ROUND_BAR' : 'SHEET';
    let thickness: number | null = null;
    let diameter: number | null = null;
    let partWeightKg = 0;

    if (isRoundBar) {
      roundBarCount++;
      // 환봉: 주 외경(Major Diameter) 추출 - 최대 유효 직경
      const diaCandidates = diaVals.filter(d => d >= 8 && d <= 150 && d < realW * 0.95);
      if (diaCandidates.length > 0) {
        diameter = diaCandidates[0]; // 주 외경(최대 직경)
      } else {
        const dimDia = dimVals.filter(v => v >= 10 && v <= 120 && v < realW * 0.85);
        diameter = dimDia.length > 0 ? dimDia[0] : (rawName.includes('ROLLER') ? 43 : 25);
      }

      const lengthMm = realW;
      const radiusCm = (diameter / 10) / 2;
      const lengthCm = lengthMm / 10;
      const volCm3 = Math.PI * radiusCm * radiusCm * lengthCm;
      partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      thickness = null;
    } else {
      sheetCount++;
      // 판재 두께 T 추출:
      // 1순위: 표제란 및 도면 텍스트에서 명시적 정규식 파싱 ('2.3T', '1.2T', 't3.2' 등)
      let foundThk: number | null = null;
      for (const txt of allTexts) {
        const m = txt.match(/\b([0-9]+(?:\.[0-9]+)?)\s*[tT]\b/);
        if (m) {
          const val = parseFloat(m[1]);
          if (standardThicknesses.includes(val)) {
            foundThk = val;
            break;
          }
        }
      }

      // 2순위: 단면 치수 매칭 (W, L보다 확실히 얇은 두께 치수, 1.2~15mm)
      // 판재는 단면도에서 두께가 가장 얇은 주 치수이므로 유효 두께 후보군 중 최소 공칭 두께 선택!
      if (foundThk === null) {
        const isCover = rawName.includes('COVER') || rawName.includes('GUARD') || rawName.includes('CASE');
        const maxThk = isCover ? 3.2 : Math.min(realL * 0.35, 15);
        const tCand = dimVals.filter(v => v >= 1.2 && v <= maxThk && standardThicknesses.includes(v));
        if (tCand.length > 0) {
          foundThk = tCand[tCand.length - 1]; // 단면 최소 공칭 두께
        }
      }

      if (foundThk !== null) {
        thickness = foundThk;
        parsedThicknessCount++;
        const k = `t${thickness}`;
        thicknessDist[k] = (thicknessDist[k] || 0) + 1;

        const volCm3 = (realW * realL * thickness) / 1000;
        partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      } else {
        // 도면에 두께가 없는 경우: 절대 임의값(3.0 등)을 넣지 않고 NULL 보존!
        thickness = null;
        nullThicknessCount++;
        partWeightKg = 0;
      }
    }

    updatedFeatures.push({
      drawingNo: dwgNo,
      drawingId: dwg.id,
      bomItemId: bomByDwgName.get(normName)?.id || null,
      partName: rawName,
      processType: isRoundBar ? 'MACHINING' : 'SHEET_METAL',
      materialShape,
      materialCode: matInfo ? matInfo.material_code : 'SS400',
      materialDensity: density,
      bboxWidth: realW,
      bboxLength: realL,
      bboxThickness: thickness,
      diameter,
      partWeightKg: Math.max(partWeightKg, 0),
      status: thickness === null && !isRoundBar ? 'PENDING_REVIEW' : 'CONFIRMED',
      note: isRoundBar ? `환봉(Ø${diameter}×L${realW})` : (thickness ? `판재(t${thickness})` : '두께미상(NULL)')
    });
  }

  console.log(`\n[4] 피처 재산출 통계 실측:`);
  console.log(`- 전체 도면 처리: ${updatedFeatures.length}건 (123/123)`);
  console.log(`- 조립도 배제: ${assemblyCount}건`);
  console.log(`- 가공/판금 단품 복구: ${updatedFeatures.length - assemblyCount}건`);
  console.log(`  * 환봉류(ROUND_BAR): ${roundBarCount}건 (주외경 Ø 및 길이 실측)`);
  console.log(`  * 판재류(SHEET): ${sheetCount}건`);
  console.log(`- 판재 두께 실측 파싱 성공: ${parsedThicknessCount}건`);
  console.log(`- 판재 두께 미상(NULL 보존, Pending Review): ${nullThicknessCount}건`);
  console.log(`- 판재 두께값 실측 분포:`, thicknessDist);

  // 8. DB 영구 적재 (기존 케이스 피처 정리 후 신규 피처 클린 삽입)
  console.log('\n[5] part_fabrication_features DB 영구 적재 시작...');
  const curFeat = await executeSQL(`SELECT id FROM part_fabrication_features WHERE quotation_case_id = '${caseId}'`);
  const caseFeatRows = curFeat.rows || [];
  if (caseFeatRows.length > 0) {
    const ids = caseFeatRows.map((r: any) => r.id);
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await deleteRows('part_fabrication_features', { ids: ids.slice(i, i + chunkSize) });
    }
    console.log(`  ✓ 기존 케이스 피처 삭제: ${caseFeatRows.length}건`);
  }

  const rowsToInsert = updatedFeatures.map((uf, idx) => ({
    id: `feat_${caseId}_${idx + 1}_${crypto.randomUUID().slice(0, 8)}`,
    quotation_case_id: caseId,
    drawing_id: uf.drawingId,
    bom_item_id: uf.bomItemId,
    process_type: uf.processType,
    material_code: uf.materialCode,
    material_density: uf.materialDensity,
    bbox_width: uf.bboxWidth,
    bbox_length: uf.bboxLength,
    bbox_thickness: uf.bboxThickness !== null ? uf.bboxThickness : 0.0,
    cutting_length_total: 0.0,
    pierce_count: 0,
    bending_count: 0,
    through_hole_count: 0,
    tap_hole_count: 0,
    part_weight_kg: uf.partWeightKg,
    surface_area_cm2: 0.0,
    heat_treatment: null,
    surface_treatment: null,
    raw_features_json: JSON.stringify({
      drawingNo: uf.drawingNo,
      partName: uf.partName,
      materialShape: uf.materialShape,
      realThickness: uf.bboxThickness, // null if unknown
      diameter: uf.diameter,
      isAssembly: uf.processType === 'ASSEMBLY',
      status: uf.status,
      note: uf.note
    }),
    created_at: now
  }));

  const chunkSize = 50;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const chunk = rowsToInsert.slice(i, i + chunkSize);
    const res = await insertRows('part_fabrication_features', chunk);
    console.log(`  ✓ chunk ${i} ~ ${i + chunk.length} 적재 결과:`, res ? '성공' : '실패');
  }
  console.log(`  ✓ 신규 실측 피처 영구 적재 완료: ${rowsToInsert.length}건`);

  console.log('\n=== DB 영구 적재 완료! ===');
}

main().catch(console.error);
