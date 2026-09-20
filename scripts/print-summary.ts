import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  const result = await runMrpExplosion('case_1789766302590');

  console.log('=== [1] 3대 데이터 품질 지표 실측 ===');
  console.log(`- zeroWeightItemCount: ${result.audit.zeroWeightItemCount}건`);
  console.log(`- pendingReviewItemCount (두께미상): ${result.audit.pendingReviewItemCount}건`);
  console.log(`- fallbackItemCount (미매칭): ${result.audit.fallbackItemCount}건`);
  console.log(`- 가공/판금 총 단품 수량: ${result.audit.totalFabricationQty} EA`);
  console.log(`- 구매품 총 수량: ${result.audit.totalPurchaseQty} EA`);
  console.log(`- 전체 시스템 품목 수량: ${result.audit.totalSystemQty} EA`);

  console.log('\n=== [2] 총중량 재산출 실측 ===');
  console.log(`- 판재류(Sheet) 총중량: ${result.audit.sheetTotalWeightKg} kg`);
  console.log(`- 환봉류(Round Bar) 총중량: ${result.audit.roundBarTotalWeightKg} kg`);
  console.log(`- 시스템 합계 실측 총중량: ${result.audit.systemTotalWeightKg} kg`);
  console.log(`- 단품 합계 중량: ${result.flattenedParts.reduce((a, b) => a + b.totalWeightKg, 0).toFixed(3)} kg`);
}

main().catch(console.error);
