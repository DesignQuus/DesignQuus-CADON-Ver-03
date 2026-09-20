import { runMrpExplosion } from '../src/lib/mrp-engine';

async function main() {
  console.log('=== Phase 3 MRP-lite 재산출 실측 검증 실행 ===\n');
  const result = await runMrpExplosion('case_1789766302590');

  console.log('--- [1] 3대 데이터 품질 지표 ---');
  console.log(`1. zeroWeightItemCount: ${result.audit.zeroWeightItemCount}건`);
  console.log(`2. pendingReviewItemCount (두께미상): ${result.audit.pendingReviewItemCount}건`);
  console.log(`3. fallbackItemCount (미매칭): ${result.audit.fallbackItemCount}건`);
  console.log(`- 가공/판금 총 단품 수량: ${result.audit.totalFabricationQty} EA`);
  console.log(`- 구매품 총 수량: ${result.audit.totalPurchaseQty} EA`);
  console.log(`- 전체 시스템 품목 수량: ${result.audit.totalSystemQty} EA`);

  console.log('\n--- [2] 총중량 재산출 실측 ---');
  console.log(`- 판재류(Sheet) 총중량: ${result.audit.sheetTotalWeightKg} kg`);
  console.log(`- 환봉류(Round Bar) 총중량: ${result.audit.roundBarTotalWeightKg} kg`);
  console.log(`- 시스템 합계 총중량: ${result.audit.systemTotalWeightKg} kg`);
  console.log(`(참고: 기존 84.687 kg -> 전수 1:1 복구 및 두께 실측 후 변동 확인)`);

  console.log('\n--- [3] 판재 소요량 상세 (두께별 집계) ---');
  console.table(result.sheetDemands.map(s => ({
    '재질': s.materialCode,
    '두께': `t${s.thicknessMm}`,
    '수량(EA)': s.partCount,
    '총면적(m²)': s.totalAreaM2,
    '총중량(kg)': s.totalWeightKg,
    '4x8(매)': s.estimatedSheets4x8,
    '5x10(매)': s.estimatedSheets5x10,
    '부품수': s.parts.length
  })));

  console.log('\n--- [4] 환봉 소요량 상세 (직경별 집계, 원판 배제) ---');
  console.table(result.roundBarDemands.map(r => ({
    '재질': r.materialCode,
    '직경': `Ø${r.diameterMm}`,
    '수량(EA)': r.partCount,
    '총길이(m)': r.totalLengthM,
    '총중량(kg)': r.totalWeightKg,
    '부품수': r.parts.length
  })));

  console.log('\n--- [5] 구매품 목록 요약 (상위 10건) ---');
  console.table(result.purchaseDemands.slice(0, 10));

  console.log('\n--- [6] Pending Review 품목 목록 (두께 미상 등) ---');
  const pending = result.flattenedParts.filter(p => p.status === 'PENDING_REVIEW' || (p.dimensions.thickness === null && p.materialShape === 'SHEET'));
  console.table(pending.map(p => ({
    '도번': p.drawingNo,
    '품명': p.itemName,
    '재질': p.material,
    '형상': p.materialShape,
    '두께': p.dimensions.thickness,
    '중량': p.unitWeightKg,
    '상태': p.status
  })));
}

main().catch(console.error);
