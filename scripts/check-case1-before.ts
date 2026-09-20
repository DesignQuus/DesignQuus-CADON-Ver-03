import { db } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== 1차 케이스(${caseId}) 재산출 전 상태 점검 ===`);

  const featRows = await db.prepare(`
    SELECT f.*, d.drawing_name_raw, d.drawing_type, d.is_quote_included
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = ?
  `).all(caseId) as any[];

  const included = featRows.filter((r: any) => r.is_quote_included === 1);
  console.log(`단품 도면 피처 건수: ${included.length}건`);

  const thkMap: Record<string, number> = {};
  const diaMap: Record<string, number> = {};

  let totalWeight = 0;
  let sheetWeight = 0;
  let roundBarWeight = 0;
  let sheetCount = 0;
  let roundBarCount = 0;

  for (const f of included) {
    const t = Number(f.bbox_thickness).toFixed(1);
    thkMap[t] = (thkMap[t] || 0) + 1;

    try {
      const meta = JSON.parse(f.raw_features_json || '{}');
      if (meta.diameter) {
        const dia = String(meta.diameter);
        diaMap[dia] = (diaMap[dia] || 0) + 1;
      }
    } catch {}

    const wt = Number(f.part_weight_kg) || 0;
    totalWeight += wt;
    if (f.process_type === 'SHEET_METAL' || (f.raw_material_type || '').includes('SHEET')) {
      sheetWeight += wt;
      sheetCount++;
    } else {
      roundBarWeight += wt;
      roundBarCount++;
    }
  }

  console.log('\n[재산출 전 두께 분포 (전체 단품 107건)]');
  const sortedThk = Object.entries(thkMap).sort((a, b) => Number(a[0]) - Number(b[0]));
  sortedThk.forEach(([t, count]) => {
    console.log(`  t${t}: ${count}장 (${((count / included.length) * 100).toFixed(1)}%)`);
  });

  console.log('\n[재산출 전 직경 분포]:', diaMap);
  console.log(`\n[재산출 전 중량 합계]:`);
  console.log(`  판재(${sheetCount}장): ${sheetWeight.toFixed(3)} kg`);
  console.log(`  환봉(${roundBarCount}장): ${roundBarWeight.toFixed(3)} kg`);
  console.log(`  총 피처 중량: ${totalWeight.toFixed(3)} kg`);

  // MRP 엔진 검산
  const mrpRes = await runMrpExplosion(caseId);
  console.log(`  MRP 엔진 중량: ${mrpRes.totalMaterialWeightKg} kg, 모수일치: ${mrpRes.conservationTest?.isCountMatched}, 보존: ${mrpRes.conservationTest?.isWeightConserved}`);
}

main().catch(console.error);
