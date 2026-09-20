/**
 * rate-regression.ts
 * 담당자가 확정한 부품 단가와 107건의 기하 피처(절단길이, 절곡수, 중량 등)를 결합하여
 * 실제 공장 가공 임률 계수(절단단가, 절곡단가, 기계임률)를 통계적으로 역산하는 OLS(최소자승법) 엔진
 */

export interface PartRegressionSample {
  id: string;
  partName: string;
  processType: 'SHEET_METAL' | 'MACHINING';
  materialCode: string;
  materialCost: number;        // 재료비
  confirmedPrice: number;      // 담당자 확정 완성단가
  cuttingLengthMeter: number;  // 절단길이 (m)
  bendingCount: number;        // 절곡횟수 (회)
  weightKg: number;            // 중량 (kg)
}

export interface RegressionRateResult {
  processType: 'SHEET_METAL' | 'MACHINING';
  sampleCount: number;
  rSquared: number;            // 결정계수 (설명력 0~1)
  estimatedRates: {
    laserRatePerMeter?: number;    // m당 절단단가 (원/m)
    bendRatePerStroke?: number;    // 회당 절곡단가 (원/회)
    machineRatePerHour?: number;   // 시간당 가공임률 (원/h)
    baseSetupCost?: number;        // 기본 셋업비 (원)
  };
  details: string;
}

/**
 * 가우스-요르단 소거법을 사용한 작은 정방 행렬 역행렬 계산 (3x3 ~ 5x5 지원)
 */
function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  // 증강 행렬 [A | I] 생성
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    aug[i] = [];
    for (let j = 0; j < n; j++) {
      aug[i][j] = matrix[i][j];
    }
    for (let j = 0; j < n; j++) {
      aug[i][n + j] = i === j ? 1 : 0;
    }
  }

  for (let i = 0; i < n; i++) {
    // 피벗 선택
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(aug[maxRow][i]) < 1e-12) {
      return null; // 특이 행렬
    }

    // 행 교환
    const temp = aug[i];
    aug[i] = aug[maxRow];
    aug[maxRow] = temp;

    // 피벗 행 정규화
    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }

    // 다른 행 소거
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }
  }

  // 역행렬 추출
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    inv[i] = [];
    for (let j = 0; j < n; j++) {
      inv[i][j] = aug[i][n + j];
    }
  }
  return inv;
}

/**
 * 다중 선형 회귀 OLS: beta = (X^T * X)^(-1) * X^T * y
 */
