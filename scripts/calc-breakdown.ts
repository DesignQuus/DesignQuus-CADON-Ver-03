import { db } from '../src/lib/db';

async function calculateFeaturesBreakdown() {
  const caseId = 'case_1789766302590';
  const rows = await db.prepare(`
    SELECT f.id, f.drawing_id, d.drawing_no_normalized, d.drawing_name_raw,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.material_code, f.raw_features_json
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
      AND d.drawing_type = 'SUB_PART'
      AND d.is_quote_included = 1
  `).all(caseId) as any[];

  console.log(`단품 도면 피처 건수: ${rows.length}건`);

  let sheetCount = 0;
  let sheetWeight = 0;
  let roundBarCount = 0;
  let roundBarWeight = 0;
  let otherCount = 0;
  let otherWeight = 0;

  for (const r of rows) {
    let meta: any = {};
    try { meta = JSON.parse(r.raw_features_json); } catch {}
    const shape = meta.materialShape || (r.bbox_thickness === 0 ? 'ROUND_BAR' : 'SHEET');
    const w = Number(r.part_weight_kg || 0);

    if (shape === 'SHEET') {
      sheetCount++;
      sheetWeight += w;
    } else if (shape === 'ROUND_BAR') {
      roundBarCount++;
      roundBarWeight += w;
    } else {
      otherCount++;
      otherWeight += w;
    }
  }

  console.log(`판재(SHEET): ${sheetCount}건, ${Number(sheetWeight.toFixed(3))} kg`);
  console.log(`환봉(ROUND_BAR): ${roundBarCount}건, ${Number(roundBarWeight.toFixed(3))} kg`);
  console.log(`기타(OTHER): ${otherCount}건, ${Number(otherWeight.toFixed(3))} kg`);
  console.log(`총합: ${sheetCount + roundBarCount + otherCount}건, ${Number((sheetWeight + roundBarWeight + otherWeight).toFixed(3))} kg`);
}

calculateFeaturesBreakdown().catch(console.error);
