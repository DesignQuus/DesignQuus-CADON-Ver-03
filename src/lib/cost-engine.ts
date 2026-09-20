/**
 * CADON 가공 피처 및 공정별 제조원가 산출 엔진 (Cost Calculation Engine)
 */

export interface MaterialProperty {
  code: string;
  name: string;
  density: number; // g/cm3
  unitPricePerKg: number; // 원/kg
}

export const STANDARD_MATERIALS: Record<string, MaterialProperty> = {
  SS400: { code: 'SS400', name: '일반 구조용 탄소강 (SS400/SS275)', density: 7.85, unitPricePerKg: 1350 },
  SUS304: { code: 'SUS304', name: '스테인리스강 (SUS304/STS304)', density: 7.93, unitPricePerKg: 4800 },
  SUS316: { code: 'SUS316', name: '내식성 스테인리스 (SUS316)', density: 7.98, unitPricePerKg: 6500 },
  AL6061: { code: 'AL6061', name: '알루미늄 합금 (AL6061-T6)', density: 2.70, unitPricePerKg: 5500 },
  AL5052: { code: 'AL5052', name: '알루미늄 판재 (AL5052)', density: 2.68, unitPricePerKg: 5200 },
  SM45C: { code: 'SM45C', name: '기계구조용 탄소강 (S45C/SM45C)', density: 7.85, unitPricePerKg: 1650 },
  SPCC: { code: 'SPCC', name: '냉간압연강판 (SPCC/CR)', density: 7.85, unitPricePerKg: 1450 },
  SECC: { code: 'SECC', name: '전기아연도금강판 (EGI/SECC)', density: 7.85, unitPricePerKg: 1550 },
};

export interface FabricationFeatureInput {
  processType: 'SHEET_METAL' | 'MACHINING' | 'PIPE' | 'STRUCTURE';
  materialCode: string;
  bboxWidth: number; // mm
  bboxLength: number; // mm
  bboxThickness: number; // mm
  cuttingLengthTotal?: number; // mm
  pierceCount?: number;
  bendingCount?: number;
  throughHoleCount?: number;
  tapHoleCount?: number;
  heatTreatment?: string;
  surfaceTreatment?: string;
  bendRatePerStroke?: number; // 회당 절곡 단가 (기본값: 800원, process_rates 연동)
  laserRatePerMeter?: number; // m당 레이저 절단 단가
  markupRate?: number; // 0.15 for 15%
}

export interface FabricationCostResult {
  partWeightKg: number;
  materialCost: number;
  laserCuttingCost: number;
  bendingCost: number;
  tappingCost: number;
  machiningCost: number;
  surfaceFinishCost: number;
  subtotalCost: number;
  markupRate: number;
  markupAmount: number;
  finalUnitPrice: number;
  formulaDetails: Record<string, any>;
}

/**
 * 재질 코드를 표준 코드로 매핑
 */
export function resolveMaterial(rawMaterial?: string): MaterialProperty {
  if (!rawMaterial) return STANDARD_MATERIALS.SS400;
  const upper = rawMaterial.toUpperCase().trim();

  if (upper.includes('SUS304') || upper.includes('STS304')) return STANDARD_MATERIALS.SUS304;
  if (upper.includes('SUS316') || upper.includes('STS316')) return STANDARD_MATERIALS.SUS316;
  if (upper.includes('6061')) return STANDARD_MATERIALS.AL6061;
  if (upper.includes('5052')) return STANDARD_MATERIALS.AL5052;
  if (upper.includes('AL') || upper.includes('알루미늄')) return STANDARD_MATERIALS.AL6061;
  if (upper.includes('S45C') || upper.includes('SM45C')) return STANDARD_MATERIALS.SM45C;
  if (upper.includes('SPCC') || upper.includes('CR')) return STANDARD_MATERIALS.SPCC;
  if (upper.includes('EGI') || upper.includes('SECC')) return STANDARD_MATERIALS.SECC;
  if (upper.includes('SUS') || upper.includes('STS') || upper.includes('스텐')) return STANDARD_MATERIALS.SUS304;
  
  return STANDARD_MATERIALS.SS400;
}

/**
 * 부품별 가공 피처로부터 공정별 제조원가를 정밀 산출
 */
