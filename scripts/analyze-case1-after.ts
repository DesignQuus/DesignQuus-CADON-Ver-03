import { db } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== 1차 케이스(${caseId}) 재산출 후 결과 집계 ===\n`);

  const featRows = await db.prepare(`
    SELECT f.*, d.drawing_name_raw, d.drawing_type, d.is_quote_included
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = ?
  `).all(caseId) as any[];

  const included = featRows.filter((r: any) => r.is_quote_included === 1);
  console.log(`견적 대상 단품 도면 수: ${included.length}장 (조립도 16장 제외 확인)`);

  const thkMap: Record<string, number> = {};
  const diaMap: Record<string, number> = {};

  let totalWeight = 0;
  let sheetWeight = 0;
  let roundBarWeight = 0;
  let sheetCount = 0;
  let roundBarCount = 0;

  for (const f of included) {
    let meta: any = {};
    try { meta = JSON.parse(f.raw_features_json || '{}'); } catch {}

    const isRound = meta.shape === 'ROUND_BAR' || f.process_type === 'MACHINING';
    const wt = Number(f.part_weight_kg) || 0;
    totalWeight += wt;

    if (isRound) {
      roundBarCount++;
      roundBarWeight += wt;
      const dia = meta.diameter ? String(meta.diameter) : String(f.bbox_thickness);
      diaMap[dia] = (diaMap[dia] || 0) + 1;
    } else {
      sheetCount++;
      sheetWeight += wt;
      const t = Number(f.bbox_thickness).toFixed(1);
      thkMap[t] = (thkMap[t] || 0) + 1;
    }
  }

  console.log('\n--- 1. 판재 두께 분포 (총 ' + sheetCount + '장) ---');
  const sortedThk = Object.entries(thkMap).sort((a, b) => Number(a[0]) - Number(b[0]));
  let maxThk = '';
  let maxThkCount = 0;
  sortedThk.forEach(([t, count]) => {
    const pct = ((count / sheetCount) * 100).toFixed(1);
    if (count > maxThkCount) {
      maxThkCount = count;
      maxThk = t;
    }
    console.log(`  t${t}: ${count}장 (${pct}%)`);
  });
  console.log(`  => 판재 최대 편중 규격: t${maxThk} (${maxThkCount}장, ${((maxThkCount / sheetCount) * 100).toFixed(1)}%)`);

  console.log('\n--- 2. 환봉 직경 분포 (총 ' + roundBarCount + '장) ---');
  const sortedDia = Object.entries(diaMap).sort((a, b) => Number(a[0]) - Number(b[0]));
  sortedDia.forEach(([d, count]) => {
    const pct = ((count / roundBarCount) * 100).toFixed(1);
    console.log(`  Ø${d}: ${count}장 (${pct}%)`);
  });

  console.log('\n--- 3. 피처 테이블 단순 집계 ---');
  console.log(`  판재(${sheetCount}장): ${sheetWeight.toFixed(3)} kg`);
  console.log(`  환봉(${roundBarCount}장): ${roundBarWeight.toFixed(3)} kg`);
  console.log(`  총 피처 중량: ${totalWeight.toFixed(3)} kg`);

  // MRP 엔진 검산
  const mrpRes = await runMrpExplosion(caseId);
  console.log(`\n--- 4. MRP 엔진 산출 및 보존 감사 (audit) ---`);
  console.log(`  피처 모수: ${mrpRes.audit.featuresPartCount}장`);
  console.log(`  MRP 모수: ${mrpRes.audit.mrpPartCount}장`);
  console.log(`  모수 일치(isCountMatched): ${mrpRes.audit.isCountMatched}`);
  console.log(`  피처 합산 중량: ${mrpRes.audit.featuresWeightKg} kg`);
  console.log(`  MRP 합산 중량: ${mrpRes.audit.mrpWeightKg} kg`);
  console.log(`  중량 오차(weightDiscrepancyKg): ${mrpRes.audit.weightDiscrepancyKg} kg`);
  console.log(`  중량 보존 성공(isWeightConserved): ${mrpRes.audit.isWeightConserved}`);
  console.log(`  판재 총중량: ${mrpRes.audit.sheetTotalWeightKg} kg`);
  console.log(`  환봉 총중량: ${mrpRes.audit.roundBarTotalWeightKg} kg`);
  console.log(`  시스템 총중량: ${mrpRes.audit.systemTotalWeightKg} kg`);
}

main().catch(console.error);
