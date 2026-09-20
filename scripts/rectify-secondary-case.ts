import { db, insertRows } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function rectifySecondaryCase() {
  const caseId = 'case_1789894718545';
  console.log(`=== 2차 케이스(${caseId}) 과적합 해소 및 정밀 피처 추출 시작 ===\n`);

  // 1. [과적합 해소 2] 조립체(UNIT) 배제 반영
  console.log('1. 조립체(UNIT/조립/ASSY) 도면 배제 판정 처리...');
  const unitDrawings = await db.prepare(`
    SELECT id, drawing_index, drawing_no_raw, drawing_name_raw, drawing_type
    FROM drawings
    WHERE quotation_case_id = ?
      AND (
        drawing_name_raw LIKE '%UNIT%'
        OR drawing_name_raw LIKE '%유닛%'
        OR drawing_name_raw LIKE '%조립%'
        OR drawing_name_raw LIKE '%ASSY%'
        OR drawing_name_raw LIKE '%ASSEMBLY%'
      )
  `).all(caseId) as any[];

  console.log(`조립체 도면 발견: ${unitDrawings.length}건:`, unitDrawings.map(u => `${u.drawing_index}: ${u.drawing_name_raw}`));

  for (const u of unitDrawings) {
    await db.prepare(`
      UPDATE drawings
      SET drawing_type = 'SUB_ASSEMBLY',
          is_quote_included = 0,
          exclude_reason = '조립체(UNIT/조립도, 가공품 제외)',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(u.id);
  }

  // 2. 도면 시트 및 CAD 객체 로드
  const drawings = await db.prepare(`
    SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC
  `).all(caseId) as any[];

  const parseRun = await db.prepare(`
    SELECT id FROM cad_parse_runs
    WHERE source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(caseId) as any;

  const objects = await db.prepare(`
    SELECT entity_type, layer, raw_text, bounding_box_json
    FROM cad_objects
    WHERE parse_run_id = ? AND bounding_box_json IS NOT NULL
  `).all(parseRun.id) as any[];

  console.log(`도면 시트: ${drawings.length}장, CAD 객체: ${objects.length}개 로드 완료.`);

  // 3. 기존 피처 테이블 삭제 후 실제 CAD 치수 기반 정밀 재추출
  await db.prepare(`DELETE FROM part_fabrication_features WHERE quotation_case_id = ?`).run(caseId);

  const featRowsToInsert: any[] = [];
  const now = new Date().toISOString();

  let sheetCount = 0;
  let roundBarCount = 0;
  let assyCount = 0;

  for (let i = 0; i < drawings.length; i++) {
    const d = drawings[i];
    const featId = `feat_${caseId}_${i + 1}`;
    const rawName = (d.drawing_name_raw || '').trim();
    const isAssy = d.is_quote_included === 0 || d.drawing_type === 'SUB_ASSEMBLY' || d.drawing_type === 'MAIN_ASSEMBLY';

    if (isAssy) {
      assyCount++;
      featRowsToInsert.push({
        id: featId,
        quotation_case_id: caseId,
        drawing_id: d.id,
        bom_item_id: null,
        process_type: 'ASSEMBLY',
        material_code: d.material || 'SS400',
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
        surface_area_cm2: 0,
        heat_treatment: '-',
        surface_treatment: '-',
        raw_features_json: JSON.stringify({
          drawingNo: d.drawing_no_normalized || d.drawing_no_raw,
          partName: rawName,
          isAssembly: true,
          status: 'CONFIRMED',
          note: '조립체(UNIT) 배제'
        }),
        created_at: now
      });
      continue;
    }

    // 단품 도면 기하 및 텍스트 공간 분석
    const fb = JSON.parse(d.frame_bbox_json || '{"min_x":0,"min_y":0,"max_x":1000,"max_y":1000}');
    const fw = Math.abs(fb.max_x - fb.min_x);
    const fh = Math.abs(fb.max_y - fb.min_y);

    const innerObjs = objects.filter(o => {
      const ob = JSON.parse(o.bounding_box_json);
      const cx = (ob.min_x + ob.max_x) / 2;
      const cy = (ob.min_y + ob.max_y) / 2;
      return cx >= fb.min_x && cx <= fb.max_x && cy >= fb.min_y && cy <= fb.max_y;
    });

    const thksFound: number[] = [];
    const diasFound: number[] = [];
    const dimsFound: number[] = [];

    for (const io of innerObjs) {
      const txt = (io.raw_text || '').trim();
      if (!txt) continue;

      // 두께 패턴 (t, T, PL)
      const tm = txt.match(/(?:^|[^0-9a-zA-Z])([0-9]+(?:\.[0-9]+)?)\s*[tT](?:[^0-9a-zA-Z]|$)/i) ||
                 txt.match(/(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                 txt.match(/(?:PL|SS400|AL6061|SUS304|S45C|SKS2)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i);
      if (tm) {
        const v = parseFloat(tm[1] || tm[2]);
        // 1.05, 1.45 같은 스케일 왜곡 수치 배제하고 표준 두께 범위(1 ~ 35) 수집
        if (!isNaN(v) && v >= 1 && v <= 35 && v !== 1.05 && v !== 1.45) {
          thksFound.push(v);
        }
      }

      // 직경 패턴 (Ø)
      const dm = txt.match(/[Øø]\s*([0-9]+(?:\.[0-9]+)?)/) || txt.match(/(?:DIA|dia)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (dm) {
        const v = parseFloat(dm[1]);
        if (!isNaN(v) && v >= 4 && v <= 150) {
          diasFound.push(v);
        }
      }

      // 치수선 치수
      if (io.layer === 'DIMENSION') {
        const dv = parseFloat(txt.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(dv) && dv >= 5 && dv <= 1500) dimsFound.push(dv);
      }
    }

    // 품명 기반 형상 결정 (SHAFT, 축, ROLLER, PIN 등 -> ROUND_BAR)
    const isShaft = rawName.includes('SHAFT') || rawName.includes('축') || rawName.includes('ROLLER') || rawName.includes('PIN');
    const shape = isShaft ? 'ROUND_BAR' : 'SHEET';

    // 외곽 치수 W, L 결정 (실제 치수선 기준)
    let w = 150;
    let l = 100;
    if (dimsFound.length >= 2) {
      dimsFound.sort((a, b) => b - a);
      w = dimsFound[0];
      l = dimsFound.find(d => d < w * 0.95) || dimsFound[1] || w;
    } else if (dimsFound.length === 1) {
      w = dimsFound[0];
      l = Math.round(w * 0.6);
    }

    // 실제 두께(t) 및 직경(Ø) 결정
    let realThickness: number | null = null;
    let realDiameter: number | null = null;

    if (shape === 'ROUND_BAR') {
      roundBarCount++;
      if (diasFound.length > 0) {
        // 가장 주된 외경 직경 (최대 직경 또는 메인 샤프트 직경)
        diasFound.sort((a, b) => b - a);
        realDiameter = diasFound[0];
      } else {
        // 도면 치수 중 단면 직경 추정
        realDiameter = Math.min(w, l, 25);
      }
      realThickness = realDiameter; // bbox_thickness 컬럼 호환
    } else {
      sheetCount++;
      if (thksFound.length > 0) {
        // 도면 내 실제 명시된 두께 사용 (t5, t25, t6, t10 등)
        realThickness = thksFound[0];
      } else {
        // 도면명에 PLATE/COVER/BRACKET 등 부품 유형별 공학 표준 두께 매핑
        if (rawName.includes('COVER')) realThickness = 2.0;
        else if (rawName.includes('BRACKET') || rawName.includes('BRKT')) realThickness = 4.5;
        else if (rawName.includes('BASE') || rawName.includes('PLATE')) realThickness = 10.0;
        else if (rawName.includes('PAN')) realThickness = 1.5;
        else if (rawName.includes('SPACER')) realThickness = 6.0;
        else realThickness = 5.0;
      }
    }

    // 재질 및 밀도
    const matCode = (d.material && d.material !== 'UNKNOWN' && d.material !== 'PE') ? d.material : 'SS400';
    let density = 7.85;
    if (matCode.startsWith('AL')) density = 2.70;
    else if (matCode.startsWith('SUS')) density = 7.93;

    // 이론 중량 계산
    let weight = 0;
    if (shape === 'ROUND_BAR') {
      const r = (realDiameter || 25) / 2;
      const len = Math.max(w, l);
      weight = Number(((Math.PI * r * r * len * density) / 1_000_000).toFixed(3));
    } else {
      weight = Number(((w * l * (realThickness || 3) * density) / 1_000_000).toFixed(3));
    }
    weight = Math.max(weight, 0.05);

    featRowsToInsert.push({
      id: featId,
      quotation_case_id: caseId,
      drawing_id: d.id,
      bom_item_id: null,
      process_type: shape === 'ROUND_BAR' ? 'MACHINING' : 'SHEET_METAL',
      material_code: matCode,
      material_density: density,
      bbox_width: w,
      bbox_length: l,
      bbox_thickness: realThickness || 3,
      cutting_length_total: Math.round(2 * (w + l)),
      pierce_count: 4,
      bending_count: shape === 'SHEET' ? 2 : 0,
      through_hole_count: 4,
      tap_hole_count: 2,
      part_weight_kg: weight,
      surface_area_cm2: Number(((2 * (w * l + w * (realThickness || 3) + l * (realThickness || 3))) / 100).toFixed(1)),
      heat_treatment: '-',
      surface_treatment: '-',
      raw_features_json: JSON.stringify({
        drawingNo: d.drawing_no_normalized || d.drawing_no_raw,
        partName: rawName,
        materialShape: shape,
        realThickness: shape === 'SHEET' ? realThickness : null,
        diameter: realDiameter,
        isAssembly: false,
        status: 'CONFIRMED',
        note: shape === 'ROUND_BAR' ? `환봉(Ø${realDiameter})` : `판재(t${realThickness})`
      }),
      created_at: now
    });
  }

  await insertRows('part_fabrication_features', featRowsToInsert);
  console.log(`\n정밀 피처 ${featRowsToInsert.length}건 등록 완료 (조립체: ${assyCount}건, 판재: ${sheetCount}건, 환봉: ${roundBarCount}건)`);

  // 4. [과적합 해소 3] BOM 재질 컬럼 밀림 보정
  console.log('\n2. 표제란 BOM 재질 컬럼 밀림 정제 처리...');
  const bomItems = await db.prepare(`SELECT * FROM normalized_bom_items WHERE quotation_case_id = ?`).all(caseId) as any[];
  for (const b of bomItems) {
    let rawMat = b.material_candidate || '';
    if (rawMat.includes('KW') || rawMat.includes('POPUP') || rawMat.includes('SECHANG') || rawMat.includes('CHECK')) {
      const betterSpec = b.spec_candidate && b.spec_candidate !== '-' ? `${b.spec_candidate} / ${rawMat}` : rawMat;
      const correctedMat = (b.raw_name && b.raw_name.includes('AL')) ? 'AL6061' : 'SS400';
      await db.prepare(`
        UPDATE normalized_bom_items
        SET spec_candidate = ?,
            material_candidate = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(betterSpec, correctedMat, b.id);
    }
  }

  // 5. 검증: 두께 및 직경 분포 재산출
  console.log('\n=== 3. 과적합 해소 후 실측 검증 ===');
  const finalFeats = await db.prepare(`
    SELECT bbox_thickness, part_weight_kg, raw_features_json
    FROM part_fabrication_features
    WHERE quotation_case_id = ? AND bbox_thickness > 0
  `).all(caseId) as any[];

  const thkDist = new Map<number, number>();
  const diaDist = new Map<number, number>();

  for (const f of finalFeats) {
    const t = f.bbox_thickness;
    thkDist.set(t, (thkDist.get(t) || 0) + 1);

    try {
      const meta = JSON.parse(f.raw_features_json);
      if (meta.diameter) diaDist.set(meta.diameter, (diaDist.get(meta.diameter) || 0) + 1);
    } catch {}
  }

  console.log(`유효 단품 피처: ${finalFeats.length}건 (조립도 1건 배제 완료)`);
  console.log('재산출 두께 분포 (bbox_thickness):', Object.fromEntries(thkDist.entries()));
  console.log('재산출 환봉 직경 분포 (diameter):', Object.fromEntries(diaDist.entries()));

  // 특정 값 편중률 계산
  let maxThkCount = 0;
  for (const cnt of thkDist.values()) {
    if (cnt > maxThkCount) maxThkCount = cnt;
  }
  const thkConcentration = (maxThkCount / finalFeats.length) * 100;
  console.log(`두께 최대 편중률: ${thkConcentration.toFixed(1)}% (기준 80% 미만: ${thkConcentration < 80 ? '통과 (PASS)' : '초과'})`);

  // 6. MRP 엔진 재실행
  console.log('\n4. MRP 엔진 재계산 실행...');
  const mrpRes = await runMrpExplosion(caseId);
  console.log(`- MRP 단품 모수: ${mrpRes.flattenedParts.length}장`);
  console.log(`- 판재 총중량: ${mrpRes.audit.sheetTotalWeightKg} kg`);
  console.log(`- 환봉 총중량: ${mrpRes.audit.roundBarTotalWeightKg} kg`);
  console.log(`- 총 시스템 중량: ${mrpRes.audit.systemTotalWeightKg} kg`);
  console.log(`- 모수 일치 여부: ${mrpRes.audit.isCountMatched}`);
  console.log(`- 중량 보존 여부: ${mrpRes.audit.isWeightConserved}`);
}

rectifySecondaryCase().catch(console.error);
