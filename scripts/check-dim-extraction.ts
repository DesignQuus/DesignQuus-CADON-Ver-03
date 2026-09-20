import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // 1. drawings
  const dwgs = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, frame_bbox_json
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
      AND (drawing_name_raw LIKE '%ROLLER%' OR drawing_name_raw LIKE '%POST%' OR drawing_name_raw LIKE '%SHAFT%' OR drawing_name_raw LIKE '%PLATE%')
    LIMIT 10
  `);

  // cad_objects
  const cadRes = await executeSQL(`
    SELECT raw_text, bounding_box_json, layer
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `);
  const cadRows = cadRes.rows || [];
  for (const c of cadRows) {
    if (c.bounding_box_json) {
      try { c.parsedBbox = JSON.parse(c.bounding_box_json); } catch {}
    }
  }

  for (const d of dwgs.rows || []) {
    let frameBbox: any = null;
    try { frameBbox = JSON.parse(d.frame_bbox_json); } catch {}
    if (!frameBbox) continue;

    const texts = cadRows.filter((c: any) => {
      if (!c.raw_text) return false;
      const b = c.parsedBbox;
      if (!b) return false;
      return (
        b.min_x >= frameBbox.min_x - 10 &&
        b.max_x <= frameBbox.max_x + 10 &&
        b.min_y >= frameBbox.min_y - 10 &&
        b.max_y <= frameBbox.max_y + 10
      );
    });

    const dimVals: number[] = [];
    for (const t of texts) {
      const txt = (t.raw_text || '').replace(/%%c/gi, '').replace(/[Øø]/g, '').trim();
      const num = parseFloat(txt);
      if (!isNaN(num) && num >= 0.5 && num <= 600 && (t.layer.includes('DIM') || t.raw_text.includes('%%c') || t.raw_text.includes('Ø'))) {
        dimVals.push(num);
      }
    }
    dimVals.sort((a, b) => b - a);

    console.log(`\n도번: ${d.drawing_no_normalized} (${d.drawing_name_raw})`);
    console.log(`  치수 목록: ${dimVals.join(', ')}`);
  }
}

main().catch(console.error);
