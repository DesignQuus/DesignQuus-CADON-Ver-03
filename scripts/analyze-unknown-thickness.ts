import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // 1. 피처 중 두께가 NULL인 도면들
  const res = await executeSQL(`
    SELECT f.drawing_id, f.raw_features_json, d.drawing_no_normalized, d.drawing_name_raw, d.material, d.frame_bbox_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
      AND f.raw_features_json LIKE '%"realThickness":null%'
      AND f.process_type != 'ASSEMBLY'
      AND f.raw_features_json LIKE '%"materialShape":"SHEET"%'
  `);

  console.log(`두께 미상 도면 건수: ${res.rows?.length}건`);

  // 2. CAD 객체 로드
  const cadRes = await executeSQL(`
    SELECT raw_text, bounding_box_json, layer
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `);

  for (const r of res.rows || []) {
    let frame: any = null;
    try { frame = JSON.parse(r.frame_bbox_json); } catch {}

    const texts = frame ? (cadRes.rows || []).filter((c: any) => {
      if (!c.raw_text || !c.bounding_box_json) return false;
      let b: any = null;
      try { b = JSON.parse(c.bounding_box_json); } catch {}
      if (!b) return false;
      const cx = (b.min_x + b.max_x) / 2;
      const cy = (b.min_y + b.max_y) / 2;
      return cx >= frame.min_x && cx <= frame.max_x && cy >= frame.min_y && cy <= frame.max_y;
    }) : [];

    const dimTexts = texts.filter((t: any) => t.layer === 'DIMENSION' || !isNaN(parseFloat(t.raw_text)));

    console.log(`\n========================================`);
    console.log(`도번: ${r.drawing_no_normalized} | 품명: ${r.drawing_name_raw} | 재질: ${r.material}`);
    console.log(`프레임 내부 텍스트 수: ${texts.length}개 | 치수/숫자 텍스트 수: ${dimTexts.length}개`);
    console.log(`치수 텍스트 샘플:`, dimTexts.map((t: any) => t.raw_text).slice(0, 15));
  }
}

main().catch(console.error);
