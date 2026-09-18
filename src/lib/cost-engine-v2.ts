/**
 * CADON v2.0 다변화 제조원가 산출 엔진 (주조품 / 기계가공품 / 구매품)
 * 파일당 코드 줄수를 컴팩트하게 유지하기 위해 단일 책임 원칙으로 구성
 */

export type PartType =
  | 'MACHINING'
  | 'SHEET_METAL'
  | 'CASTING'
  | 'COMMERCIAL'
  | 'ELECTRICAL'
  | 'ASSEMBLY'
  | 'UNCLASSIFIED';

export interface PriceBasisRecord {
  basisType:
    | 'CASTING_MODEL'
    | 'MACHINING_MODEL'
    | 'SHEET_METAL_MODEL'
    | 'COMMERCIAL_CATALOG'
    | 'ELECTRICAL_CATALOG'
    | 'ASSEMBLY_ROLLUP'
    | 'MANUAL';
  calcFormulaJson: Record<string, any>;
  materialBaseDate: string;
  calculatedAt: string;
}

export interface CostCalculationResult {
  partType: PartType;
  materialCost: number;
  processCost: number;
  treatmentCost: number;
  subtotalCost: number;
  marginRate: number;
  marginAmount: number;
  unitPrice: number;
  totalPrice: number;
  qtyTier: string;
  basis: PriceBasisRecord;
}

/** 주조품 원가 입력 파라미터 */
export interface CastingCostInput {
  netWeightKg: number;           // 제품 순중량 (kg)
  yieldRate?: number;            // 회수율/수율 (기본 0.65 = 65%)
  materialKgRate: number;        // 재질 kg당 단가 (SCS13, GCD 등)
  scrapCreditPerKg?: number;     // 회수 스크랩 kg당 단가 (기본 0)
  moldCost?: number;             // 신규 목형비 (기존 보유 시 0)
  moldAmortizationQty?: number;  // 목형 상각 수량 (기본 20)
  castingProcessRatePerKg?: number; // 주조 공정 kg단가 (조형/용해/주입/탈사 등 기본 2,500원)
  heatTreatmentCost?: number;    // 열처리비 (kg당 또는 건당)
  postMachiningCost?: number;    // 후가공비 (CNC선반, 머시닝 등)
  defectReserveRate?: number;    // 불량 예비율 (기본 0.05 = 5%)
  quantity: number;              // 발주/견적 요청 수량
  marginRate?: number;           // 마진율 (기본 0.18 = 18%)
  materialBaseDate?: string;     // 원자재 시세 기준일
}

/** 기계가공품 원가 입력 파라미터 */
export interface MachiningCostInput {
  rawWeightKg: number;           // 소재 규격 중량 (봉재/판재)
  materialKgRate: number;        // 소재 kg당 단가 (SS400, SUS316 등)
  machiningHours: number;        // 가공 예상 공수 (시간)
  hourlyMachineRate?: number;    // 가공 시간당 단가 (기본 45,000원)
  setupBaseCost?: number;        // 기계 세팅/프로그래밍 준비 셋업 기본료 (기본 30,000원)
  surfaceTreatmentCost?: number; // 도금/도장/연마 등 후처리비
  treatmentMinLotCost?: number;  // 표면처리 외주 최소 로트 기본료 (기본 30,000원)
  packagingShippingRate?: number;// 포장 및 출하 운송비율 (기본 0.03 = 3%)
  quantity: number;
  marginRate?: number;
  materialBaseDate?: string;
}

/** 구매품 원가 입력 파라미터 */
export interface CommercialCostInput {
  catalogUnitPrice: number;      // 카탈로그/표준 단가
  overheadRate?: number;         // 구매 관리비율 (기본 0.05 = 5%)
  quantity: number;
  marginRate?: number;           // 기본 0.12 = 12%
}

/** 수량에 따른 수량 구간 판별 */
export function getQtyTier(qty: number): string {
  if (qty <= 9) return '1~9';
  if (qty <= 99) return '10~99';
  return '100~';
}

/** 수량 구간별 단가 할인 계수 */
export function getQtyTierFactor(tier: string): number {
  switch (tier) {
    case '1~9': return 1.05;   // 소량 가산 +5%
    case '10~99': return 1.0;  // 표준
    case '100~': return 0.93;  // 대량 할인 -7%
    default: return 1.0;
  }
}

