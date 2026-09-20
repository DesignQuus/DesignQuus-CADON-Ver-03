import { db, insertRows } from '../src/lib/db';
import { calculateFabricationCost } from '../src/lib/cost-engine';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== 1차 케이스(${caseId}) part_cost_breakdowns 최신 피처 동기화 시작 ===\n`);

  const features = await db.prepare(`
    SELECT f.*, d.drawing_name_raw, d.drawing_no_raw, d.drawing_type, d.is_quote_included
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`총 피처 수: ${features.length}건`);

  // 기존 항목 삭제
  await db.prepare(`DELETE FROM part_cost_breakdowns WHERE quotation_case_id = ?`).run(caseId);

  const now = new Date().toISOString();
  const costRowsToInsert: any[] = [];

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const costId = `cost_${caseId}_${i + 1}_${Math.random().toString(36).substring(2, 8)}`;
    const isAssy = f.is_quote_included === 0 || f.process_type === 'ASSEMBLY';

    if (isAssy) {
      costRowsToInsert.push({
        id: costId,
        feature_id: f.id,
        quotation_case_id: caseId,
        material_cost: 0,
        laser_cutting_cost: 0,
        bending_cost: 0,
        tapping_cost: 0,
        machining_cost: 0,
        surface_finish_cost: 0,
        subtotal_cost: 0,
        markup_rate: 0,
        final_unit_price: 0,
        calc_formula_json: JSON.stringify({
          model: 'ASSEMBLY_EXCLUSION',
          unitPrice: 0,
          note: '조립도 품목 원가 합산 배제'
        }),
        created_at: now
      });
      continue;
    }

    const calcRes = calculateFabricationCost({
      processType: f.process_type === 'MACHINING' ? 'MACHINING' : 'SHEET_METAL',
      materialCode: f.material_code || 'SS400',
      bboxWidth: Number(f.bbox_width) || 100,
      bboxLength: Number(f.bbox_length) || 100,
      bboxThickness: Number(f.bbox_thickness) || 3,
      cuttingLengthTotal: Number(f.cutting_length_total) || 400,
      pierceCount: Number(f.pierce_count) || 2,
      bendingCount: Number(f.bending_count) || 0,
      throughHoleCount: Number(f.through_hole_count) || 2,
      tapHoleCount: Number(f.tap_hole_count) || 0
    });

    costRowsToInsert.push({
      id: costId,
      feature_id: f.id,
      quotation_case_id: caseId,
      material_cost: calcRes.materialCost,
      laser_cutting_cost: calcRes.laserCuttingCost,
      bending_cost: calcRes.bendingCost,
      tapping_cost: calcRes.tappingCost,
      machining_cost: calcRes.machiningCost,
      surface_finish_cost: calcRes.surfaceFinishCost,
      subtotal_cost: calcRes.subtotalCost,
      markup_rate: calcRes.markupRate,
      final_unit_price: calcRes.finalUnitPrice,
      calc_formula_json: JSON.stringify({
        processType: f.process_type,
        materialCode: f.material_code || 'SS400',
        weightKg: Number(f.part_weight_kg),
        materialCost: calcRes.materialCost,
        laserCuttingCost: calcRes.laserCuttingCost,
        machiningCost: calcRes.machiningCost,
        subtotalCost: calcRes.subtotalCost,
        markupRate: calcRes.markupRate,
        finalUnitPrice: calcRes.finalUnitPrice
      }),
      created_at: now
    });
  }

  // Batch insert
  const batchSize = 100;
  for (let b = 0; b < costRowsToInsert.length; b += batchSize) {
    await insertRows('part_cost_breakdowns', costRowsToInsert.slice(b, b + batchSize));
  }
  console.log(`part_cost_breakdowns ${costRowsToInsert.length}건 적재 완료!`);
}

main().catch(console.error);
