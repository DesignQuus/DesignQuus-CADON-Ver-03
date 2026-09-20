import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  console.log('================================================================');
  console.log('【확인 3 실측】 MRP 집계표의 봉재/축류 58 EA 정체 분석');
  console.log('================================================================');
  
  // MRP 엔진에서 58 EA가 어떻게 나왔는지 mrp-engine.ts 로직 역추적
  // mrp-engine.ts: key = `${part.material}_T${part.dimensions.thickness || 0}`;
  // thickness가 0인 부품들
  const zeroThickParts = await executeSQL(`
    SELECT f.id, f.raw_features_json, f.bbox_thickness, f.part_weight_kg, f.process_type,
           b.raw_name, b.normalized_name, b.material_candidate, b.quantity
    FROM part_fabrication_features f
    JOIN normalized_bom_items b ON f.bom_item_id = b.id
    WHERE f.quotation_case_id = '${caseId}'
  `);

  const rows = zeroThickParts.rows || [];
  console.log(`전체 feature 건수: ${rows.length}건`);

  // thickness 분포
  const t0Items: any[] = [];
  const t3Items: any[] = [];
  for (const r of rows) {
    if (r.bbox_thickness === 0 || !r.bbox_thickness) {
      t0Items.push(r);
    } else {
      t3Items.push(r);
    }
  }

  console.log(`bbox_thickness === 0 건수: ${t0Items.length}건`);
  console.table(t0Items.map(t => ({
    name: t.normalized_name,
    process: t.process_type,
    mat: t.material_candidate,
    qty: t.quantity,
    weight: t.part_weight_kg
  })));

  // 확인: mrp-engine.ts에서 58 EA가 어디서 나왔는지?
  // drawing_relationships 트리 전개 시 리프 노드 중 thickness가 0인 것들
}

main().catch(console.error);