/**
 * 1. 주조품 원가 계산 (Casting Cost Calculation)
 */
export function calculateCastingCost(input: CastingCostInput): CostCalculationResult {
  const qty = Math.max(input.quantity, 1);
  const tier = getQtyTier(qty);
  const yieldRate = input.yieldRate ?? 0.65;
  const pourWeightKg = Number((input.netWeightKg / yieldRate).toFixed(2)); // 주입 중량

  // 재료비 = 주입중량 * kg단가 - 발생 스크랩 환급액
  const scrapReturn = (pourWeightKg - input.netWeightKg) * (input.scrapCreditPerKg || 0);
  const rawMatCost = (pourWeightKg * input.materialKgRate) - scrapReturn;
  const materialCost = Math.round(rawMatCost);

  // 목형비 상각 (개당)
  const moldCost = input.moldCost || 0;
  const moldAmortQty = Math.max(input.moldAmortizationQty || 20, 1);
  const unitMoldCost = Math.round(moldCost / moldAmortQty);

  // 주조 공정비 + 열처리비 + 후가공비
  const castRate = input.castingProcessRatePerKg ?? 2500;
  const baseCastingCost = Math.round(input.netWeightKg * castRate);
  const heatCost = Math.round(input.heatTreatmentCost || 0);
  const postMachining = Math.round(input.postMachiningCost || 0);
  const processCost = baseCastingCost + postMachining + unitMoldCost;
  const treatmentCost = heatCost;

  // 불량 예비율 가산
  const defectRate = input.defectReserveRate ?? 0.05;
  const subtotalBeforeDefect = materialCost + processCost + treatmentCost;
  const subtotalCost = Math.round(subtotalBeforeDefect * (1 + defectRate));

  // 마진 및 수량구간 계수 적용
  const marginRate = input.marginRate ?? 0.18;
  const tierFactor = getQtyTierFactor(tier);
  const unitCostWithTier = Math.round(subtotalCost * tierFactor);
  const marginAmount = Math.round(unitCostWithTier * marginRate);
  const unitPrice = Math.ceil((unitCostWithTier + marginAmount) / 100) * 100; // 100원 단위 절상

  return {
    partType: 'CASTING',
    materialCost,
    processCost,
    treatmentCost,
    subtotalCost,
    marginRate,
    marginAmount,
    unitPrice,
    totalPrice: unitPrice * qty,
    qtyTier: tier,
    basis: {
      basisType: 'CASTING_MODEL',
      materialBaseDate: input.materialBaseDate || new Date().toISOString().substring(0, 10),
      calculatedAt: new Date().toISOString(),
      calcFormulaJson: {
        netWeightKg: input.netWeightKg,
        yieldRate,
        pourWeightKg,
        unitMoldCost,
        baseCastingCost,
        postMachining,
        heatCost,
        defectRate,
        tierFactor
      }
    }
  };
}

/**
 * 2. 기계가공품 원가 계산 (Machining Cost Calculation)
 */
export function calculateMachiningCost(input: MachiningCostInput): CostCalculationResult {
  const qty = Math.max(input.quantity, 1);
  const tier = getQtyTier(qty);
  const materialCost = Math.round(input.rawWeightKg * input.materialKgRate);
  
  const hourlyRate = input.hourlyMachineRate ?? 45000;
  // 소량 발주 시 기계 셋업(준비) 공수 상각 반영 (수량 분할)
  const setupBase = input.setupBaseCost ?? 30000;
  const unitSetupCost = Math.round(setupBase / qty);
  const directMachiningCost = Math.round(input.machiningHours * hourlyRate);
  const processCost = directMachiningCost + unitSetupCost;

  // 표면처리비 (외주 최소 로트 기본료 방어)
  let treatmentCost = Math.round(input.surfaceTreatmentCost || 0);
  if (treatmentCost > 0 && input.treatmentMinLotCost) {
    const minUnitLot = Math.round(input.treatmentMinLotCost / qty);
    if (treatmentCost < minUnitLot) treatmentCost = minUnitLot;
  }

  // 포장 및 물류 운반비 (3%)
  const packagingRate = input.packagingShippingRate ?? 0.03;
  const packagingCost = Math.round((materialCost + processCost + treatmentCost) * packagingRate);

  const subtotalCost = materialCost + processCost + treatmentCost + packagingCost;
  const marginRate = input.marginRate ?? 0.15;
  const tierFactor = getQtyTierFactor(tier);
  const unitCostWithTier = Math.round(subtotalCost * tierFactor);
  const marginAmount = Math.round(unitCostWithTier * marginRate);
  const unitPrice = Math.ceil((unitCostWithTier + marginAmount) / 100) * 100;

  return {
    partType: 'MACHINING',
    materialCost,
    processCost,
    treatmentCost,
    subtotalCost,
    marginRate,
    marginAmount,
    unitPrice,
    totalPrice: unitPrice * qty,
    qtyTier: tier,
    basis: {
      basisType: 'MACHINING_MODEL',
      materialBaseDate: input.materialBaseDate || new Date().toISOString().substring(0, 10),
      calculatedAt: new Date().toISOString(),
      calcFormulaJson: {
        rawWeightKg: input.rawWeightKg,
        machiningHours: input.machiningHours,
        hourlyRate,
        unitSetupCost,
        packagingCost,
        tierFactor
      }
    }
  };
}

