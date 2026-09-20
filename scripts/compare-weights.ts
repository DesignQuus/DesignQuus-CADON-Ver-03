import { db } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function compareWeights() {
  const caseId = 'case_1789766302590';
  console.log('=== 중량 집계 비교 분석 ===');

  // 1. part_fabrication_features 단순 합산 (123건 전체)
  const featAll = await db.prepare(`
    SELECT COUNT(*) as cnt, ROUND(SUM(part_weight_kg), 3) as total_weight
    FROM part_fabrication_features
    WHERE quotation_case_id = ?
  `).all(caseId);
  console.log('1. part_fabrication_features 전체 (123건):', featAll);

  // 2. part_fabrication_features 단품만 (107건)
  const featPartsOnly = await db.prepare(`
    SELECT COUNT(*) as cnt, ROUND(SUM(f.part_weight_kg), 3) as total_weight
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
      AND d.drawing_type = 'SUB_PART'
      AND d.is_quote_included = 1
  `).all(caseId);
  console.log('2. part_fabrication_features 단품만 (107건):', featPartsOnly);

  // 3. mrp-engine 실행
  const mrpRes = await runMrpExplosion(caseId);
  console.log('3. mrp-engine 집계:');
  console.log(`   - flattenedParts 건수: ${mrpRes.flattenedParts.length}`);
  console.log(`   - sheetTotalWeight: ${mrpRes.audit.sheetTotalWeightKg} kg`);
  console.log(`   - roundBarTotalWeight: ${mrpRes.audit.roundBarTotalWeightKg} kg`);
  console.log(`   - systemTotalWeight: ${mrpRes.audit.systemTotalWeightKg} kg`);

  // 4. 차이가 나는 품목 대조 (feat vs mrp)
  console.log('=== 차이 품목 정밀 대조 ===');
  const featPartList = await db.prepare(`
    SELECT d.drawing_no_normalized, f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.process_type
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
      AND d.drawing_type = 'SUB_PART'
  `).all(caseId) as any[];

  const mrpPartMap = new Map<string, any>();
  for (const p of mrpRes.flattenedParts) {
    mrpPartMap.set(p.drawingNo, p);
  }

  let totalFeatWeight = 0;
  let totalMrpWeight = 0;
  let diffCount = 0;

  for (const fp of featPartList) {
    totalFeatWeight += fp.part_weight_kg;
    const mp = mrpPartMap.get(fp.drawing_no_normalized);
    if (!mp) {
      console.log(`[BOM 누락 단품] ${fp.drawing_no_normalized} (feat: ${fp.part_weight_kg}kg)`);
      diffCount++;
    } else {
      totalMrpWeight += mp.totalWeightKg;
      const diff = Math.abs(mp.totalWeightKg - fp.part_weight_kg);
      if (diff > 0.001) {
        console.log(`[중량 차이] ${fp.drawing_no_normalized}: feat=${fp.part_weight_kg}kg vs mrp=${mp.totalWeightKg}kg (수량: ${mp.totalQty}, shape: ${mp.materialShape})`);
        diffCount++;
      }
    }
  }

  console.log(`총 피처 중량: ${Number(totalFeatWeight.toFixed(3))} kg`);
  console.log(`총 MRP 중량: ${Number(totalMrpWeight.toFixed(3))} kg`);
  console.log(`차이 발생 품목 수: ${diffCount} 건`);
}

compareWeights().catch(console.error);
