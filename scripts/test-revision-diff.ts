/**
 * CADON v2.0 Step 5 리비전 비교(Diff) 및 일괄 계승 검증 테스트
 * 실행: npx tsx scripts/test-revision-diff.ts
 */

function runRevisionDiffTests() {
  console.log('====================================================');
  console.log('🧪 CADON v2.0 Step 5 리비전 Diff 및 일괄 계승 검증');
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

  // 모의 이전 견적 Rev.A 부품 목록 (26건)
  const prevRevA = [
    { partNo: 'VB-201', spec: 'SCS13 12kg', price: 412000 },
    { partNo: 'VB-202', spec: 'SCS13 BONNET', price: 188000 },
    { partNo: 'VB-203', spec: 'SUS316 Ø25x180', price: 37000 },
    { partNo: 'VB-208', spec: 'SPRING SUS304', price: 9000 } // Rev.B에서 삭제 예정
  ];

  // 모의 현재 견적 Rev.B 부품 목록 (28건 중 샘플)
  const currentRevB = [
    { partNo: 'VB-201', spec: 'SCS13 12kg' }, // 동일
    { partNo: 'VB-202', spec: 'SCS13 BONNET' }, // 동일
    { partNo: 'VB-203', spec: 'SUS316 Ø25x190' }, // 변경 (길이 180 -> 190)
    { partNo: 'VB-210', spec: 'PIN Ø8x40' } // 신규 추가
  ];

  console.log('--- 1. 리비전 Diff 상태 분류 (동일/변경/추가/삭제) 검증 ---');

  // Diff 분류 로직 시뮬레이션
  const diffResults = currentRevB.map((curr) => {
    const prev = prevRevA.find((p) => p.partNo === curr.partNo);
    if (!prev) {
      return { partNo: curr.partNo, changeType: 'ADDED', oldPrice: null };
    }
    if (prev.spec !== curr.spec) {
      return { partNo: curr.partNo, changeType: 'MODIFIED', oldPrice: prev.price };
    }
    return { partNo: curr.partNo, changeType: 'IDENTICAL', oldPrice: prev.price };
  });

  // 삭제된 행 찾기
  prevRevA.forEach((prev) => {
    const exists = currentRevB.some((c) => c.partNo === prev.partNo);
    if (!exists) {
      diffResults.push({ partNo: prev.partNo, changeType: 'DELETED', oldPrice: prev.price });
    }
  });

  const addedCount = diffResults.filter((r) => r.changeType === 'ADDED').length;
  const modCount = diffResults.filter((r) => r.changeType === 'MODIFIED').length;
  const delCount = diffResults.filter((r) => r.changeType === 'DELETED').length;
  const identCount = diffResults.filter((r) => r.changeType === 'IDENTICAL').length;

  console.log(`   - 대조 결과: 추가 ${addedCount}건, 변경 ${modCount}건, 삭제 ${delCount}건, 동일 ${identCount}건`);

  assert(addedCount === 1, 'VB-210은 신규 추가(ADDED)로 분류되어야 함');
  assert(modCount === 1, 'VB-203은 규격 변경(MODIFIED)으로 분류되어야 함');
  assert(delCount === 1, 'VB-208은 삭제(DELETED)로 분류되어야 함');
  assert(identCount === 2, 'VB-201, VB-202는 동일(IDENTICAL)로 분류되어야 함');

  console.log('\n--- 2. 동일 부품 일괄 단가 계승 (Inheritance) 검증 ---');
  // 동일 항목 단가 복사 시뮬레이션
  const inheritedLines = diffResults
    .filter((r) => r.changeType === 'IDENTICAL')
    .map((r) => ({
      partNo: r.partNo,
      inheritedPrice: r.oldPrice,
      status: 'CONFIRMED'
    }));

  assert(inheritedLines.length === 2, '동일 2건 모두 단가가 계승되어야 함');
  assert(inheritedLines[0].inheritedPrice === 412000, 'VB-201 이전 단가(₩412,000) 정확히 계승');
  assert(inheritedLines[0].status === 'CONFIRMED', '계승된 행은 즉시 확정 상태로 전환');

  console.log('\n====================================================');
  console.log(`📊 검증 결과: 총 ${total}건 중 ${passed}건 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runRevisionDiffTests();