/**
 * 3. 구매품 원가 계산 (Commercial Catalog Calculation)
 */
export function calculateCommercialCost(input: CommercialCostInput): CostCalculationResult {
  const qty = Math.max(input.quantity, 1);
  const tier = getQtyTier(qty);
  const overheadRate = input.overheadRate ?? 0.05;
  const subtotalCost = Math.round(input.catalogUnitPrice * (1 + overheadRate));

  const marginRate = input.marginRate ?? 0.12;
  const marginAmount = Math.round(subtotalCost * marginRate);
  const unitPrice = Math.ceil((subtotalCost + marginAmount) / 10) * 10;

  return {
    partType: 'COMMERCIAL',
    materialCost: input.catalogUnitPrice,
    processCost: Math.round(input.catalogUnitPrice * overheadRate),
    treatmentCost: 0,
    subtotalCost,
    marginRate,
    marginAmount,
    unitPrice,
    totalPrice: unitPrice * qty,
    qtyTier: tier,
    basis: {
      basisType: 'COMMERCIAL_CATALOG',
      materialBaseDate: new Date().toISOString().substring(0, 10),
      calculatedAt: new Date().toISOString(),
      calcFormulaJson: {
        catalogUnitPrice: input.catalogUnitPrice,
        overheadRate
      }
    }
  };
}

/** 판금/제관품 원가 입력 파라미터 */
export interface SheetMetalCostInput {
  areaM2: number;               // 판재 전개 면적 (m²)
  thicknessMm: number;          // 판 두께 (mm)
  materialKgRate: number;       // 판재 kg당 단가 (SS400 1,800원, SUS304 5,500원 등)
  density?: number;             // 재질 비중 (기본 7.85)
  cuttingLengthMeter?: number;  // 레이저 절단 외곽/홀 둘레 (m)
  laserRatePerMeter?: number;   // 레이저 절단 m당 단가 (기본 1,800원)
  piercingCount?: number;       // 피어싱(관통) 홀 수 (기본 4회)
  piercingRate?: number;        // 피어싱 1회당 단가 (기본 80원)
  bendingCount?: number;        // 절곡 횟수 (기본 2회)
  bendRatePerStroke?: number;   // 절곡 1회당 단가 (기본 800원)
  weldingCost?: number;         // 제관 용접비 (기본 0원)
  surfaceTreatmentCost?: number;// 도장/분체/아연도금 등 후처리비
  treatmentMinLotCost?: number; // 표면처리 외주 최소 로트 기본료 (기본 30,000원)
  packagingShippingRate?: number;// 포장 및 출하 운송비율 (기본 0.03 = 3%)
  quantity: number;
  marginRate?: number;          // 기본 0.18 (18%)
  materialBaseDate?: string;
}

/**
 * 4. 판금/제관품 원가 계산 (Sheet Metal & Weldment Calculation)
 */
