import { db } from '../src/lib/db';

async function investigateSecondaryCase() {
  const caseId = 'case_1789894718545';
  console.log('=== [확인 1~3] 2차 케이스 전수 실측 조사 시작 ===\n');

  // [확인 1: 현재 DB의 part_fabrication_features 두께/직경 분포]
  console.log('--- 확인 1: 현재 part_fabrication_features 분포 ---');
  const featRows = await db.prepare(`
    SELECT id, drawing_id, process_type, material_code, bbox_thickness, part_weight_kg, raw_features_json
    FROM part_fabrication_features
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];
  console.log(`현재 피처 건수: ${featRows.length}건`);

  const thkMap = new Map<number, number>();
  const diaMap = new Map<number, number>();

  for (const f of featRows) {
    const t = f.bbox_thickness;
    thkMap.set(t, (thkMap.get(t) || 0) + 1);

    try {
      const meta = JSON.parse(f.raw_features_json || '{}');
      if (meta.diameter) {
        diaMap.set(meta.diameter, (diaMap.get(meta.diameter) || 0) + 1);
      }
    } catch {}
  }

  console.log('bbox_thickness 값별 건수:', Object.fromEntries(thkMap.entries()));
  console.log('환봉 직경(diameter) 값별 건수:', Object.fromEntries(diaMap.entries()));

  // 2차 도면 CAD 엔티티 내의 실제 치수/두께 텍스트 전수 스캔
  const parseRun = await db.prepare(`
    SELECT id FROM cad_parse_runs
    WHERE source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(caseId) as any;

  if (parseRun) {
    const cadTexts = await db.prepare(`
      SELECT raw_text FROM cad_objects
      WHERE parse_run_id = ? AND raw_text IS NOT NULL
    `).all(parseRun.id) as any[];

    const thkMatches: string[] = [];
    const diaMatches: string[] = [];
    for (const c of cadTexts) {
      const txt = c.raw_text.trim();
      if (/(?:^|[^0-9a-zA-Z])([0-9]+(?:\.[0-9]+)?)\s*[tT](?:[^0-9a-zA-Z]|$)/.test(txt) ||
          /(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i.test(txt) ||
          /(?:PL|SS400|AL6061|SUS304|S45C)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i.test(txt)) {
        thkMatches.push(txt);
      }
      if (/[Øø]\s*([0-9]+(?:\.[0-9]+)?)/.test(txt) || /(?:DIA|dia)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i.test(txt)) {
        diaMatches.push(txt);
      }
    }
    console.log(`\nCAD 텍스트 내 두께 관련 텍스트 발견: ${thkMatches.length}건, 샘플:`, thkMatches.slice(0, 15));
    console.log(`CAD 텍스트 내 직경 관련 텍스트 발견: ${diaMatches.length}건, 샘플:`, diaMatches.slice(0, 15));
  }

  // [확인 2: 도면 40장 전수 목록 및 조립도 여부 점검]
  console.log('\n--- 확인 2: 도면 40장 전수 목록 (도번, 품명, drawing_type) ---');
  const drawings = await db.prepare(`
    SELECT drawing_index, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_name_normalized,
           drawing_type, scale, material, is_quote_included
    FROM drawings
    WHERE quotation_case_id = ?
    ORDER BY drawing_index ASC
  `).all(caseId) as any[];

  console.log(`총 도면 건수: ${drawings.length}장`);
  console.log(JSON.stringify(drawings.map(d => ({
    idx: d.drawing_index,
    no: d.drawing_no_normalized || d.drawing_no_raw,
    name: d.drawing_name_raw,
    type: d.drawing_type,
    mat: d.material,
    inc: d.is_quote_included
  })), null, 2));

  // [확인 3: 표제란 BOM 28품목 재질, 수량, 표면처리 전수 조사]
  console.log('\n--- 확인 3: 정규화 BOM 28품목 전수 조사 ---');
  const normItems = await db.prepare(`
    SELECT id, raw_name, normalized_name, spec_candidate, material_candidate, quantity, unit, is_quote_included
    FROM normalized_bom_items
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`정규화 BOM 건수: ${normItems.length}건`);
  const matDist = new Map<string, number>();
  const qtyDist = new Map<number, number>();

  for (const n of normItems) {
    const m = (n.material_candidate || 'NULL').trim();
    matDist.set(m, (matDist.get(m) || 0) + 1);

    const q = n.quantity || 0;
    qtyDist.set(q, (qtyDist.get(q) || 0) + 1);
  }

  console.log('재질(material_candidate) 분포:', Object.fromEntries(matDist.entries()));
  console.log('수량(quantity) 분포:', Object.fromEntries(qtyDist.entries()));
  console.log('정규화 BOM 전수 목록:', normItems.map(n => ({
    name: n.normalized_name || n.raw_name,
    spec: n.spec_candidate,
    mat: n.material_candidate,
    qty: n.quantity,
    unit: n.unit
  })));
}

investigateSecondaryCase().catch(console.error);
