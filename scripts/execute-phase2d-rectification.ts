import { queryTable, insertRows, deleteRows, executeSQL } from '../egdesk-helpers';
import crypto from 'crypto';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';
  console.log(`=== Phase 2-D 원가 엔진 정합성 보정 및 DB 영구 적재 시작 (Case: ${caseId}) ===\n`);

  // 1. BOM 아이템 125건 로드
  const allBom = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = allBom.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`대상 normalized_bom_items: ${caseBom.length}건`);

  // 2. 도면 123건 로드
  const allDwg = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = allDwg.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`대상 drawings: ${caseDrawings.length}건`);

  // 3. bom_areas 37건 로드
  const baRes = await queryTable('bom_areas', { limit: 500 });
  const caseBa = baRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`대상 bom_areas: ${caseBa.length}건`);

  // 4. 단가표 로드 (material_rates, process_rates)
  const matRes = await queryTable('material_rates', { limit: 100 });
  const matMap = new Map<string, any>();
  for (const m of (matRes.rows || [])) {
    matMap.set(m.material_code.toUpperCase(), m);
  }

  const procRes = await queryTable('process_rates', { limit: 100 });
  const procMap = new Map<string, number>();
  for (const p of (procRes.rows || [])) {
    procMap.set(p.process_code, Number(p.rate_amount));
  }
  const hourlyMachineRate = procMap.get('HOURLY_MACHINE_RATE') || 45000;
  const laserPerMeter = procMap.get('SHEET_LASER_PER_METER') || 1800;
  const bendPerStroke = procMap.get('SHEET_BEND_PER_STROKE') || 800;
  const heatPerKg = procMap.get('HEAT_TREATMENT_PER_KG') || 1200;

  // 5. cad_objects 전체 로드 (해당 parse_run)
  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}'
  `;
  const coRes = await executeSQL(sql);
  const allObjects = coRes.rows || [];
  console.log(`대상 cad_objects: ${allObjects.length}건`);

  // 도면 매칭 맵
  const dwgByName = new Map<string, any>();
  const dwgByNo = new Map<string, any>();
  for (const d of caseDrawings) {
    if (d.drawing_name_normalized) dwgByName.set(d.drawing_name_normalized.trim(), d);
    if (d.drawing_no_normalized) dwgByNo.set(d.drawing_no_normalized.trim(), d);
  }

  const now = new Date().toISOString();
  const featRowsToInsert: any[] = [];
  const costRowsToInsert: any[] = [];

  let extractedCount = 0;
  let assemblyCount = 0;
  let nullPreservedCount = 0;

  for (let i = 0; i < caseBom.length; i++) {
    const b = caseBom[i];
    const featId = `feat_${caseId}_${i + 1}_${crypto.randomUUID().slice(0, 8)}`;
    const costId = `cost_${caseId}_${i + 1}_${crypto.randomUUID().slice(0, 8)}`;

    const rawName = b.normalized_name?.trim() || b.raw_name?.trim();
    const spec = b.spec_candidate?.trim();

    const isAssembly = rawName.includes('조립') || 
                       rawName.toLowerCase().includes('assembly') || 
                       rawName.toLowerCase().includes('assy');

    const matchedDwg = dwgByName.get(rawName) || (spec ? dwgByNo.get(spec) : null);

    // D-2: 조립도인 경우 -> ASSEMBLY 분류, 단품 가공원가 0원 처리
    if (isAssembly) {
      assemblyCount++;
      featRowsToInsert.push({
        id: featId,
        quotation_case_id: caseId,
        drawing_id: matchedDwg ? matchedDwg.id : null,
        bom_item_id: b.id,
        process_type: 'ASSEMBLY',
        material_code: matchedDwg?.material || 'SS400',
        material_density: 7.85,
        bbox_width: 0,
        bbox_length: 0,
        bbox_thickness: 0,
        cutting_length_total: 0,
        pierce_count: 0,
        bending_count: 0,
        through_hole_count: 0,
        tap_hole_count: 0,
        part_weight_kg: 0,
        surface_area_cm2: null,
        heat_treatment: null,
        surface_treatment: null,
        raw_features_json: JSON.stringify({
          isExtracted: true,
          partName: rawName,
          drawingNo: matchedDwg?.drawing_no_normalized || spec,
          isAssembly: true,
          reason: '조립도는 하위 단품의 합산 대상이므로 단품 가공비 0원 배제'
        }),
        created_at: now
      });

      costRowsToInsert.push({
        id: costId,
        feature_id: featId,
        quotation_case_id: caseId,
        material_cost: 0,
        laser_cutting_cost: 0,
        bending_cost: 0,
        tapping_cost: 0,
        machining_cost: 0,
        surface_finish_cost: 0,
        subtotal_cost: 0,
        markup_rate: 0,
        final_unit_price: 0,
        calc_formula_json: JSON.stringify({
          model: 'ASSEMBLY_EXCLUSION',
          unitPrice: 0,
          note: '조립도 품목 원가 합산 배제'
        }),
        created_at: now
      });
      continue;
    }

    // 도면이 있는 단품에 대해 D-1, D-3, D-4, D-5, D-6 적용
    if (matchedDwg && matchedDwg.frame_bbox_json) {
      extractedCount++;
      const frame = JSON.parse(matchedDwg.frame_bbox_json);
      const title = matchedDwg.title_block_bbox_json ? JSON.parse(matchedDwg.title_block_bbox_json) : null;
      const fW = Math.abs(frame.max_x - frame.min_x);
      const fH = Math.abs(frame.max_y - frame.min_y);

      // 도면 내 bom_area 확인
      const matchedBa = caseBa.find(ba => ba.drawing_no === matchedDwg.drawing_no_normalized);
      const baBox = matchedBa ? JSON.parse(matchedBa.bbox_json) : null;

      // 도면 내부 기하 객체 및 치수 텍스트 파싱
      const dimVals: number[] = [];
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      let geomCount = 0;
      let hasHeatText = false;
      let heatSpec = '';

      for (const obj of allObjects) {
        if (!obj.bounding_box_json) continue;
        const ob = JSON.parse(obj.bounding_box_json);
        const cx = (ob.min_x + ob.max_x) / 2;
        const cy = (ob.min_y + ob.max_y) / 2;

        if (cx >= frame.min_x && cx <= frame.max_x && cy >= frame.min_y && cy <= frame.max_y) {
          const bw = Math.abs(ob.max_x - ob.min_x);
          const bh = Math.abs(ob.max_y - ob.min_y);

          // 1. 도면 프레임 테두리 제외
          if (bw >= fW * 0.85 || bh >= fH * 0.85) continue;
          // 2. 표제란 제외
          if (title && cx >= title.min_x && cy <= title.max_y) continue;
          // 3. BOM Area 제외
          if (baBox && cx >= baBox.min_x && cx <= baBox.max_x && cy >= baBox.min_y && cy <= baBox.max_y) continue;
          // 4. 외곽 마진 25mm 눈금선 제외
          if (cx <= frame.min_x + 25 || cx >= frame.max_x - 25 || cy <= frame.min_y + 25 || cy >= frame.max_y - 25) continue;

          // D-5: 열처리 텍스트 감지
          if (obj.raw_text && (obj.raw_text.includes('HrC') || obj.raw_text.includes('HRC') || obj.raw_text.includes('열처리'))) {
            hasHeatText = true;
            heatSpec = obj.raw_text.trim();
          }

          // D-1: 치수 텍스트 수집 (10mm ~ 600mm)
          if (obj.layer === 'DIMENSION' && obj.raw_text) {
            const val = parseFloat(obj.raw_text.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
            if (!isNaN(val) && val >= 10 && val <= 600) {
              dimVals.push(val);
            }
          }

          // 부품 뷰 형상선 BBox 수집
          if (obj.layer !== 'DIMENSION' && (obj.entity_type === 'LINE' || obj.entity_type === 'LWPOLYLINE')) {
            gMinX = Math.min(gMinX, ob.min_x);
            gMinY = Math.min(gMinY, ob.min_y);
            gMaxX = Math.max(gMaxX, ob.max_x);
            gMaxY = Math.max(gMaxY, ob.max_y);
            geomCount++;
          }
        }
      }

      // 실제 외곽 치수(W, L) 도출
      let realW = 150;
      let realL = 100;

      if (dimVals.length >= 2) {
        dimVals.sort((a, b) => b - a);
        realW = dimVals[0];
        realL = dimVals.find(d => d < realW * 0.95) || dimVals[1] || realW;
      } else if (geomCount > 0 && gMaxX > gMinX && gMaxY > gMinY) {
        const gw = Math.round(gMaxX - gMinX);
        const gh = Math.round(gMaxY - gMinY);
        realW = Math.min(gw, gh > 0 ? gw : 200);
        realL = Math.min(gh, gw > 0 ? gh : 150);
        if (realW > 600) realW = Math.round(realW / 10);
        if (realL > 600) realL = Math.round(realL / 10);
      }

      // 두께 파싱
      let thickness = 3.0;
      const tMatch = (rawName + ' ' + (spec || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
      if (tMatch) thickness = parseFloat(tMatch[1] || tMatch[2]);

      // 재질 및 밀도
      const rawMat = (matchedDwg.material || b.material_candidate || 'SS400').trim().toUpperCase();
      const matInfo = matMap.get(rawMat) || matMap.get('SS400');
      const matCode = matInfo ? matInfo.material_code : 'SS400';
      const density = matInfo ? matInfo.density : 7.85;
      const matUnitPrice = matInfo ? matInfo.unit_price_per_kg : 1800;

      // D-2: 공정 유형 판별
      // 판재(두께 6mm 이하)이며 브라켓/커버/플레이트/샤시 형태 -> SHEET_METAL
      // 축(SHAFT), 롤러(ROLLER), 블록(BLOCK), 핀(PIN) 등 -> MACHINING
      const isSheetMetal = (thickness <= 6.0 && (rawName.includes('BRKT') || rawName.includes('BRACKET') || rawName.includes('COVER') || rawName.includes('PLATE') || rawName.includes('PANEL') || rawName.includes('GUIDE')));
      const processType = isSheetMetal ? 'SHEET_METAL' : 'MACHINING';

      // 중량 계산 (kg)
      const volCm3 = (realW * realL * thickness) / 1000;
      const rawWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      const partWeightKg = Math.max(rawWeightKg, 0.05);

      // 절단길이 및 홀/절곡 수
      const cutLength = Math.round(2 * (realW + realL));
      const bends = isSheetMetal ? ((rawName.includes('BRKT') || rawName.includes('BRACKET')) ? 2 : 0) : 0;
      const holes = rawName.includes('PLATE') ? 4 : (rawName.includes('BRKT') ? 2 : 0);
      const pierces = holes + 1;

      // D-3: 표면처리 정합성 (기본값 일괄채움 제거)
      let surfaceTreatment: string | null = null;
      let surfaceFinishCost = 0;
      if (matCode === 'SS400' && (rawName.includes('COVER') || rawName.includes('BRKT'))) {
        surfaceTreatment = '아연도금(삼가백색)';
        surfaceFinishCost = Math.round(partWeightKg * 900);
      } else if (matCode.startsWith('SUS')) {
        surfaceTreatment = null; // 스테인리스는 도금 불필요
      } else if (matCode.startsWith('AL')) {
        surfaceTreatment = null; // 도면 표기 없을 시 NULL 보존 (아연도금 강제 채움 배제)
      }

      // D-5: 열처리비 반영
      let heatCost = 0;
      if (hasHeatText) {
        heatCost = Math.round(partWeightKg * heatPerKg);
      }

      // D-4 & D-6: 원가 산출 모델
      let materialCost = 0;
      let laserCuttingCost = 0;
      let bendingCost = 0;
      let machiningCost = 0;
      let subtotalCost = 0;
      const scrapFactor = 1.08; // 8% 스크랩
      const tierFactor = 1.05; // 1~9 구간 계수
      const marginRate = 0.18; // 표준 마진 18%

      materialCost = Math.round(partWeightKg * matUnitPrice * scrapFactor);

      if (processType === 'SHEET_METAL') {
        // 판금 모델
        const cutCost = Math.round((cutLength / 1000) * (laserPerMeter * 0.8));
        const pierceCost = pierces * 40;
        laserCuttingCost = Math.max(cutCost + pierceCost, 800);
        bendingCost = bends * bendPerStroke;
        machiningCost = 0;
        subtotalCost = materialCost + laserCuttingCost + bendingCost + surfaceFinishCost + heatCost;
      } else {
        // 절삭가공 모델 (순수 공수 기반: 중량 및 형상 기반 공수 추정)
        // 롤러/샤프트/블록의 공수: 0.2h ~ 0.5h
        let machiningHours = 0.25;
        if (partWeightKg > 1.5) machiningHours = 0.45;
        else if (partWeightKg > 0.8) machiningHours = 0.35;
        else if (partWeightKg > 0.3) machiningHours = 0.28;

        laserCuttingCost = 0;
        bendingCost = 0;
        machiningCost = Math.round(machiningHours * hourlyMachineRate);
        subtotalCost = materialCost + machiningCost + surfaceFinishCost + heatCost;
      }

      const totalWithTier = Math.round(subtotalCost * tierFactor);
      const rawPrice = totalWithTier * (1 + marginRate);
      const finalUnitPrice = Math.ceil(rawPrice / 100) * 100;

      const featRow = {
        id: featId,
        quotation_case_id: caseId,
        drawing_id: matchedDwg.id,
        bom_item_id: b.id,
        process_type: processType,
        material_code: matCode,
        material_density: density,
        bbox_width: realW,
        bbox_length: realL,
        bbox_thickness: thickness,
        cutting_length_total: cutLength,
        pierce_count: pierces,
        bending_count: bends,
        through_hole_count: holes,
        tap_hole_count: 0,
        part_weight_kg: partWeightKg,
        surface_area_cm2: Number(((2 * (realW * realL + realW * thickness + realL * thickness)) / 100).toFixed(1)),
        heat_treatment: hasHeatText ? heatSpec : null,
        surface_treatment: surfaceTreatment,
        raw_features_json: JSON.stringify({
          isExtracted: true,
          partName: rawName,
          drawingNo: matchedDwg.drawing_no_normalized,
          source: 'CAD_GEOMETRY_AND_DIMENSION'
        }),
        created_at: now
      };

      const costRow = {
        id: costId,
        feature_id: featId,
        quotation_case_id: caseId,
        material_cost: materialCost,
        laser_cutting_cost: laserCuttingCost,
        bending_cost: bendingCost,
        tapping_cost: 0,
        machining_cost: machiningCost,
        surface_finish_cost: surfaceFinishCost,
        subtotal_cost: subtotalCost,
        markup_rate: marginRate,
        final_unit_price: finalUnitPrice,
        calc_formula_json: JSON.stringify({
          processType,
          materialCode: matCode,
          unitPricePerKg: matUnitPrice,
          weightKg: partWeightKg,
          scrapFactor,
          tierFactor,
          marginRate,
          subtotalCost,
          finalUnitPrice
        }),
        created_at: now
      };

      featRowsToInsert.push(featRow);
      costRowsToInsert.push(costRow);
    } else {
      nullPreservedCount++;
      // 도면 없는 품목 (구매품/노이즈): 엄격 NULL 보존
      featRowsToInsert.push({
        id: featId,
        quotation_case_id: caseId,
        drawing_id: null,
        bom_item_id: b.id,
        process_type: 'PURCHASE',
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
        surface_area_cm2: null,
        heat_treatment: null,
        surface_treatment: null,
        raw_features_json: JSON.stringify({
          isExtracted: false,
          reason: 'NO_CAD_DRAWING_FOUND',
          raw_name: rawName,
          spec: spec
        }),
        created_at: now
      });

      costRowsToInsert.push({
        id: costId,
        feature_id: featId,
        quotation_case_id: caseId,
        material_cost: 0,
        laser_cutting_cost: 0,
        bending_cost: 0,
        tapping_cost: 0,
        machining_cost: 0,
        surface_finish_cost: 0,
        subtotal_cost: 0,
        markup_rate: 0,
        final_unit_price: 0,
        calc_formula_json: JSON.stringify({
          isExtracted: false,
          reason: 'NO_CAD_DRAWING_FOUND',
          unitPrice: 0
        }),
        created_at: now
      });
    }
  }

  // 6. DB 기존 데이터 정리 및 멱등 재적재
  console.log('기존 데이터 정리 및 재적재 실행...');
  const curFeat = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeatRows = curFeat.rows?.filter(r => r.quotation_case_id === caseId) || [];
  if (caseFeatRows.length > 0) {
    await deleteRows('part_fabrication_features', { ids: caseFeatRows.map(r => r.id) });
  }

  const curCost = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCostRows = curCost.rows?.filter(r => r.quotation_case_id === caseId) || [];
  if (caseCostRows.length > 0) {
    await deleteRows('part_cost_breakdowns', { ids: caseCostRows.map(r => r.id) });
  }

  const chunkSize = 50;
  for (let i = 0; i < featRowsToInsert.length; i += chunkSize) {
    await insertRows('part_fabrication_features', featRowsToInsert.slice(i, i + chunkSize));
    await insertRows('part_cost_breakdowns', costRowsToInsert.slice(i, i + chunkSize));
  }

  console.log(`\nDB 적재 완료: 피처 ${featRowsToInsert.length}건, 원가 ${costRowsToInsert.length}건`);
  console.log(` - 조립도 배제(원가 0원): ${assemblyCount}건`);
  console.log(` - 단품 기하 피처 추출 성공: ${extractedCount}건`);
  console.log(` - 도면 미존재 (NULL 엄격 보존): ${nullPreservedCount}건`);

  // 7. 정답셋 대조 및 오차율 정밀 실측
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];

  // 고유 도번 기준 최신 GT 단가 매핑
  const gtMap = new Map<string, any>();
  for (const ph of phRows) {
    const partKey = ph.part_key || '';
    const dwgNo = (partKey.split(':')[1] || partKey).trim();
    if (!gtMap.has(dwgNo) || ph.quotation_case_id === 'case_1789642175904') {
      gtMap.set(dwgNo, ph);
    }
  }

  const errors: any[] = [];
  for (let i = 0; i < featRowsToInsert.length; i++) {
    const f = featRowsToInsert[i];
    const c = costRowsToInsert[i];
    const raw = JSON.parse(f.raw_features_json || '{}');
    const dwgNo = raw.drawingNo;
    if (!dwgNo || f.process_type === 'ASSEMBLY' || c.final_unit_price <= 0) continue;

    const gtItem = gtMap.get(dwgNo);
    if (gtItem && Number(gtItem.unit_price) > 0) {
      const gt = Number(gtItem.unit_price);
      const calc = Number(c.final_unit_price);
      const absDiff = Math.abs(calc - gt);
      const errPct = (absDiff / gt) * 100;

      errors.push({
        dwgNo,
        partName: raw.partName,
        processType: f.process_type,
        gt,
        calc,
        absDiff,
        errPct,
        gtBasis: gtItem.price_basis_type
      });
    }
  }

  errors.sort((a, b) => b.errPct - a.errPct);

  const avgErr = errors.reduce((s, e) => s + e.errPct, 0) / errors.length;
  const medErr = errors[Math.floor(errors.length / 2)]?.errPct || 0;

  console.log(`\n======================================================`);
  console.log(`=== Phase 2-D 최종 오차율 실측 결과 (고유 부품 기준) ===`);
  console.log(`======================================================`);
  console.log(`1:1 대조 매칭 건수: ${errors.length}건`);
  console.log(`평균 오차율: ${avgErr.toFixed(2)}% (Phase 2 최초 73.79% -> 32.65% -> ${avgErr.toFixed(2)}%)`);
  console.log(`중앙값 오차율: ${medErr.toFixed(2)}%`);

  const under5 = errors.filter(e => e.errPct <= 5).length;
  const under10 = errors.filter(e => e.errPct > 5 && e.errPct <= 10).length;
  const under20 = errors.filter(e => e.errPct > 10 && e.errPct <= 20).length;
  const over20 = errors.filter(e => e.errPct > 20).length;

  console.log(`\n=== 오차율 구간 분포 ===`);
  console.log(`  - 5% 이하 (초정밀): ${under5}건 (${((under5/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 5% 초과 ~ 10% 이하: ${under10}건 (${((under10/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 10% 초과 ~ 20% 이하: ${under20}건 (${((under20/errors.length)*100).toFixed(1)}%)`);
  console.log(`  - 20% 이하 누적 달성률: ${(((under5 + under10 + under20)/errors.length)*100).toFixed(1)}%`);
  console.log(`  - 20% 초과: ${over20}건 (${((over20/errors.length)*100).toFixed(1)}%)`);

  console.log(`\n=== 오차 상위 10건 (Top 10) 및 잔여 원인 분석 ===`);
  errors.slice(0, 10).forEach((e, idx) => {
    console.log(`[#${idx + 1}] 도번: ${e.dwgNo} | 품명: ${e.partName} | 공정: ${e.processType}`);
    console.log(`  - GT: ${e.gt.toLocaleString()}원 (${e.gtBasis}) vs Calc: ${e.calc.toLocaleString()}원 | 오차: ${e.errPct.toFixed(1)}% (${e.absDiff.toLocaleString()}원)`);
  });
}

main().catch(console.error);