export function calculateSheetMetalCost(input: SheetMetalCostInput): CostCalculationResult {
  const qty = Math.max(input.quantity, 1);
  const tier = getQtyTier(qty);
  const density = input.density ?? 7.85;
  const weightKg = Number((input.areaM2 * input.thicknessMm * density).toFixed(2));
  const materialCost = Math.round(weightKg * input.materialKgRate);

  const cuttingLength = input.cuttingLengthMeter ?? Math.max(0.5, Number((Math.sqrt(input.areaM2) * 4).toFixed(2)));
  const laserRate = input.laserRatePerMeter ?? 1800;
  const cuttingCost = Math.round(cuttingLength * laserRate);

  const piercingCount = input.piercingCount ?? 4;
  const piercingRate = input.piercingRate ?? 80;
  const piercingCost = Math.round(piercingCount * piercingRate);

  const bendCount = input.bendingCount ?? 2;
  const bendRate = input.bendRatePerStroke ?? 800;
  const bendingCost = Math.round(bendCount * bendRate);

  const weldingCost = Math.round(input.weldingCost || 0);
  const processCost = cuttingCost + piercingCost + bendingCost + weldingCost;

  // 표면처리(분체도장 등) 외주 최소 로트 기본료 방어
  let treatmentCost = Math.round(input.surfaceTreatmentCost || 0);
  if (treatmentCost > 0 && input.treatmentMinLotCost) {
    const minUnitLot = Math.round(input.treatmentMinLotCost / qty);
    if (treatmentCost < minUnitLot) treatmentCost = minUnitLot;
  }

  // 포장 및 물류 운반비 (3%)
  const packagingRate = input.packagingShippingRate ?? 0.03;
  const packagingCost = Math.round((materialCost + processCost + treatmentCost) * packagingRate);

  const subtotalCost = materialCost + processCost + treatmentCost + packagingCost;
  const marginRate = input.marginRate ?? 0.18;
  const tierFactor = getQtyTierFactor(tier);
  const unitCostWithTier = Math.round(subtotalCost * tierFactor);
  const marginAmount = Math.round(unitCostWithTier * marginRate);
  const unitPrice = Math.ceil((unitCostWithTier + marginAmount) / 100) * 100;

  return {
    partType: 'SHEET_METAL',
    materialCost,
    processCost,
    treatmentCost,
    subtotalCost,
    marginRate,
    marginAmount,
    unitPrice,
    totalPrice: unitPrice * qty,
    qtyTier: tier,
    basis: {
      basisType: 'SHEET_METAL_MODEL',
      materialBaseDate: input.materialBaseDate || new Date().toISOString().substring(0, 10),
      calculatedAt: new Date().toISOString(),
      calcFormulaJson: {
        areaM2: input.areaM2,
        thicknessMm: input.thicknessMm,
        weightKg,
        cuttingLength,
        bendCount,
        processCost,
        tierFactor
      }
    }
  };
}

/** 전장/공압품 원가 입력 파라미터 */
export interface ElectricalCostInput {
  catalogUnitPrice: number;      // 메이커 카탈로그 구매단가
  overheadRate?: number;         // 수급 관리비율 (기본 0.08 = 8%)
  quantity: number;
  marginRate?: number;           // 기본 0.15 = 15%
}

/**
 * 5. 전장/공압/구동품 원가 계산 (Electrical & Pneumatic Component Calculation)
 */
export function calculateElectricalCost(input: ElectricalCostInput): CostCalculationResult {
  const qty = Math.max(input.quantity, 1);
  const tier = getQtyTier(qty);
  const overheadRate = input.overheadRate ?? 0.08;
  const subtotalCost = Math.round(input.catalogUnitPrice * (1 + overheadRate));

  const marginRate = input.marginRate ?? 0.15;
  const marginAmount = Math.round(subtotalCost * marginRate);
  const unitPrice = Math.ceil((subtotalCost + marginAmount) / 100) * 100;

  return {
    partType: 'ELECTRICAL',
    materialCost: input.catalogUnitPrice,
    processCost: Math.round(input.catalogUnitPrice * overheadRate),
    treatmentCost: 0,
    subtotalCost,
    marginRate,
    marginAmount,
    unitPrice,
    totalPrice: unitPrice * qty,
    qtyTier: tier,
    basis: {
      basisType: 'ELECTRICAL_CATALOG',
      materialBaseDate: new Date().toISOString().substring(0, 10),
      calculatedAt: new Date().toISOString(),
      calcFormulaJson: {
        catalogUnitPrice: input.catalogUnitPrice,
        overheadRate
      }
    }
  };
}
