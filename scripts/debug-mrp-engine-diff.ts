import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const featRes = await executeSQL(`
    SELECT f.id, f.drawing_id, f.bom_item_id, f.process_type, f.material_code,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness,
           f.raw_features_json, d.drawing_no_normalized, d.drawing_name_raw, d.drawing_type
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
  `);
  console.log(`featRes count: ${featRes.rows?.length}`);

  const partMap = new Map();
  for (const f of featRes.rows || []) {
    let parsed: any = {};
    try { parsed = JSON.parse(f.raw_features_json); } catch {}
    const dwgNo = f.drawing_no_normalized || parsed.drawingNo;
    partMap.set(dwgNo, { ...f, parsedMeta: parsed });
  }

  const relsRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const rels = relsRes.rows || [];

  let matched = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];
  for (const r of rels) {
    if (partMap.has(r.child_drawing_no)) {
      matched++;
    } else {
      unmatched++;
      unmatchedList.push(r.child_drawing_no);
    }
  }

  console.log(`매칭: ${matched}, 미매칭: ${unmatched}`);
  if (unmatched > 0) {
    console.log('미매칭 목록:', unmatchedList);
  }
}

main().catch(console.error);
