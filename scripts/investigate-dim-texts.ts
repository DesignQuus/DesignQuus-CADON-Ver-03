import { executeSQL } from '../egdesk-helpers';

async function main() {
  const parseRunId = 'parse_1789766345349';
  const fMinX = 71344.9;
  const fMaxX = 71975.0;
  const fMinY = 3988.0;
  const fMaxY = 4433.6;

  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}' AND layer = 'DIMENSION' AND raw_text IS NOT NULL
  `;
  const res = await executeSQL(sql);

  console.log(`MOTOR BRACKET 치수 레이어의 텍스트 객체들 (${res.rows?.length}건):`);
  for (const row of (res.rows || [])) {
    if (!row.bounding_box_json) continue;
    const b = JSON.parse(row.bounding_box_json);
    const cx = (b.min_x + b.max_x) / 2;
    const cy = (b.min_y + b.max_y) / 2;
    if (cx >= fMinX && cx <= fMaxX && cy >= fMinY && cy <= fMaxY) {
      console.log(` - 치수 텍스트: "${row.raw_text}" (x: ${cx.toFixed(1)}, y: ${cy.toFixed(1)})`);
    }
  }
}

main().catch(console.error);