export function solveOLS(X: number[][], y: number[]): { beta: number[]; rSquared: number } | null {
  const m = X.length; // 표본 수
  if (m === 0) return null;
  const p = X[0].length; // 변수 수
  if (m <= p) return null; // 표본 부족

  // X^T 계산 (p x m)
  const Xt: number[][] = [];
  for (let j = 0; j < p; j++) {
    Xt[j] = [];
    for (let i = 0; i < m; i++) {
      Xt[j][i] = X[i][j];
    }
  }

  // XtX = X^T * X (p x p)
  const XtX: number[][] = [];
  for (let i = 0; i < p; i++) {
    XtX[i] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += Xt[i][k] * X[k][j];
      }
      XtX[i][j] = sum;
    }
  }

  // (X^T * X)^(-1)
  const invXtX = invertMatrix(XtX);
  if (!invXtX) return null;

  // Xty = X^T * y (p x 1)
  const Xty: number[] = [];
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += Xt[i][k] * y[k];
    }
    Xty[i] = sum;
  }

  // beta = invXtX * Xty (p x 1)
  const beta: number[] = [];
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let j = 0; j < p; j++) {
      sum += invXtX[i][j] * Xty[j];
    }
    beta[i] = sum;
  }

  // 결정계수 R^2 계산
  const yMean = y.reduce((acc, v) => acc + v, 0) / m;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < m; i++) {
    let yPred = 0;
    for (let j = 0; j < p; j++) {
      yPred += X[i][j] * beta[j];
    }
    ssTot += Math.pow(y[i] - yMean, 2);
    ssRes += Math.pow(y[i] - yPred, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 1;

  return { beta, rSquared: Number(rSquared.toFixed(4)) };
}

/**
 * 판금/제관(SHEET_METAL) 품목 회귀분석
 * 모델: (확정단가 - 재료비) = beta_0(셋업비) + beta_cut * 절단길이(m) + beta_bend * 절곡수
 */
export function estimateSheetMetalRates(samples: PartRegressionSample[]): RegressionRateResult {
  const sheetSamples = samples.filter((s) => s.processType === 'SHEET_METAL' && s.confirmedPrice > 0);

  if (sheetSamples.length < 5) {
    return {
      processType: 'SHEET_METAL',
      sampleCount: sheetSamples.length,
      rSquared: 0,
      estimatedRates: {
        laserRatePerMeter: 1800,
        bendRatePerStroke: 800,
        baseSetupCost: 3000
      },
      details: `표본 수(${sheetSamples.length}건)가 부족하여 기본 추정치(절단 1,800원, 절곡 800원)를 유지합니다. (최소 5건 이상 필요)`
    };
  }

  const X: number[][] = [];
  const y: number[] = [];

  for (const s of sheetSamples) {
    // 가공비 = 확정단가 - 재료비
    const processCost = Math.max(s.confirmedPrice - s.materialCost, 1000);
    // 피처: [상수항 1, 절단길이(m), 절곡수]
    X.push([1, s.cuttingLengthMeter, s.bendingCount]);
    y.push(processCost);
  }

  const res = solveOLS(X, y);
  if (!res) {
    return {
      processType: 'SHEET_METAL',
      sampleCount: sheetSamples.length,
      rSquared: 0,
      estimatedRates: { laserRatePerMeter: 1800, bendRatePerStroke: 800, baseSetupCost: 3000 },
      details: '특이 행렬(피처 간 완전 다중공선성)로 인해 표준값을 유지합니다.'
    };
  }

  const [b0, bCut, bBend] = res.beta;

  // 현실적인 공학 범위 제약 (상한/하한 클램핑)
  const safeSetup = Math.max(Math.round(b0), 1000);
  const safeCut = Math.max(Math.min(Math.round(bCut), 5000), 1000);
  const safeBend = Math.max(Math.min(Math.round(bBend), 2500), 500);

  return {
    processType: 'SHEET_METAL',
    sampleCount: sheetSamples.length,
    rSquared: res.rSquared,
    estimatedRates: {
      baseSetupCost: safeSetup,
      laserRatePerMeter: safeCut,
      bendRatePerStroke: safeBend
    },
    details: `표본 ${sheetSamples.length}건 회귀분석 완료 (설명력 R² = ${(res.rSquared * 100).toFixed(1)}%).`
  };
}

/**
 * 기계가공(MACHINING) 품목 회귀분석
 * 모델: (확정단가 - 재료비) = beta_0(셋업비) + beta_weight * 중량(kg) -> 시간당 임률 환산
 */
export function estimateMachiningRates(samples: PartRegressionSample[]): RegressionRateResult {
  const machSamples = samples.filter((s) => s.processType === 'MACHINING' && s.confirmedPrice > 0);

  if (machSamples.length < 5) {
    return {
      processType: 'MACHINING',
      sampleCount: machSamples.length,
      rSquared: 0,
      estimatedRates: {
        machineRatePerHour: 45000,
        baseSetupCost: 30000
      },
      details: `표본 수(${machSamples.length}건)가 부족하여 기본 추정치(시간당 45,000원)를 유지합니다.`
    };
  }

  const X: number[][] = [];
  const y: number[] = [];

  for (const s of machSamples) {
    const processCost = Math.max(s.confirmedPrice - s.materialCost, 5000);
    // 피처: [상수항 1, 가공중량(kg)]
    X.push([1, s.weightKg]);
    y.push(processCost);
  }

  const res = solveOLS(X, y);
  if (!res) {
    return {
      processType: 'MACHINING',
      sampleCount: machSamples.length,
      rSquared: 0,
      estimatedRates: { machineRatePerHour: 45000, baseSetupCost: 30000 },
      details: '표본 분석 불가로 표준값을 유지합니다.'
    };
  }

  const [b0, bWeight] = res.beta;
  // 중량 1kg당 통상 0.4시간 소요 가정 시 시간당 임률 역산
  const impliedHourlyRate = Math.round((bWeight / 0.4) / 1000) * 1000;
  const safeHourlyRate = Math.max(Math.min(impliedHourlyRate, 80000), 30000);
  const safeSetup = Math.max(Math.min(Math.round(b0), 60000), 15000);

  return {
    processType: 'MACHINING',
    sampleCount: machSamples.length,
    rSquared: res.rSquared,
    estimatedRates: {
      baseSetupCost: safeSetup,
      machineRatePerHour: safeHourlyRate
    },
    details: `표본 ${machSamples.length}건 회귀분석 완료 (설명력 R² = ${(res.rSquared * 100).toFixed(1)}%).`
  };
}

/**
 * 단일 부품 목표 단가 역산기 (Reverse Rate for Target Price)
 * "이 부품을 30,000원에 맞추려면 절곡 또는 절단 임률을 얼마로 변경해야 하는가?"
 */
export function reverseEstimateTargetPrice(params: {
  processType: 'SHEET_METAL' | 'MACHINING';
  targetPrice: number;
  materialCost: number;
  cuttingLengthMeter: number;
  bendingCount: number;
  weightKg: number;
  currentRates: {
    laserRatePerMeter: number;
    bendRatePerStroke: number;
    machineRatePerHour: number;
  };
}) {
  const {
    processType,
    targetPrice,
    materialCost,
    cuttingLengthMeter,
    bendingCount,
    currentRates
  } = params;

  // 목표 가공비 = (목표단가 / 마크업1.15) - 재료비
  const targetSubtotal = Math.round(targetPrice / 1.15);
  const targetProcessCost = Math.max(targetSubtotal - materialCost, 1000);

  if (processType === 'SHEET_METAL') {
    // 1) 절단단가 고정 시 필요한 절곡단가 역산
    // targetProcessCost = (cutLen * cutRate) + (bendCount * bendRate) + 1000
    const fixedCutCost = Math.round(cuttingLengthMeter * currentRates.laserRatePerMeter);
    const neededBendCost = targetProcessCost - fixedCutCost - 1000;
    const recommendedBendRate = bendingCount > 0 
      ? Math.max(Math.round(neededBendCost / bendingCount), 400)
      : currentRates.bendRatePerStroke;

    // 2) 절곡단가 고정 시 필요한 절단단가 역산
    const fixedBendCost = bendingCount * currentRates.bendRatePerStroke;
    const neededCutCost = targetProcessCost - fixedBendCost - 1000;
    const recommendedCutRate = cuttingLengthMeter > 0 
      ? Math.max(Math.round(neededCutCost / cuttingLengthMeter), 800)
      : currentRates.laserRatePerMeter;

    return {
      targetProcessCost,
      recommendedBendRate,
      recommendedCutRate,
      guidance: bendingCount > 0
        ? `절단단가 유지 시 절곡단가를 ${currentRates.bendRatePerStroke.toLocaleString()}원 → ${recommendedBendRate.toLocaleString()}원/회(으)로 조정, 또는 절곡 유지 시 절단단가를 ${currentRates.laserRatePerMeter.toLocaleString()}원 → ${recommendedCutRate.toLocaleString()}원/m(으)로 조정하면 목표단가에 근접합니다.`
        : `평판 품목이므로 절단단가를 ${currentRates.laserRatePerMeter.toLocaleString()}원 → ${recommendedCutRate.toLocaleString()}원/m(으)로 조정하면 목표단가에 근접합니다.`
    };
  } else {
    // 기계가공: 시간당 임률 역산
    // targetProcessCost = setup(30000) + hours * machineRate
    const estimatedHours = params.weightKg > 1.0 ? 0.46 : (params.weightKg > 0.5 ? 0.43 : 0.40);
    const neededMachining = Math.max(targetProcessCost - 15000, 5000);
    const recommendedMachineRate = Math.round((neededMachining / estimatedHours) / 1000) * 1000;

    return {
      targetProcessCost,
      recommendedMachineRate: Math.max(recommendedMachineRate, 25000),
      guidance: `가공 소요시간(~${estimatedHours}h) 기준, 시간당 임률을 ${currentRates.machineRatePerHour.toLocaleString()}원 → ${recommendedMachineRate.toLocaleString()}원/h(으)로 조정하면 목표단가에 근접합니다.`
    };
  }
}
