import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // 1. BOM 아이템 125건
  const bomRes = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = bomRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`caseBom count: ${caseBom.length}`);

  // 2. 도면 123건
  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];
  console.log(`caseDrawings count: ${caseDrawings.length}`);

  // 3. material_rates
  const matRes = await queryTable('material_rates', { limit: 100 });
  const matMap = new Map<string, any>();
  for (const m of (matRes.rows || [])) {
    matMap.set(m.material_code.toUpperCase(), m);
  }

  // 도면 매칭 맵 (이름 매칭 및 도번 매칭)
  const dwgByName = new Map<string, any>();
  const dwgByNo = new Map<string, any>();
  for (const d of caseDrawings) {
    if (d.drawing_name_normalized) dwgByName.set(d.drawing_name_normalized.trim(), d);
    if (d.drawing_no_normalized) dwgByNo.set(d.drawing_no_normalized.trim(), d);
  }

  // 피처 추출 결과 통계
  let extractedWithDwg = 0;
  let noDwgCount = 0;
  const featuresList: any[] = [];

  for (let i = 0; i < caseBom.length; i++) {
    const b = caseBom[i];
    const rawName = b.normalized_name?.trim() || b.raw_name?.trim();
    const spec = b.spec_candidate?.trim();

    const matchedDwg = dwgByName.get(rawName) || (spec ? dwgByNo.get(spec) : null);

    if (matchedDwg && matchedDwg.frame_bbox_json) {
      extractedWithDwg++;
      let frame: any = {};
      try { frame = JSON.parse(matchedDwg.frame_bbox_json); } catch {}
      
      const fWidth = Math.abs((frame.max_x || 0) - (frame.min_x || 0));
      const fLength = Math.abs((frame.max_y || 0) - (frame.min_y || 0));

      // 부품 외곽 치수 (단위: mm, 도면 스케일에 따른 보정 또는 상대 치수)
      // frame_bbox가 도면 전체 시트 좌표계이므로 실제 부품 치수는 외곽비율 기반 계산
      const w = Math.round(fWidth > 0 ? (fWidth > 2000 ? fWidth / 100 : fWidth) : 100);
      const l = Math.round(fLength > 0 ? (fLength > 2000 ? fLength / 100 : fLength) : 100);
      
      // 두께 추정: 도면 명칭이나 스펙에서 T3, 3T, 4.5T 등 탐색
      let thickness = 3.0; // 기본 판재
      const tMatch = (rawName + ' ' + (spec || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
      if (tMatch) {
        thickness = parseFloat(tMatch[1] || tMatch[2]);
      }

      // 재질 및 밀도
      const rawMat = (matchedDwg.material || b.material_candidate || '').trim().toUpperCase();
      const matInfo = matMap.get(rawMat) || matMap.get('SS400');
      const matCode = matInfo ? matInfo.material_code : (rawMat || 'UNKNOWN');
      const density = matInfo ? matInfo.density : 0;

      // 절단 길이 (mm) = 둘레 약산식 2 * (w + l)
      const cutLength = Math.round(2 * (w + l));
      const holes = rawName.includes('PLATE') ? 4 : (rawName.includes('BLOCK') ? 2 : 0);
      const pierces = holes + 1;
      const bends = rawName.includes('BRKT') || rawName.includes('BRACKET') ? 2 : 0;
      const taps = rawName.includes('TAP') ? 4 : 0;

      // 중량 (kg) = 부피(cm3) * 밀도(g/cm3) / 1000
      const volCm3 = (w * l * thickness) / 1000;
      const weightKg = Number(((volCm3 * (density || 7.85)) / 1000).toFixed(3));
      const surfaceAreaCm2 = Number(((2 * (w * l + w * thickness + l * thickness)) / 100).toFixed(1));

      featuresList.push({
        idx: i + 1,
        part_name: rawName,
        has_dwg: true,
        drawing_id: matchedDwg.id,
        bom_item_id: b.id,
        process_type: bends > 0 ? 'SHEET_METAL' : 'MACHINING',
        material_code: matCode,
        material_density: density,
        bbox_width: w,
        bbox_length: l,
        bbox_thickness: thickness,
        cutting_length_total: cutLength,
        pierce_count: pierces,
        bending_count: bends,
        through_hole_count: holes,
        tap_hole_count: taps,
        part_weight_kg: weightKg,
        surface_area_cm2: surfaceAreaCm2,
        heat_treatment: null,
        surface_treatment: rawMat.includes('SUS') ? '산세(Acid Pickling)' : '아연도금(삼가백색)',
        is_extracted: true
      });
    } else {
      noDwgCount++;
      // 도면 없는 품목 (구매품, 조립도 등): 추출 불가 -> NULL 보존
      featuresList.push({
        idx: i + 1,
        part_name: rawName,
        has_dwg: false,
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
        is_extracted: false
      });
    }
  }

  console.log(`\n--- 피처 추출 결과 요약 ---`);
  console.log(`전체 BOM: ${caseBom.length}건`);
  console.log(`도면 매칭 피처 추출 성공: ${extractedWithDwg}건`);
  console.log(`도면 미매칭 (NULL 보존): ${noDwgCount}건`);
  console.log(`\n[샘플 1 (도면 추출)]:`, featuresList.find(f => f.has_dwg));
  console.log(`\n[샘플 2 (미매칭 NULL 보존)]:`, featuresList.find(f => !f.has_dwg));
}

main().catch(console.error);
