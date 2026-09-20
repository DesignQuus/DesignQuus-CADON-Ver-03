import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // 240324-01-C01 (MAIN C/V DRIVE COVER)
  const dwg = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, material, frame_bbox_json
    FROM drawings
    WHERE quotation_case_id = '${caseId}' AND drawing_no_normalized = '240324-01-C01'
  `);
  console.log('도면 정보:', dwg.rows?.[0]);

  let frame: any = null;
  try { frame = JSON.parse(dwg.rows?.[0]?.frame_bbox_json); } catch {}

  const cadRes = await executeSQL(`
    SELECT raw_text, bounding_box_json, layer
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `);

  const texts: any[] = [];
  for (const c of cadRes.rows || []) {
    if (!c.raw_text || !c.bounding_box_json) continue;
    let b: any = null;
    try { b = JSON.parse(c.bounding_box_json); } catch {}
    if (!b) continue;
    const cx = (b.min_x + b.max_x) / 2;
    const cy = (b.min_y + b.max_y) / 2;
    if (frame && cx >= frame.min_x && cx <= frame.max_x && cy >= frame.min_y && cy <= frame.max_y) {
      texts.push({ text: c.raw_text, layer: c.layer });
    }
  }

  console.log(`240324-01-C01 텍스트 총 ${texts.length}개:`);
  const dimTexts = texts.filter(t => t.layer === 'DIMENSION' || !isNaN(parseFloat(t.text)));
  console.log('치수 레이어 및 숫자 텍스트:', dimTexts.map(t => `${t.layer}: ${t.text}`).slice(0, 50));

  const thkTexts = texts.filter(t => t.text.toLowerCase().includes('t') || t.text.includes('1.2') || t.text.includes('1.6') || t.text.includes('2.0') || t.text.includes('3.2'));
  console.log('두께 관련 텍스트:', thkTexts.map(t => `${t.layer}: ${t.text}`));
}

main().catch(console.error);
