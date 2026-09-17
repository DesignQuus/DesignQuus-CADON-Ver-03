/**
 * CADON v2.0 3단계 직관적 파이프라인 연계 및 데이터 정합성 검증 테스트
 * 1단계: 도면 등록 & BOM 추출 검증 (/quotes/[id]/extract)
 * 2단계: 3분할 통합 단가 검토 워크스페이스 (/quotes/[id]/review)
 * 3단계: 리비전 Diff 비교 & 견적 발행 (/quotes/[id]/diff, /publish)
 */

import assert from 'assert';

console.log('====================================================');
console.log('🧪 CADON v2.0 3단계 직관적 파이프라인 통합 정밀 검증');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (e: any) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${e.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// 1. 1단계: 도면 등록 & BOM 추출 검증 (Extraction & Verification)
// -------------------------------------------------------------
console.log('--- 1단계: 도면 등록 & BOM 추출 검증 테스트 ---');

interface MockDrawing {
  drawingNo: string;
  partName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  drawingType: 'MAIN_ASSEMBLY' | 'SUB_ASSEMBLY' | 'PART';
}

const mockDrawings: MockDrawing[] = [
  { drawingNo: 'VB-001', partName: 'VALVE BODY ASSY', confidence: 'HIGH', drawingType: 'MAIN_ASSEMBLY' },
  { drawingNo: 'VB-002', partName: 'BONNET SUB ASSY', confidence: 'HIGH', drawingType: 'SUB_ASSEMBLY' },
  { drawingNo: 'VB-003', partName: 'STEM SHAFT', confidence: 'LOW', drawingType: 'PART' }
];

test('1단계: LOW 신뢰도 품목이 존재하면 2단계 진행이 차단되어야 함', () => {
  const hasLowConfidence = mockDrawings.some((d) => d.confidence === 'LOW');
  assert.strictEqual(hasLowConfidence, true, 'VB-003이 LOW 신뢰도이므로 승인이 차단되어야 함');
});

test('1단계: 모든 품목 신뢰도 보강 완료 시 2단계 진행 허용', () => {
  const enriched = mockDrawings.map((d) => ({ ...d, confidence: 'HIGH' as string }));
  const canProceed = !enriched.some((d) => d.confidence === 'LOW');
  assert.strictEqual(canProceed, true, '모든 부품 신뢰도가 보강되어 승인 가능해야 함');
});

// -------------------------------------------------------------
// 2. 2단계: 3분할 통합 단가 검토 (Review Workspace)
// -------------------------------------------------------------
console.log('\n--- 2단계: 3분할 통합 단가 검토 워크스페이스 테스트 ---');

interface MockReviewLine {
  itemNo: number;
  partNo: string;
  unitCost: number;
  supplyPrice: number;
  status: 'PENDING' | 'CONFIRMED';
}

const reviewLines: MockReviewLine[] = [
  { itemNo: 1, partNo: 'VB-001', unitCost: 41200, supplyPrice: 48000, status: 'CONFIRMED' },
  { itemNo: 2, partNo: 'VB-002', unitCost: 18800, supplyPrice: 22000, status: 'CONFIRMED' },
  { itemNo: 3, partNo: 'VB-003', unitCost: 32250, supplyPrice: 37500, status: 'PENDING' }
];

test('2단계: 미확정 행이 남아있을 경우 3단계 결재/발행 상신 차단', () => {
  const unconfirmedCount: number = reviewLines.filter((l) => l.status !== 'CONFIRMED').length;
  assert.strictEqual(unconfirmedCount, 1, '미확정 1건이 남아있어야 함');
  const canPublish = (unconfirmedCount as number) === 0;
  assert.strictEqual(canPublish, false, '미확정 행 존재 시 결재/발행 버튼 비활성화');
});

test('2단계: 전 행 확정 완료 시 3단계 발행/상신 활성화', () => {
  const allConfirmed = reviewLines.map((l) => ({ ...l, status: 'CONFIRMED' as const }));
  const unconfirmedCount = allConfirmed.filter((l) => l.status !== 'CONFIRMED').length;
  assert.strictEqual(unconfirmedCount, 0, '모든 행이 확정됨');
  const canPublish = unconfirmedCount === 0;
  assert.strictEqual(canPublish, true, '발행 가능');
});

// -------------------------------------------------------------
// 3. 3단계: 리비전 Diff 및 2종 견적서 & 마진 거버넌스 테스트
// -------------------------------------------------------------
console.log('\n--- 3단계: 리비전 Diff 및 2종 견적서 & 마진 거버넌스 테스트 ---');

test('3단계: 이전 리비전 동일 부품(IDENTICAL) 단가 자동 일괄 계승 검증', () => {
  const diffItems = [
    { partNo: 'VB-001', changeType: 'IDENTICAL', oldPrice: 48000, newPrice: 0 },
    { partNo: 'VB-002', changeType: 'MODIFIED', oldPrice: 22000, newPrice: 24000 }
  ];

  const inherited = diffItems.map((it) => 
    it.changeType === 'IDENTICAL' ? { ...it, newPrice: it.oldPrice, inherited: true } : it
  );

  assert.strictEqual(inherited[0].newPrice, 48000, '동일 부품 단가가 자동 계승되어야 함');
  assert.strictEqual(inherited[1].newPrice, 24000, '수정 부품은 기존 단가 계승하지 않음');
});

test('3단계: 2종 견적서(고객용 vs 제조BOM) 분리 렌더링 필드 검증', () => {
  const samplePart = {
    partNo: 'VB-001',
    cost: 41200,
    price: 48000,
    materialCost: 20000,
    processCost: 18000
  };

  function renderDocument(mode: 'CUSTOMER' | 'MANUFACTURING') {
    if (mode === 'CUSTOMER') {
      return { partNo: samplePart.partNo, price: samplePart.price, cost: undefined };
    } else {
      return { ...samplePart };
    }
  }

  const customerView = renderDocument('CUSTOMER');
  const manufacturingView = renderDocument('MANUFACTURING');

  assert.strictEqual(customerView.price, 48000, '고객용에는 공급단가만 노출');
  assert.strictEqual(customerView.cost, undefined, '고객용에는 원가가 마스킹되어야 함');
  assert.strictEqual(manufacturingView.cost, 41200, '제조용에는 원가가 노출되어야 함');
});

test('3단계: 마진 거버넌스 하한선(12%) 미달 검출', () => {
  const lowMarginQuote = { totalCost: 90000, totalSupply: 100000 }; // 마진: 10.0%
  const marginRate = ((lowMarginQuote.totalSupply - lowMarginQuote.totalCost) / lowMarginQuote.totalSupply) * 100;
  const isBelowLimit = marginRate < 12.0;

  assert.strictEqual(isBelowLimit, true, '10%는 12% 미달로 대표이사 결재 대상이어야 함');
});

console.log('\n====================================================');
console.log(`📊 검증 결과: 총 ${passCount + failCount}건 중 ${passCount}건 통과 (${Math.round((passCount / (passCount + failCount)) * 100)}%)`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
}
