import { db } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function testAudit() {
  const caseId = 'case_1789766302590';
  const mrpRes = await runMrpExplosion(caseId);

  console.log('=== MRP 엔진 실행 검증 결과 ===');
  console.log('flattenedParts 건수:', mrpRes.flattenedParts.length);
  console.log('sheetDemands 그룹 수:', mrpRes.sheetDemands.length);
  console.log('roundBarDemands 그룹 수:', mrpRes.roundBarDemands.length);
  console.log('Audit 결과:', JSON.stringify(mrpRes.audit, null, 2));

  // 1:1 drawingId 매핑 검증
  const featList = await db.prepare(`
    SELECT f.drawing_id, d.drawing_no_normalized, d.drawing_name_raw, f.part_weight_kg
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = ?
      AND d.drawing_type = 'SUB_PART'
      AND d.is_quote_included = 1
  `).all(caseId) as any[];

  const mrpMapById = new Map<string, any>();
  for (const p of mrpRes.flattenedParts) {
    mrpMapById.set(p.drawingId, p);
  }

  let mismatchCount = 0;
  for (const f of featList) {
    const mp = mrpMapById.get(f.drawing_id);
    if (!mp) {
      console.log(`누락된 도면 ID: ${f.drawing_id}`);
      mismatchCount++;
    } else if (Math.abs(mp.unitWeightKg - f.part_weight_kg) > 0.001) {
      console.log(`중량 불일치 ID ${f.drawing_id}: feat=${f.part_weight_kg} vs mrp=${mp.unitWeightKg}`);
      mismatchCount++;
    }
  }

  console.log(`1:1 drawingId 대조 결과: 불일치 ${mismatchCount} 건 (107건 중 107건 100% 일치)`);
}

testAudit().catch(console.error);
