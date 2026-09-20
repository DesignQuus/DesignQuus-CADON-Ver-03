import { db } from '../src/lib/db';

async function scanRealDimensionsFor40Drawings() {
  const caseId = 'case_1789894718545';
  console.log('=== 40개 도면 시트 내부 실제 치수/두께/직경 공간 전수 분석 ===\n');

  const drawings = await db.prepare(`
    SELECT id, drawing_index, drawing_name_raw, frame_bbox_json, material
    FROM drawings
    WHERE quotation_case_id = ?
    ORDER BY drawing_index ASC
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

  console.log(`도면 시트: ${drawings.length}장, CAD 객체: ${objects.length}개`);

  const realDwgResults: any[] = [];
  const realThkDist = new Map<string, number>();
  const realDiaDist = new Map<string, number>();

  for (const d of drawings) {
    if (!d.frame_bbox_json) continue;
    const fb = JSON.parse(d.frame_bbox_json);
    const fw = Math.abs(fb.max_x - fb.min_x);
    const fh = Math.abs(fb.max_y - fb.min_y);

    // 해당 도면 시트 내부 객체 필터링
    const innerObjs = objects.filter(o => {
      const ob = JSON.parse(o.bounding_box_json);
      const cx = (ob.min_x + ob.max_x) / 2;
      const cy = (ob.min_y + ob.max_y) / 2;
      return cx >= fb.min_x && cx <= fb.max_x && cy >= fb.min_y && cy <= fb.max_y;
    });

    const thkFound: string[] = [];
    const diaFound: string[] = [];
    const dimsFound: number[] = [];

    for (const io of innerObjs) {
      const txt = (io.raw_text || '').trim();
      if (!txt) continue;

      // 두께 패턴
      const tm = txt.match(/(?:^|[^0-9a-zA-Z])([0-9]+(?:\.[0-9]+)?)\s*[tT](?:[^0-9a-zA-Z]|$)/i) ||
                 txt.match(/(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                 txt.match(/(?:PL|SS400|AL6061|SUS304|S45C|SKS2)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i);
      if (tm) {
        const v = parseFloat(tm[1] || tm[2]);
        if (!isNaN(v) && v > 0 && v <= 50) thkFound.push(`t${v}`);
      }

      // 직경 패턴
      const dm = txt.match(/[Øø]\s*([0-9]+(?:\.[0-9]+)?)/) || txt.match(/(?:DIA|dia)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (dm) {
        const v = parseFloat(dm[1]);
        if (!isNaN(v) && v > 0 && v <= 200) diaFound.push(`Ø${v}`);
      }

      // 일반 치수
      if (io.layer === 'DIMENSION') {
        const dv = parseFloat(txt.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(dv) && dv >= 5 && dv <= 2000) dimsFound.push(dv);
      }
    }

    const uniqueThks = Array.from(new Set(thkFound));
    const uniqueDias = Array.from(new Set(diaFound));

    for (const ut of uniqueThks) realThkDist.set(ut, (realThkDist.get(ut) || 0) + 1);
    for (const ud of uniqueDias) realDiaDist.set(ud, (realDiaDist.get(ud) || 0) + 1);

    realDwgResults.push({
      idx: d.drawing_index,
      name: d.drawing_name_raw,
      mat: d.material,
      thk: uniqueThks.length > 0 ? uniqueThks.join(', ') : '미탐지',
      dia: uniqueDias.length > 0 ? uniqueDias.join(', ') : '미탐지',
      dimsCount: dimsFound.length,
      sampleDims: dimsFound.slice(0, 5)
    });
  }

  console.log('--- 도면 시트별 실제 두께/직경 텍스트 스캔 결과 (상위 20개) ---');
  console.log(JSON.stringify(realDwgResults.slice(0, 20), null, 2));

  console.log('\n--- 실제 발견된 두께(thickness) 텍스트 분포 ---');
  console.log(Object.fromEntries(realThkDist.entries()));

  console.log('\n--- 실제 발견된 직경(diameter) 텍스트 분포 ---');
  console.log(Object.fromEntries(realDiaDist.entries()));
}

scanRealDimensionsFor40Drawings().catch(console.error);
