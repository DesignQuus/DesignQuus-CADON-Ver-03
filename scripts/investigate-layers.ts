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
    WHERE parse_run_id = '${parseRunId}'
  `;
  const res = await executeSQL(sql);

  const layerMap: Record<string, { count: number, types: Record<string, number>, samples: any[] }> = {};

  for (const row of (res.rows || [])) {
    if (!row.bounding_box_json) continue;
    try {
      const b = JSON.parse(row.bounding_box_json);
      const cx = (b.min_x + b.max_x) / 2;
      const cy = (b.min_y + b.max_y) / 2;
      if (cx >= fMinX && cx <= fMaxX && cy >= fMinY && cy <= fMaxY) {
        const l = row.layer || 'NO_LAYER';
        if (!layerMap[l]) layerMap[l] = { count: 0, types: {}, samples: [] };
        layerMap[l].count++;
        layerMap[l].types[row.entity_type] = (layerMap[l].types[row.entity_type] || 0) + 1;
        if (layerMap[l].samples.length < 3) {
          layerMap[l].samples.push({ type: row.entity_type, text: row.raw_text, b });
        }
      }
    } catch {}
  }

  console.log('MOTOR BRACKET 프레임 내 레이어별 객체 분포:');
  for (const [l, data] of Object.entries(layerMap)) {
    console.log(`\n[Layer: "${l}"] 총 ${data.count}개 객체, 타입:`, data.types);
    console.log('  샘플:', data.samples);
  }
}

main().catch(console.error);
