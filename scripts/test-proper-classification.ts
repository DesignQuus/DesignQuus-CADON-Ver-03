import { queryTable, executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log('=== 공정유형 정밀 분류(커버/브라켓=SHEET, 플레이트/축=MACHINING) 적용 시 오차율 테스트 ===\n');

  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const bomRes = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = bomRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const baRes = await queryTable('bom_areas', { limit: 500 });
  const caseBa = baRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

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

  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}'
  `;
  const coRes = await executeSQL(sql);
  const allObjects = coRes.rows || [];

  const errors: any[] = [];
  const procCounts: Record<string, number> = {};

  for (const b of caseBom) {
    const rawName = b.normalized_name?.trim() || b.raw_name?.trim();
    const spec = b.spec_candidate?.trim();

    const isAssembly = rawName.includes('조립') || 
                       rawName.toLowerCase().includes('assembly') || 
                       rawName.toLowerCase().includes('assy');
    if (isAssembly) continue; // 조립도 제외

    const dwg = caseDrawings.find(d => 
      d.drawing_name_normalized === rawName || 
      (spec && d.drawing_no_normalized === spec)
    );
    if (!dwg || !dwg.frame_bbox_json) continue;

    const dwgNo = dwg.drawing_no_normalized;
    const frame = JSON.parse(dwg.frame_bbox_json);
    const title = dwg.title_block_bbox_json ? JSON.parse(dwg.title_block_bbox_json) : null;
    const fW = Math.abs(frame.max_x - frame.min_x);
    const fH = Math.abs(frame.max_y - frame.min_y);

    const matchedBa = caseBa.find(ba => ba.drawing_no === dwgNo);
    const baBox = matchedBa ? JSON.parse(matchedBa.bbox_json) : null;

    // D-1 치수 추출
    const dimVals: number[] = [];
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    let geomCount = 0;

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
    const isBracket = rawName.includes('BRKT') || rawName.includes('BRACKET');
    // 판금 부품: 커버류 또는 판재 브라켓류
    const isSheetMetal = isCover || (isBracket && thickness <= 3.2);
    const procType = isSheetMetal ? 'SHEET_METAL' : 'MACHINING';
    procCounts[procType] = (procCounts[procType] || 0) + 1;

    // 공학적 원가 계산
    const density = dwg.material?.includes('AL') ? 2.70 : 7.85;
    const matRate = dwg.material?.includes('AL') ? 6500 : 1800;
    const volCm3 = (realW * realL * thickness) / 1000;
    const weightKg = Number(((volCm3 * density) / 1000).toFixed(3));
    const cutLength = Math.round(2 * (realW + realL));

    let finalPrice = 0;
    if (isSheetMetal) {
      // 판금 모델: 재료비 + 레이저절단 + 절곡
      const matCost = Math.round(weightKg * matRate * 1.08);
      const cutCost = Math.round((cutLength / 1000) * 1800 * 0.8);
      const bendCost = isBracket ? 2 * 800 : 0;
      const subtotal = matCost + Math.max(cutCost + 150, 1800) + bendCost;
      finalPrice = Math.ceil((subtotal * 1.05 * 1.18) / 100) * 100;
    } else {
      // 절삭가공 모델: 재료비 + 가공공수
      const matCost = Math.round(weightKg * matRate * 1.08);
      let mHours = 0.4;
      if (weightKg > 1.2) mHours = 0.46;
      else if (weightKg > 0.6) mHours = 0.42;
      else mHours = 0.38;
      const machCost = Math.round(mHours * 45000 * 0.62); // 셋업분할 공수 실무 적용
      const subtotal = matCost + machCost;
      finalPrice = Math.ceil((subtotal * 1.05 * 1.18) / 100) * 100;
    }

    const gtItem = gtMap.get(dwgNo);
    if (gtItem && Number(gtItem.unit_price) > 0) {
      const gt = Number(gtItem.unit_price);
      const absDiff = Math.abs(finalPrice - gt);
      const errPct = (absDiff / gt) * 100;
      errors.push({
        dwgNo,
        partName: rawName,
        procType,
        gt,
        calc: finalPrice,
        errPct,
        weightKg
      });
    }
  }

  console.log('공정 분류 결과:', procCounts);
  console.log(`대조 매칭 건수: ${errors.length}건`);
  const avgErr = errors.reduce((s, e) => s + e.errPct, 0) / errors.length;
  console.log(`\n★ 개선 후 평균 오차율: ${avgErr.toFixed(2)}% (목표 20% 이하 검증)`);

  const under5 = errors.filter(e => e.errPct <= 5).length;
  const under10 = errors.filter(e => e.errPct > 5 && e.errPct <= 10).length;
  const under20 = errors.filter(e => e.errPct > 10 && e.errPct <= 20).length;
  const over20 = errors.filter(e => e.errPct > 20).length;

  console.log(`\n오차 구간 분포:`);
  console.log(` - 5% 이하: ${under5}건 (${((under5/errors.length)*100).toFixed(1)}%)`);
  console.log(` - 10% 이하: ${under10}건 (${((under10/errors.length)*100).toFixed(1)}%)`);
  console.log(` - 20% 이하: ${under20}건 (${((under20/errors.length)*100).toFixed(1)}%)`);
  console.log(` - ★ 20% 이하 누적 달성률: ${(((under5 + under10 + under20)/errors.length)*100).toFixed(1)}%`);
  console.log(` - 20% 초과: ${over20}건 (${((over20/errors.length)*100).toFixed(1)}%)`);
}

main().catch(console.error);
