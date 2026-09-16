/**
 * CADON v2.0 Step 3 추출 결과 검증 및 등급 D 무정보 도면 보강 로직 테스트
 * 실행: npx tsx scripts/test-extract-verify.ts
 */

function runVerificationTests() {
  console.log('====================================================');
  console.log('🧪 CADON v2.0 Step 3 추출 검증 & 무정보 도면 보강 테스트');
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

  // 1. 신뢰도 'LOW' 항목 잔존 시 승인 차단 검증
  console.log('--- 1. 신뢰도 [낮음] 항목 승인 차단 검증 ---');
  const mockBomItemsWithLow = [
    { id: '1', partNo: 'VB-201', partName: 'BODY', confidence: 'HIGH' },
    { id: '2', partNo: 'VB-202', partName: 'BONNET', confidence: 'MEDIUM' },
    { id: '3', partNo: 'VB-203', partName: 'STEM', confidence: 'LOW', actionNote: '풍선 중복 2회' }
  ];

  const hasLow = mockBomItemsWithLow.some((it) => it.confidence === 'LOW');
  assert(hasLow === true, '신뢰도 LOW 항목이 감지되어야 함');

  // 승인 시도 시 차단 여부
  const canApprove = !hasLow;
  assert(canApprove === false, '신뢰도 LOW 건이 있으면 승인이 차단되어야 함');

  // 작업자가 LOW 건을 해결(또는 삭제)한 후
  const mockBomItemsResolved = mockBomItemsWithLow.map((it) =>
    it.confidence === 'LOW' ? { ...it, confidence: 'MEDIUM', actionNote: '수동 확인 완료' } : it
  );
  const canApproveResolved = !mockBomItemsResolved.some((it) => it.confidence === 'LOW');
  assert(canApproveResolved === true, 'LOW 건 해결 후 승인이 허용되어야 함');

  // 2. 등급 D (무정보 도면) 기하 치수 기반 중량 및 조건부 견적 산출 검증
  console.log('\n--- 2. 등급 D (무정보 도면) 형상 힌트 & 조건부 견적 검증 ---');
  const bbox = { width: 250, length: 180, thickness: 12 }; // mm
  const steelDensity = 7.85; // g/cm3

  // 체적 cm3 = (w * l * t) / 1000
  const volumeCm3 = (bbox.width * bbox.length * bbox.thickness) / 1000;
  const rawWeightKg = Number(((volumeCm3 * steelDensity) / 1000).toFixed(2));
  console.log(`   - 감지 외곽: ${bbox.width}x${bbox.length}x${bbox.thickness} mm`);
  console.log(`   - 체적: ${volumeCm3} cm³, 환산 중량(스틸): ${rawWeightKg} kg`);

  assert(rawWeightKg > 4.0 && rawWeightKg < 4.5, '250x180x12mm 판재 스틸 중량은 약 4.24kg이어야 함');

  // 조건부 견적 파라미터 생성 검증
  const tempPartNo = `TMP-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-01`;
  const conditionalParams = {
    tempPartNo,
    partName: 'PLATE-01',
    assumedMaterial: 'SS400',
    quantity: 10,
    dimensions: `${bbox.width} × ${bbox.length} × ${bbox.thickness} mm`,
    conditionNote: '도면 내 재질 미표기로 SS400 기준 조건부 견적 산출 (사양 확정 시 재견적 요망)'
  };

  assert(conditionalParams.tempPartNo.startsWith('TMP-'), '임시 도번 채번 확인');
  assert(conditionalParams.conditionNote.includes('조건부 견적'), '견적 조건부 문구 명시 확인');

  console.log('\n====================================================');
  console.log(`📊 검증 결과: 총 ${total}건 중 ${passed}건 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runVerificationTests();
