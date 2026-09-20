import { db, insertRows } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== 1차 케이스(${caseId}) 개선된 로직 기반 피처 및 중량 재산출 시작 ===\n`);

  // 1. 도면 시트 및 최신 CAD 객체 로드
  const drawings = await db.prepare(`
    SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC
  `).all(caseId) as any[];

  const parseRun = await db.prepare(`
    SELECT id FROM cad_parse_runs
    WHERE source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
      AND status = 'SUCCESS'
    ORDER BY created_at DESC LIMIT 1
  `).get(caseId) as any;

  console.log(`최신 parse_run ID: ${parseRun.id}`);

  const objects = await db.prepare(`
    SELECT entity_type, layer, raw_text, bounding_box_json
    FROM cad_objects
    WHERE parse_run_id = ? AND bounding_box_json IS NOT NULL
  `).all(parseRun.id) as any[];

  console.log(`도면 시트: ${drawings.length}장, CAD 객체: ${objects.length}개 로드 완료.`);

  // 2. 기존 피처 테이블 삭제 후 개선된 로직으로 재추출
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
          note: '조립도 배제'
        }),
        created_at: now
      });
      continue;
    }

    // 단품 도면 영역 내 CAD 객체 필터링
    const fb = JSON.parse(d.frame_bbox_json || '{"min_x":0,"min_y":0,"max_x":1000,"max_y":1000}');
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

      // 두께 정규식 매칭
      const tm = txt.match(/(?:^|[^0-9a-zA-Z])([0-9]+(?:\.[0-9]+)?)\s*[tT](?:[^0-9a-zA-Z]|$)/i) ||
                 txt.match(/(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                 txt.match(/(?:PL|SS400|AL6061|SUS304|S45C|SKS2)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i);
      if (tm) {
        const v = parseFloat(tm[1] || tm[2]);
        if (!isNaN(v) && v >= 0.5 && v <= 50 && v !== 1.05 && v !== 1.45) {
          thksFound.push(v);
        }
      }

      // 직경 정규식 매칭
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
    const isShaft = rawName.includes('SHAFT') || rawName.includes('축') || rawName.includes('ROLLER') || rawName.includes('PIN') || rawName.includes('ROD');
    const shape = isShaft ? 'ROUND_BAR' : 'SHEET';

    // 치수 W, L 결정
    let w = 150;
    let l = 100;
    if (dimsFound.length >= 2) {
      dimsFound.sort((a, b) => b - a);
      w = dimsFound[0];
      l = dimsFound.find(dim => dim < w * 0.95) || dimsFound[1] || w;
    } else if (dimsFound.length === 1) {
      w = dimsFound[0];
      l = Math.round(w * 0.6);
    }

    let realThickness: number = 3.0;
    let realDiameter: number | null = null;

    if (shape === 'ROUND_BAR') {
      roundBarCount++;
      if (diasFound.length > 0) {
        diasFound.sort((a, b) => b - a);
        realDiameter = diasFound[0];
      } else {
        realDiameter = Math.min(w, l, 25);
      }
      realThickness = realDiameter;
    } else {
      sheetCount++;
      if (thksFound.length > 0) {
        realThickness = thksFound[0];
      } else {
        // 도면명에 따른 기본 두께 매핑
        if (rawName.includes('COVER')) realThickness = 2.0;
        else if (rawName.includes('BRACKET') || rawName.includes('BRKT')) realThickness = 4.5;
        else if (rawName.includes('BASE') || rawName.includes('PLATE')) realThickness = 10.0;
        else if (rawName.includes('PAN')) realThickness = 1.5;
        else if (rawName.includes('SPACER')) realThickness = 6.0;
        else realThickness = 3.0;
      }
    }

    // 재질 및 밀도
    const matCode = (d.material && d.material !== 'UNKNOWN' && d.material !== 'PE') ? d.material : 'SS400';
    let density = 7.85;
    if (matCode.startsWith('AL')) density = 2.70;
    else if (matCode.startsWith('SUS')) density = 7.93;

    // 중량 계산
    let weight = 0;
    if (shape === 'ROUND_BAR') {
      const r = (realDiameter || 25) / 2;
      const len = Math.max(w, l);
      weight = Number(((Math.PI * r * r * len * density) / 1_000_000).toFixed(3));
    } else {
      weight = Number(((w * l * realThickness * density) / 1_000_000).toFixed(3));
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
      bbox_thickness: realThickness,
      cutting_length_total: Math.round(2 * (w + l)),
      pierce_count: 2,
      bending_count: 0,
      through_hole_count: 2,
      tap_hole_count: 0,
      part_weight_kg: weight,
      surface_area_cm2: Number(((2 * (w * l + w * realThickness + l * realThickness)) / 100).toFixed(1)),
      heat_treatment: '-',
      surface_treatment: '-',
      raw_features_json: JSON.stringify({
        drawingNo: d.drawing_no_normalized || d.drawing_no_raw,
        partName: rawName,
        shape,
        diameter: realDiameter,
        thickness: realThickness,
        source: 'CAD_TEXT_AND_DIM_EXTRACTION'
      }),
      created_at: now
    });
  }

  // DB 배치 삽입
  const batchSize = 100;
  for (let b = 0; b < featRowsToInsert.length; b += batchSize) {
    await insertRows('part_fabrication_features', featRowsToInsert.slice(b, b + batchSize));
  }

  console.log(`피처 적재 완료: 조립 ${assyCount}장, 판재 ${sheetCount}장, 환봉 ${roundBarCount}장 (총 ${featRowsToInsert.length}건)`);
}

main().catch(console.error);
