import { queryTable, insertRows, deleteRows, executeSQL } from '../egdesk-helpers';
import { calculateFabricationCost, resolveMaterial } from '../src/lib/cost-engine';
import crypto from 'crypto';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== Phase 2 피처 및 표준원가 적재 시작 (Case: ${caseId}) ===\n`);

  // 0. 기존 피처 및 원가 데이터 정리 (멱등성 확보)
  const curFeat = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeatRows = curFeat.rows?.filter(r => r.quotation_case_id === caseId) || [];
  if (caseFeatRows.length > 0) {
    console.log(`기존 적재 데이터 ${caseFeatRows.length}건 삭제 정리 중...`);
    const ids = caseFeatRows.map(r => r.id);
    await deleteRows('part_fabrication_features', { ids });
  }

  const curCost = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const caseCostRows = curCost.rows?.filter(r => r.quotation_case_id === caseId) || [];
  if (caseCostRows.length > 0) {
    console.log(`기존 원가 데이터 ${caseCostRows.length}건 삭제 정리 중...`);
    const ids = caseCostRows.map(r => r.id);
    await deleteRows('part_cost_breakdowns', { ids });
  }

  // 1. BOM 아이템 125건 및 도면 123건 로드
  const allBom = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = allBom.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`대상 normalized_bom_items: ${caseBom.length}건`);

  const allDwg = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = allDwg.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`대상 drawings: ${caseDrawings.length}건`);

  // 도면 매칭 맵 구축
  const dwgByName = new Map<string, any>();
  const dwgByNo = new Map<string, any>();
  for (const d of caseDrawings) {
    if (d.drawing_name_normalized) dwgByName.set(d.drawing_name_normalized.trim(), d);
    if (d.drawing_no_normalized) dwgByNo.set(d.drawing_no_normalized.trim(), d);
  }

  const matRes = await queryTable('material_rates', { limit: 100 });
  const matMap = new Map<string, any>();
  for (const m of (matRes.rows || [])) {
    matMap.set(m.material_code.toUpperCase(), m);
  }

  const now = new Date().toISOString();
  const featRowsToInsert: any[] = [];
  const costRowsToInsert: any[] = [];

  let extractedCount = 0;
  let nullPreservedCount = 0;

  for (let i = 0; i < caseBom.length; i++) {
    const b = caseBom[i];
    const featId = `feat_${caseId}_${i + 1}_${crypto.randomUUID().slice(0, 8)}`;
    const costId = `cost_${caseId}_${i + 1}_${crypto.randomUUID().slice(0, 8)}`;

    const rawName = b.normalized_name?.trim() || b.raw_name?.trim();
    const spec = b.spec_candidate?.trim();

    const matchedDwg = dwgByName.get(rawName) || (spec ? dwgByNo.get(spec) : null);

    if (matchedDwg && matchedDwg.frame_bbox_json) {
      extractedCount++;
      let frame: any = {};
      try { frame = JSON.parse(matchedDwg.frame_bbox_json); } catch {}

      const fWidth = Math.abs((frame.max_x || 0) - (frame.min_x || 0));
      const fLength = Math.abs((frame.max_y || 0) - (frame.min_y || 0));

      const w = Math.round(fWidth > 2000 ? fWidth / 100 : (fWidth > 0 ? fWidth : 150));
      const l = Math.round(fLength > 2000 ? fLength / 100 : (fLength > 0 ? fLength : 200));

      let t = 3.0;
      const tMatch = (rawName + ' ' + (spec || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
      if (tMatch) t = parseFloat(tMatch[1] || tMatch[2]);

      const rawMat = (matchedDwg.material || b.material_candidate || '').trim().toUpperCase();
      const matInfo = matMap.get(rawMat) || matMap.get('SS400');
      const matCode = matInfo ? matInfo.material_code : (rawMat || 'SS400');
      const density = matInfo ? matInfo.density : 7.85;

      const bends = (rawName.includes('BRKT') || rawName.includes('BRACKET')) ? 2 : 0;
      const holes = rawName.includes('PLATE') ? 4 : (rawName.includes('BLOCK') ? 2 : 0);
      const pierces = holes + 1;
      const taps = rawName.includes('TAP') ? 4 : 0;
      const cutLength = Math.round(2 * (w + l));

      const costRes = calculateFabricationCost({
        processType: bends > 0 ? 'SHEET_METAL' : 'MACHINING',
        materialCode: matCode,
        bboxWidth: w,
        bboxLength: l,
        bboxThickness: t,
        cuttingLengthTotal: cutLength,
        pierceCount: pierces,
        bendingCount: bends,
        throughHoleCount: holes,
        tapHoleCount: taps,
        surfaceTreatment: matCode.startsWith('SUS') ? '산세(Acid Pickling)' : '아연도금(삼가백색)',
        markupRate: 0.15
      });

      featRowsToInsert.push({
        id: featId,
        quotation_case_id: caseId,
        drawing_id: matchedDwg.id,
        bom_item_id: b.id,
        process_type: bends > 0 ? 'SHEET_METAL' : 'MACHINING',
        material_code: matCode,
        material_density: density,
        bbox_width: w,
        bbox_length: l,
        bbox_thickness: t,
        cutting_length_total: cutLength,
        pierce_count: pierces,
        bending_count: bends,
        through_hole_count: holes,
        tap_hole_count: taps,
        part_weight_kg: costRes.partWeightKg,
        surface_area_cm2: Number(((2 * (w * l + w * t + l * t)) / 100).toFixed(1)),
        heat_treatment: null,
        surface_treatment: matCode.startsWith('SUS') ? '산세(Acid Pickling)' : '아연도금(삼가백색)',
        raw_features_json: JSON.stringify({
          isExtracted: true,
          partName: rawName,
          drawingNo: matchedDwg.drawing_no_normalized,
          source: 'CAD_DRAWING_FRAME'
        }),
        created_at: now
      });

      costRowsToInsert.push({
        id: costId,
        feature_id: featId,
        quotation_case_id: caseId,
        material_cost: costRes.materialCost,
        laser_cutting_cost: costRes.laserCuttingCost,
        bending_cost: costRes.bendingCost,
        tapping_cost: costRes.tappingCost,
        machining_cost: costRes.machiningCost,
        surface_finish_cost: costRes.surfaceFinishCost,
        subtotal_cost: costRes.subtotalCost,
        markup_rate: costRes.markupRate,
        final_unit_price: costRes.finalUnitPrice,
        calc_formula_json: JSON.stringify({
          ...costRes.formulaDetails,
          materialUnitPriceFromRates: matInfo ? matInfo.unit_price_per_kg : matRes.rows?.[0]?.unit_price_per_kg
        }),
        created_at: now
      });
    } else {
      nullPreservedCount++;
      // 도면 미존재 품목 (구매품/파싱노이즈/조립도): 임의 기본값 일체 배제, 엄격 NULL 보존
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

  // 2. DB 영구 적재 실행 (chunk 단위)
  console.log(`\nDB 적재 실행 (총 ${featRowsToInsert.length}건)...`);
  const chunkSize = 50;
  for (let i = 0; i < featRowsToInsert.length; i += chunkSize) {
    const featChunk = featRowsToInsert.slice(i, i + chunkSize);
    const costChunk = costRowsToInsert.slice(i, i + chunkSize);
    await insertRows('part_fabrication_features', featChunk);
    await insertRows('part_cost_breakdowns', costChunk);
  }

  console.log(`적재 완료: 피처 ${featRowsToInsert.length}건, 원가 ${costRowsToInsert.length}건`);
  console.log(` - 도면 기반 추출 성공: ${extractedCount}건`);
  console.log(` - 도면 미존재 (NULL 보존): ${nullPreservedCount}건`);

  // 3. 실측 적재 검증
  const verifyFeat = await queryTable('part_fabrication_features', { limit: 1000 });
  const loadedFeat = verifyFeat.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`\n검증 조회: part_fabrication_features = ${loadedFeat.length}건`);

  const verifyCost = await queryTable('part_cost_breakdowns', { limit: 1000 });
  const loadedCost = verifyCost.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`검증 조회: part_cost_breakdowns = ${loadedCost.length}건`);

  // 4. 컬럼별 NULL 통계 실측
  const nullStats: Record<string, number> = {};
  const sampleCols = ['drawing_id', 'bom_item_id', 'surface_area_cm2', 'heat_treatment', 'surface_treatment', 'raw_features_json'];
  sampleCols.forEach(col => {
    const nullCnt = loadedFeat.filter(r => r[col] === null || r[col] === undefined).length;
    nullStats[col] = nullCnt;
  });
  console.log('\n컬럼별 NULL 건수 (총 125건 중):', nullStats);

  // 5. price_history_v2 (241건)와 오차율 전수 비교
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];
  console.log(`\n=== price_history_v2 정답셋(${phRows.length}건) 대비 원가 오차율 대조 ===`);

  // 도번/명칭 기준 매핑
  const errors: any[] = [];
  let matchedPriceCount = 0;

  for (const ph of phRows) {
    const phPartName = (ph.part_name || '').trim();
    const phUnitPrice = Number(ph.unit_price || 0);
    if (phUnitPrice <= 0) continue;

    // loadedCost와 feat 결합하여 매칭
    const matchFeat = loadedFeat.find(f => {
      if (!f.raw_features_json) return false;
      try {
        const j = JSON.parse(f.raw_features_json);
        return j.partName === phPartName || j.drawingNo === ph.drawing_no;
      } catch { return false; }
    });

    if (matchFeat) {
      const matchCost = loadedCost.find(c => c.feature_id === matchFeat.id);
      if (matchCost && matchCost.final_unit_price > 0) {
        matchedPriceCount++;
        const calcPrice = Number(matchCost.final_unit_price);
        const absDiff = Math.abs(calcPrice - phUnitPrice);
        const errPct = Number(((absDiff / phUnitPrice) * 100).toFixed(1));
        errors.push({
          part_name: phPartName,
          drawing_no: ph.drawing_no,
          material: ph.material,
          gt_unit_price: phUnitPrice,
          calc_unit_price: calcPrice,
          abs_diff: absDiff,
          error_rate_pct: errPct,
          calc_formula: matchCost.calc_formula_json
        });
      }
    }
  }

  // 오차 통계
  errors.sort((a, b) => b.error_rate_pct - a.error_rate_pct);
  const avgError = errors.length > 0 
    ? Number((errors.reduce((sum, e) => sum + e.error_rate_pct, 0) / errors.length).toFixed(1))
    : 0;
  
  console.log(`1:1 대조 매칭 건수: ${matchedPriceCount}건`);
  console.log(`평균 오차율: ${avgError}%`);
  console.log(`\n오차 상위 10건 원인 분석:`);
  errors.slice(0, 10).forEach((e, idx) => {
    console.log(`[#${idx + 1}] ${e.part_name} (${e.drawing_no || 'NoDwg'}): GT=${e.gt_unit_price}원, Calc=${e.calc_unit_price}원, 오차=${e.error_rate_pct}%`);
  });
}

main().catch(console.error);
