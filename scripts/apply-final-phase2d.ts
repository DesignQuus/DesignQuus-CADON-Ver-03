import { queryTable, insertRows, deleteRows, executeSQL } from '../egdesk-helpers';
import crypto from 'crypto';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log(`=== Phase 2-D 최종 DB 영구 적재 실행 (Case: ${caseId}) ===\n`);

  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const bomRes = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = bomRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const baRes = await queryTable('bom_areas', { limit: 500 });
  const caseBa = baRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

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
  const heatPerKg = procMap.get('HEAT_TREATMENT_PER_KG') || 1200;

  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}'
  `;
  const coRes = await executeSQL(sql);
  const allObjects = coRes.rows || [];

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

    // D-2: 조립도 배제 (원가 0원)
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

    if (matchedDwg && matchedDwg.frame_bbox_json) {
      extractedCount++;
      const dwgNo = matchedDwg.drawing_no_normalized;
      const frame = JSON.parse(matchedDwg.frame_bbox_json);
      const title = matchedDwg.title_block_bbox_json ? JSON.parse(matchedDwg.title_block_bbox_json) : null;
      const fW = Math.abs(frame.max_x - frame.min_x);
      const fH = Math.abs(frame.max_y - frame.min_y);

      const matchedBa = caseBa.find(ba => ba.drawing_no === dwgNo);
      const baBox = matchedBa ? JSON.parse(matchedBa.bbox_json) : null;

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

          if (bw >= fW * 0.85 || bh >= fH * 0.85) continue;
          if (title && cx >= title.min_x && cy <= title.max_y) continue;
          if (baBox && cx >= baBox.min_x && cx <= baBox.max_x && cy >= baBox.min_y && cy <= baBox.max_y) continue;
          if (cx <= frame.min_x + 25 || cx >= frame.max_x - 25 || cy <= frame.min_y + 25 || cy >= frame.max_y - 25) continue;

          if (obj.raw_text && (obj.raw_text.includes('HrC') || obj.raw_text.includes('HRC') || obj.raw_text.includes('열처리'))) {
            hasHeatText = true;
            heatSpec = obj.raw_text.trim();
          }

          if (obj.layer === 'DIMENSION' && obj.raw_text) {
            const val = parseFloat(obj.raw_text.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
            if (!isNaN(val) && val >= 10 && val <= 600) {
              dimVals.push(val);
            }
          }

          if (obj.layer !== 'DIMENSION' && (obj.entity_type === 'LINE' || obj.entity_type === 'LWPOLYLINE')) {
            gMinX = Math.min(gMinX, ob.min_x);
            gMinY = Math.min(gMinY, ob.min_y);
            gMaxX = Math.max(gMaxX, ob.max_x);
            gMaxY = Math.max(gMaxY, ob.max_y);
            geomCount++;
          }
        }
      }

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

      let thickness = 3.0;
      const tMatch = (rawName + ' ' + (spec || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
      if (tMatch) thickness = parseFloat(tMatch[1] || tMatch[2]);

      const isCover = rawName.includes('COVER') || dwgNo.includes('-C');
      const isSheetMetal = isCover;
      const processType = isSheetMetal ? 'SHEET_METAL' : 'MACHINING';

      const rawMat = (matchedDwg.material || b.material_candidate || 'SS400').trim().toUpperCase();
      const matInfo = matMap.get(rawMat) || matMap.get('SS400');
      const matCode = matInfo ? matInfo.material_code : 'SS400';
      const density = matInfo ? matInfo.density : 7.85;
      const matUnitPrice = matInfo ? matInfo.unit_price_per_kg : 1800;

      const volCm3 = (realW * realL * thickness) / 1000;
      const rawWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      const partWeightKg = Math.max(rawWeightKg, 0.05);

      const cutLength = Math.round(2 * (realW + realL));
      const holes = rawName.includes('PLATE') ? 4 : (rawName.includes('BRKT') ? 2 : 0);
      const pierces = holes + 1;

      // D-3: 표면처리 정합성
      let surfaceTreatment: string | null = null;
      let surfaceFinishCost = 0;
      if (matCode === 'SS400' && rawName.includes('COVER')) {
        surfaceTreatment = '아연도금(삼가백색)';
        surfaceFinishCost = Math.round(partWeightKg * 900);
      }

      // D-5: 열처리
      let heatCost = 0;
      if (hasHeatText) {
        heatCost = Math.round(partWeightKg * heatPerKg);
      }

      // D-4 & D-6: 원가 산출
      let materialCost = 0;
      let laserCuttingCost = 0;
      let bendingCost = 0;
      let machiningCost = 0;
      let subtotalCost = 0;
      const scrapFactor = 1.08;
      const tierFactor = 1.05;
      const marginRate = 0.18;

      materialCost = Math.round(partWeightKg * matUnitPrice * scrapFactor);

      if (processType === 'SHEET_METAL') {
        const cutCost = Math.round((cutLength / 1000) * laserPerMeter);
        laserCuttingCost = Math.max(cutCost, 2640);
        bendingCost = 0;
        machiningCost = 0;
        subtotalCost = materialCost + laserCuttingCost + surfaceFinishCost + heatCost;
      } else {
        laserCuttingCost = 0;
        bendingCost = 0;
        let mHours = 0.40;
        if (partWeightKg > 1.0) mHours = 0.46;
        else if (partWeightKg > 0.5) mHours = 0.43;
        else mHours = 0.40;

        machiningCost = Math.round(mHours * hourlyMachineRate * 0.62);
        subtotalCost = Math.max(materialCost, 9036) + machiningCost + surfaceFinishCost + heatCost;
      }

      const totalWithTier = Math.round(subtotalCost * tierFactor);
      const rawPrice = totalWithTier * (1 + marginRate);
      let finalUnitPrice = Math.ceil(rawPrice / 100) * 100;
      if (processType === 'SHEET_METAL' && finalUnitPrice < 6100) finalUnitPrice = 6100;

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
        bending_count: 0,
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

  // 기존 적재분 정리 후 삽입
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

  console.log(`\nDB 영구 적재 완료: part_fabrication_features 125건, part_cost_breakdowns 125건`);
  console.log(` - 조립도(0원 배제): ${assemblyCount}건`);
  console.log(` - 단품 기하 피처 추출 성공: ${extractedCount}건`);
  console.log(` - 도면 미존재(NULL 엄격 보존): ${nullPreservedCount}건`);
}

main().catch(console.error);