export function calculateFabricationCost(input: FabricationFeatureInput): FabricationCostResult {
  const mat = resolveMaterial(input.materialCode);
  const w = Math.max(input.bboxWidth || 100, 10);
  const l = Math.max(input.bboxLength || 100, 10);
  const t = Math.max(input.bboxThickness || 2, 0.5);

  // 1. 단품 중량 계산: 체적(cm3) * 비중(g/cm3) / 1000 = kg
  // (w * l * t 는 mm3 -> / 1000 하여 cm3)
  const volumeCm3 = (w * l * t) / 1000;
  const rawWeightKg = Number(((volumeCm3 * mat.density) / 1000).toFixed(3));
  const partWeightKg = Math.max(rawWeightKg, 0.01);

  // 2. 재료비 (스크랩 마진 8% 가산)
  const scrapFactor = 1.08;
  const materialCost = Math.round(partWeightKg * mat.unitPricePerKg * scrapFactor);

  // 3. 레이저 절단비
  // 절단길이가 없으면 외곽 둘레(2*(w+l)) + 여유 20%로 추정
  const cuttingLength = input.cuttingLengthTotal && input.cuttingLengthTotal > 0
    ? input.cuttingLengthTotal
    : Math.round(2 * (w + l) * 1.2);
  const pierceCount = input.pierceCount ?? (input.throughHoleCount || 0) + 1;

  // 두께별 m당 절단 가공 단가 (SUS/AL은 배율 적용)
  let baseCutRatePerMeter = 600;
  if (t <= 2) baseCutRatePerMeter = 600;
  else if (t <= 4) baseCutRatePerMeter = 900;
  else if (t <= 6) baseCutRatePerMeter = 1400;
  else if (t <= 10) baseCutRatePerMeter = 2200;
  else baseCutRatePerMeter = 3500;

  if (mat.code.startsWith('SUS')) baseCutRatePerMeter *= 1.6;
  if (mat.code.startsWith('AL')) baseCutRatePerMeter *= 1.4;

  const cutCost = Math.round((cuttingLength / 1000) * baseCutRatePerMeter);
  const pierceCost = pierceCount * 50; // 피어싱당 50원
  const laserCuttingCost = Math.max(cutCost + pierceCost, 1000); // 기본 셋업비 1,000원

  // 4. 절곡비 (process_rates 기본 800원/회 기준)
  const bendCount = input.bendingCount || 0;
  const bendUnitRate = input.bendRatePerStroke ?? 800;
  const bendingCost = bendCount * bendUnitRate;

  // 5. 탭/홀 가공비 (탭 개당 1,500원, 홀 개당 300원)
  const tapCount = input.tapHoleCount || 0;
  const holeCount = input.throughHoleCount || 0;
  const tappingCost = (tapCount * 1500) + (holeCount * 300);

  // 6. 기계 절삭 가공비 (MACHINING 공정일 경우)
  let machiningCost = 0;
  if (input.processType === 'MACHINING') {
    machiningCost = Math.round(partWeightKg * 4000 + 15000); // 기본 셋업 + 절삭단가
  }

  // 7. 표면처리/후처리비
  let surfaceFinishCost = 0;
  const treatment = (input.surfaceTreatment || '').toLowerCase();
  if (treatment.includes('아연') || treatment.includes('도금') || treatment.includes('zinc')) {
    surfaceFinishCost = Math.max(Math.round(partWeightKg * 900), 1000); // kg당 900원 (최소 1,000원)
  } else if (treatment.includes('아노다이징') || treatment.includes('anodiz')) {
    surfaceFinishCost = Math.max(Math.round(partWeightKg * 2500), 2000);
  } else if (treatment.includes('도장') || treatment.includes('paint') || treatment.includes('분체')) {
    // 표면적(m2) 환산: 2 * (w*l)/1,000,000 m2
    const areaM2 = (2 * (w * l)) / 1000000;
    surfaceFinishCost = Math.max(Math.round(areaM2 * 8000), 1500); // m2당 8,000원
  } else if (input.heatTreatment && input.heatTreatment !== 'None') {
    surfaceFinishCost = Math.max(Math.round(partWeightKg * 1200), 2500); // 열처리 kg당 1,200원
  }

  // 8. 합계 및 마진율 적용
  const subtotalCost = materialCost + laserCuttingCost + bendingCost + tappingCost + machiningCost + surfaceFinishCost;
  const markupRate = input.markupRate ?? 0.15; // 기본 15% 마크업
  const markupAmount = Math.round(subtotalCost * markupRate);
  const rawUnitPrice = subtotalCost + markupAmount;
  // 100원 단위 절상
  const finalUnitPrice = Math.ceil(rawUnitPrice / 100) * 100;

  return {
    partWeightKg,
    materialCost,
    laserCuttingCost,
    bendingCost,
    tappingCost,
    machiningCost,
    surfaceFinishCost,
    subtotalCost,
    markupRate,
    markupAmount,
    finalUnitPrice,
    formulaDetails: {
      materialName: mat.name,
      materialDensity: mat.density,
      materialUnitPrice: mat.unitPricePerKg,
      blankDimensions: `${w} x ${l} x ${t} mm`,
      cuttingLengthMm: cuttingLength,
      pierceCount,
      bendingCount: bendCount,
      bendingUnitRate: bendUnitRate,
      bendingRateSource: input.bendRatePerStroke ? 'PROCESS_RATES_CUSTOM' : 'PROCESS_RATES_DEFAULT (800)',
      tapCount,
      holeCount,
      surfaceTreatment: input.surfaceTreatment || 'None'
    }
  };
}
