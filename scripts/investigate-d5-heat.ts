import { executeSQL } from '../egdesk-helpers';

async function main() {
  const parseRunId = 'parse_1789766345349';
  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}' AND raw_text IS NOT NULL
  `;
  const res = await executeSQL(sql);
  console.log(`전체 텍스트 객체: ${res.rows?.length}건`);

  const heatKeywords = ['HRC', 'HRC', 'HRC', '열처리', '침탄', '질화', '고주파', '담금질', 'Q/T', 'QT', 'HEAT'];
  const matchedTexts: any[] = [];

  for (const row of (res.rows || [])) {
    const text = (row.raw_text || '').toUpperCase();
    for (const kw of heatKeywords) {
      if (text.includes(kw)) {
        matchedTexts.push({
          id: row.id,
          text: row.raw_text,
          layer: row.layer,
          bbox: row.bounding_box_json
        });
        break;
      }
    }
  }

  console.log(`\n[열처리 키워드 매칭 텍스트 총 ${matchedTexts.length}건]:`);
  matchedTexts.slice(0, 20).forEach(m => {
    console.log(` - [Layer: ${m.layer}] "${m.text}"`);
  });
}

main().catch(console.error);
