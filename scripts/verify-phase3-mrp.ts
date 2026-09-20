import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  console.log('================================================================');
  console.log('【Phase 3】 MRP-lite 자재소요 산출 및 3대 보존 법칙 실측 검증');
  console.log('================================================================\n');

  const result = await runMrpExplosion('case_1789766302590');

  console.log(`[1] BOM 전개 요약:`);
  console.log(`- 대상 케이스: ${result.quotationCaseId}`);
  console.log(`- 최상위 루트 도면: ${result.rootDrawingNo}`);
  console.log(`- 전개된 리프 단품 수: ${result.flattenedParts.length}개`);
  console.log(`- 총 부품 소요 수량(EA): ${result.audit.totalFabricationCount + result.audit.totalPurchaseCount} EA`);
  console.log(`  * 가공/판금 제조 단품: ${result.audit.totalFabricationCount} EA`);
  console.log(`  * 구매품 소요: ${result.audit.totalPurchaseCount} EA\n`);

  console.log(`[2] 표준 소재별 소요량 집계 (총 ${result.materialDemands.length}개 규격):`);
  console.table(result.materialDemands.map(m => ({
    소재코드: m.materialCode,
    두께: `t${m.thicknessMm}`,
    부품수: m.partCount,
    '총중량(kg)': m.totalWeightKg,
    '총면적(m²)': m.totalAreaM2,
    '원판(4x8)': `${m.estimatedSheets4x8} 매`,
    '원판(5x10)': `${m.estimatedSheets5x10} 매`
  })));

  console.log(`\n[3] 구매품 소요 리스트 (샘플 5건):`);
  console.table(result.purchaseDemands.slice(0, 5));

  console.log(`\n[4] 조건 C: 3대 내부 정합성 보존 검증 결과:`);
  console.log(`- 1. 수량 보존 법칙: ${result.audit.isQuantityConserved ? '✅ 통과' : '❌ 실패'}`);
  console.log(`- 2. 중량 보존 법칙: ${result.audit.isWeightConserved ? '✅ 통과' : '❌ 실패'} (오차: ${result.audit.weightDifferenceKg} kg)`);
  console.log(`- 3. 순환 루프 0건 검증: ${result.audit.isCycleFree ? '✅ 통과 (무순환)' : '❌ 실패 (루프 검출)'}`);
  console.log(`- 4. 단품 총중량 합: ${result.audit.systemTotalWeightKg} kg`);
  console.log(`- 5. 소재 집계중량 합: ${result.audit.materialSumWeightKg} kg`);
  
  console.log(`\n[5] 세부 감사 로그:`);
  for (const d of result.audit.details) {
    console.log(`  • ${d}`);
  }
}

main().catch(console.error);
