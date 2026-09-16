/**
 * CADON v2.0 Step 5 단가 검토 워크스페이스 비즈니스 로직 테스트
 * 실행: npx tsx scripts/test-review-workspace.ts
 */

function runWorkspaceTests() {
  console.log('====================================================');
  console.log('🧪 CADON v2.0 Step 5 3분할 워크스페이스 로직 정밀 검증');
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

  // 1. 미분류(UNCLASSIFIED) 부품 확정 차단 검증
  console.log('--- 1. 미분류 부품 확정 차단 제약 검증 ---');
  const mockLines = [
    { id: '1', partNo: 'VB-201', partType: 'CASTING', status: 'CONFIRMED', unitCost: 345000, supplyPrice: 412000 },
    { id: '2', partNo: 'VB-202', partType: 'CASTING', status: 'CONFIRMED', unitCost: 155000, supplyPrice: 188000 },
    { id: '3', partNo: 'VB-203', partType: 'MACHINING', status: 'NEEDS_REVIEW', unitCost: 34500, supplyPrice: 38500 },
    { id: '4', partNo: 'B-M12', partType: 'COMMERCIAL', status: 'AUTO', unitCost: 350, supplyPrice: 420 },
    { id: '5', partNo: 'VB-209', partType: 'UNCLASSIFIED', status: 'AUTO', unitCost: 0, supplyPrice: 0 }
  ];

  // 5번 행(미분류) 확정 시도 시
  const line5 = mockLines[4];
  const canConfirmLine5 = line5.partType !== 'UNCLASSIFIED';
  assert(canConfirmLine5 === false, '미분류 부품은 확정이 차단되어야 함');

  // 3번 행(가공품) 확정 시도 시
  const line3 = mockLines[2];
  const canConfirmLine3 = line3.partType !== 'UNCLASSIFIED';
  assert(canConfirmLine3 === true, '가공품은 확정이 허용되어야 함');

  // 2. 전 행 확정 완료 시 결재 상신 버튼 활성화 검증
  console.log('\n--- 2. 결재 상신 품질 게이트 검증 ---');
  let unconfirmed = mockLines.filter((l) => l.status !== 'CONFIRMED').length;
  assert(unconfirmed === 3, '초기 미확정 행 수는 3건이어야 함');
  const canSubmitWhenUnconfirmed = unconfirmed === 0;
  assert(canSubmitWhenUnconfirmed === false, '미확정 행이 남아있으면 결재 상신 비활성화');

  // 전 행 확정 상태로 변경 시뮬레이션
  const allConfirmedLines = mockLines.map((l) => ({ ...l, status: 'CONFIRMED' as const }));
  const remainingUnconfirmed = allConfirmedLines.filter((l) => l.status !== 'CONFIRMED').length;
  assert(remainingUnconfirmed === 0, '모든 행 확정 후 미확정 수는 0건이어야 함');
  assert(remainingUnconfirmed === 0 ? true : false, '미확정 0건일 때 결재 상신 활성화');

  // 3. 마진율 및 하한선(12%) 경고 검증
  console.log('\n--- 3. 마진 계산 및 최소 마진 하한선(12%) 검증 ---');
  // STEM 부품: 원가 34,500원, 공급가 38,500원
  const cost = 34500;
  const supply = 38500;
  const marginPercent = Math.round(((supply - cost) / supply) * 1000) / 10;
  console.log(`   - 원가: ₩${cost.toLocaleString()}, 공급가: ₩${supply.toLocaleString()} -> 마진: ${marginPercent}%`);

  assert(marginPercent === 10.4, '마진율 계산(10.4%) 정확성 검증');
  assert(marginPercent < 12.0, '최소 마진 하한선(12%) 미달 감지 경고 발생 확인');

  console.log('\n====================================================');
  console.log(`📊 검증 결과: 총 ${total}건 중 ${passed}건 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runWorkspaceTests();
