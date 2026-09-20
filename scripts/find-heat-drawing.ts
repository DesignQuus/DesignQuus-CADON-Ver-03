import { executeSQL, queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // 1. 열처리 텍스트 좌표 조회
  const sql = `
    SELECT id, raw_text, bounding_box_json 
    FROM cad_objects 
    WHERE parse_run_id = '${parseRunId}' AND raw_text LIKE '%HrC%'
  `;
  const res = await executeSQL(sql);

  // 2. drawings 조회
  const dwgRes = await queryTable('drawings', { limit: 1000 });
  const caseDrawings = dwgRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  for (const row of (res.rows || [])) {
    const b = JSON.parse(row.bounding_box_json);
    const cx = (b.min_x + b.max_x) / 2;
    const cy = (b.min_y + b.max_y) / 2;

    const matchedDwg = caseDrawings.find(d => {
      if (!d.frame_bbox_json) return false;
      const fb = JSON.parse(d.frame_bbox_json);
      return (cx >= fb.min_x && cx <= fb.max_x && cy >= fb.min_y && cy <= fb.max_y);
    });

    console.log(`열처리 "${row.raw_text}" 위치: (x: ${cx.toFixed(1)}, y: ${cy.toFixed(1)})`);
    console.log(` -> 해당 도면: [${matchedDwg?.drawing_no_normalized}] ${matchedDwg?.drawing_name_normalized} (재질: ${matchedDwg?.material})`);
  }
}

main().catch(console.error);
