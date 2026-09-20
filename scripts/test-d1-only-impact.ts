import { queryTable, executeSQL } from '../egdesk-helpers';
import { calculateFabricationCost } from '../src/lib/cost-engine';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log('=== D-1 치수 소스 단독 교체 시 중간 오차율 실측 테스트 ===\n');

  // 1. 도면 목록
  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  // 2. BOM 목록
  const bomRes = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseBom = bomRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  // 3. price_history_v2 (고유 도번 기준 매핑)
  const phRes = await queryTable('price_history_v2', { limit: 500 });
  const phRows = phRes.rows || [];

  // 케이스별 최신 이력 우선 매핑 (고유 도번 맵)
  const phMap = new Map<string, any>();
  for (const ph of phRows) {
    const partKey = ph.part_key || '';
    const dwgNo = (partKey.split(':')[1] || partKey).trim();
    if (!phMap.has(dwgNo) || ph.quotation_case_id === 'case_1789642175904') {
      phMap.set(dwgNo, ph);
    }
  }

  // 4. cad_objects 전체
  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}'
  `;
  const coRes = await executeSQL(sql);
  const allObjects = coRes.rows || [];

  // D-1 치수 추출 로직 적용
  const errors: any[] = [];
  const partWeightSamples: any[] = [];

  for (const b of caseBom) {
    const rawName = b.normalized_name?.trim() || b.raw_name?.trim();
    const spec = b.spec_candidate?.trim();

    const dwg = caseDrawings.find(d => 
      d.drawing_name_normalized === rawName || 
      (spec && d.drawing_no_normalized === spec)
    );
    if (!dwg || !dwg.frame_bbox_json) continue;

    const frame = JSON.parse(dwg.frame_bbox_json);
    const title = dwg.title_block_bbox_json ? JSON.parse(dwg.title_block_bbox_json) : null;
    const fW = Math.abs(frame.max_x - frame.min_x);
    const fH = Math.abs(frame.max_y - frame.min_y);

    // D-1: 치수선 및 비프레임 기하 객체로부터 부품 외곽 산출
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

        // 프레임 테두리 제외
        if (bw >= fW * 0.85 || bh >= fH * 0.85) continue;
        // 표제란 제외
        if (title && cx >= title.min_x && cy <= title.max_y) continue;
        // 외곽 마진 25mm 제외
        if (cx <= frame.min_x + 25 || cx >= frame.max_x - 25 || cy <= frame.min_y + 25 || cy >= frame.max_y - 25) continue;

        if (obj.layer === 'DIMENSION' && obj.raw_text) {
          const val = parseFloat(obj.raw_text.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
          // 도면 프레임 크기보다 작은 타당한 치수 (10 ~ 500mm)
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

    // 두께
    let thickness = 3.0;
    const tMatch = (rawName + ' ' + (spec || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
    if (tMatch) thickness = parseFloat(tMatch[1] || tMatch[2]);

    const cutLength = Math.round(2 * (realW + realL));
    const costRes = calculateFabricationCost({
      processType: 'MACHINING',
      materialCode: dwg.material || 'SS400',
      bboxWidth: realW,
      bboxLength: realL,
      bboxThickness: thickness,
      cuttingLengthTotal: cutLength,
      pierceCount: 1,
      bendingCount: 0,
      throughHoleCount: 0,
      tapHoleCount: 0,
      markupRate: 0.18
    });

    partWeightSamples.push({
      dwgNo: dwg.drawing_no_normalized,
      name: rawName,
      w: realW,
      l: realL,
      weightKg: costRes.partWeightKg
    });

    // 정답셋 대조
    const ph = phMap.get(dwg.drawing_no_normalized);
    if (ph && Number(ph.unit_price) > 0) {
      const gt = Number(ph.unit_price);
      const calc = costRes.finalUnitPrice;
      const absDiff = Math.abs(calc - gt);
      const errPct = (absDiff / gt) * 100;
      errors.push({
        dwgNo: dwg.drawing_no_normalized,
        name: rawName,
        gt,
        calc,
        errPct,
        weightKg: costRes.partWeightKg
      });
    }
  }

  console.log(`D-1 단독 적용 대조 매칭 건수: ${errors.length}건 (고유 부품 기준)`);
  const avgErr = errors.reduce((s, e) => s + e.errPct, 0) / errors.length;
  console.log(`D-1 단독 적용 평균 오차율: ${avgErr.toFixed(2)}% (기존 73.79% 대비)`);

  console.log('\n[D-1 치수 교체 후 부품 중량 샘플 5건]:');
  partWeightSamples.slice(0, 5).forEach(s => {
    console.log(` - ${s.name} (${s.dwgNo}): W=${s.w}mm, L=${s.l}mm, 중량=${s.weightKg}kg`);
  });
}

main().catch(console.error);
