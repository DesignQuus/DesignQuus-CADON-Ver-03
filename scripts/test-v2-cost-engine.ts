/**
 * CADON v2.0 제조원가 엔진 및 데이터 무결성 검증 테스트
 * 실행: npx tsx scripts/test-v2-cost-engine.ts
 */

import {
  calculateCastingCost,
  calculateMachiningCost,
  calculateCommercialCost,
  getQtyTier
} from '../src/lib/cost-engine-v2';

function runTests() {
  console.log('====================================================');
  console.log('🧪 CADON v2.0 다변화 제조원가 산출 엔진 정밀 검증');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error('   Detail:', detail);
    }
  }

  // 1. 주조품 원가 모델 테스트 (스토리보드 시나리오 A: SCS13 밸브 바디 20세트)
  console.log('--- 1. 주조품 원가 모델 (Casting Model) 검증 ---');
  const castingResult = calculateCastingCost({
    netWeightKg: 12.0,           // 밸브 바디 중량 12kg
    yieldRate: 0.65,             // 수율 65% (주입중량 약 18.46kg)
    materialKgRate: 11000,       // SCS13 주강 kg당 11,000원
    moldCost: 2000000,           // 신규 목형 2,000,000원
    moldAmortizationQty: 20,     // 20개 상각 (개당 100,000원)
    castingProcessRatePerKg: 2500, // 주조공정 2,500원/kg
    heatTreatmentCost: 25000,    // 열처리비
    postMachiningCost: 80000,    // CNC 후가공비
    defectReserveRate: 0.05,     // 불량률 5%
    quantity: 20,
    marginRate: 0.18             // 마진율 18%
  });

  console.log('   - 제품중량: 12kg, 주입중량:', castingResult.basis.calcFormulaJson.pourWeightKg, 'kg');
  console.log('   - 재료비:', castingResult.materialCost.toLocaleString(), '원');
  console.log('   - 공정비(목형상각+주조+가공):', castingResult.processCost.toLocaleString(), '원');
  console.log('   - 원가소계(불량가산):', castingResult.subtotalCost.toLocaleString(), '원');
  console.log('   - 최종 단위원가/공급단가:', castingResult.unitPrice.toLocaleString(), '원 (수량구간:', castingResult.qtyTier, ')');

  assert(castingResult.partType === 'CASTING', '부품 유형이 CASTING이어야 함');
  assert(castingResult.qtyTier === '10~99', '20개 요청 시 수량구간은 10~99이어야 함');
  assert(castingResult.materialCost > 190000, '재료비는 주입중량(약 18.46kg) 반영되어 19만원 이상이어야 함');
  assert(castingResult.unitPrice > castingResult.subtotalCost, '공급단가는 원가소계보다 커야 함 (마진 적용)');
  assert(castingResult.basis.basisType === 'CASTING_MODEL', '산출 근거(PRICE_BASIS)가 주조 모델로 기록되어야 함');

  // 2. 기계가공품 원가 모델 테스트 (스토리보드 시나리오: SUS316 STEM 샤프트)
  console.log('\n--- 2. 기계가공품 원가 모델 (Machining Model) 검증 ---');
  const machiningResult = calculateMachiningCost({
    rawWeightKg: 0.74,           // Ø25x190 환봉 중량
    materialKgRate: 17100,       // 9월 시세 17,100원/kg
    machiningHours: 0.42,        // CNC선반 15분 + 연마 10분 = 25분(약 0.42시간)
    hourlyMachineRate: 45000,    // 시간당 45,000원
    surfaceTreatmentCost: 4000,  // 연마 사양
    quantity: 20,
    marginRate: 0.15
  });

  console.log('   - 소재비:', machiningResult.materialCost.toLocaleString(), '원');
  console.log('   - 가공비:', machiningResult.processCost.toLocaleString(), '원');
  console.log('   - 공급단가:', machiningResult.unitPrice.toLocaleString(), '원');

  assert(machiningResult.partType === 'MACHINING', '부품 유형이 MACHINING이어야 함');
  assert(machiningResult.unitPrice > 30000, '단가는 3만원대 이상이어야 함');
  assert(machiningResult.basis.basisType === 'MACHINING_MODEL', '기계가공 근거가 기록되어야 함');

  // 3. 구매품 카탈로그 원가 모델 테스트 (볼트류)
  console.log('\n--- 3. 구매품 모델 (Commercial Model) 검증 ---');
  const commercialResult = calculateCommercialCost({
    catalogUnitPrice: 400,
    overheadRate: 0.05,
    quantity: 160,
    marginRate: 0.12
  });

  console.log('   - 카탈로그단가:', commercialResult.materialCost, '원 -> 공급단가:', commercialResult.unitPrice, '원');
  assert(commercialResult.partType === 'COMMERCIAL', '부품 유형이 COMMERCIAL이어야 함');
  assert(commercialResult.qtyTier === '100~', '160개 요청 시 수량구간은 100~이어야 함');

  // 4. 수량 구간 판별 검증
  console.log('\n--- 4. 수량 구간(Lot Size Tier) 판별 검증 ---');
  assert(getQtyTier(1) === '1~9', '1개 -> 1~9');
  assert(getQtyTier(9) === '1~9', '9개 -> 1~9');
  assert(getQtyTier(10) === '10~99', '10개 -> 10~99');
  assert(getQtyTier(99) === '10~99', '99개 -> 10~99');
  assert(getQtyTier(100) === '100~', '100개 -> 100~');

  console.log('\n====================================================');
  console.log(`📊 검증 결과: 총 ${total}건 중 ${passed}건 통과 (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
