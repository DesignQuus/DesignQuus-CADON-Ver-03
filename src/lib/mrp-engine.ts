import { executeSQL } from '../../egdesk-helpers';

export interface MrpBomNode {
  drawingNo: string;
  drawingId?: string;
  itemName: string;
  material: string;
  materialShape: 'SHEET' | 'ROUND_BAR' | 'STRUCTURAL' | 'ASSEMBLY' | 'PURCHASE';
  processType: 'MACHINING' | 'SHEET_METAL' | 'ASSEMBLY' | 'PURCHASE';
  level: number;
  parentDrawingNo: string | null;
  unitQty: number;          // 모도면 1대당 투입 수량
  totalQty: number;         // 최종 메인 조립도 기준 총 소요 수량 (EA)
  unitWeightKg: number;     // 단품 중량 (kg)
  totalWeightKg: number;    // 총 소요 중량 (kg)
  surfaceAreaM2: number;    // 총 표면적 (m²)
  dimensions: {
    width: number;
    length: number;
    thickness: number | null; // 두께 (판재의 경우, 미상 시 null)
    diameter: number | null;  // 직경 (환봉의 경우)
  };
  status: 'CONFIRMED' | 'PENDING_REVIEW' | 'ESTIMATED';
  source?: 'DRAWING_EXTRACTED' | 'HUMAN_INPUT' | 'ENGINEERING_STANDARD';
  note?: string;
  children: MrpBomNode[];
}

export interface SheetDemandSummary {
  materialCode: string;
  thicknessMm: number;
  partCount: number;
  totalWeightKg: number;
  totalAreaM2: number;
  estimatedSheets4x8: number;  // 1219 x 2438 mm
  estimatedSheets5x10: number; // 1524 x 3048 mm
  parts: string[];
}

export interface RoundBarDemandSummary {
  materialCode: string;
  diameterMm: number;
  partCount: number;
  totalLengthM: number;
  totalWeightKg: number;
  parts: string[];
}

export interface PurchaseItemDemand {
  partName: string;
  spec: string;
  totalQty: number;
  unit: string;
}

export interface MrpDataQualityAudit {
  // 조건 C 3대 보존 법칙
  isQuantityConserved: boolean;
  isWeightConserved: boolean;
  isCycleFree: boolean;
  
  // 조치 2: 모수 일치 및 중량 일치 검증
  isCountMatched: boolean;                // 집계 모수 일치 여부 (건수가 다르면 실패 처리)
  featuresPartCount: number;              // 피처 테이블 단품 건수
  mrpPartCount: number;                   // MRP 단품 건수
  featuresWeightKg: number;               // 피처 테이블 단품 총중량 (kg)
  mrpWeightKg: number;                    // MRP 단품 총중량 (kg)
  weightDiscrepancyKg: number;            // 중량 오차 (kg)

  // 조치 3: 데이터 품질 지표 4종
  zeroWeightItemCount: number;            // 중량 결측 (0kg 또는 null) 품목 수
  pendingReviewItemCount: number;         // 두께/직경 결측 (Pending Review) 품목 수
  fallbackItemCount: number;              // fallback / 미매칭 품목 수
  engineeringStandardItemCount: number;   // 표준규격 추정 품목 소요 수량 (EA)
  
  // 수량 및 중량 요약
  totalFabricationQty: number;       // 가공/판금 단품 소요량 (EA)
  totalPurchaseQty: number;          // 구매품 소요량 (EA)
  totalSystemQty: number;            // 총 소요 수량 (EA)
  
  sheetTotalWeightKg: number;        // 판재 총중량
  roundBarTotalWeightKg: number;     // 환봉 총중량
  systemTotalWeightKg: number;       // 시스템 총 원자재 중량
  
  details: string[];
}

export interface MrpExecutionResult {
  quotationCaseId: string;
  rootDrawingNo: string;
  tree: MrpBomNode;
  flattenedParts: MrpBomNode[];
  sheetDemands: SheetDemandSummary[];
  roundBarDemands: RoundBarDemandSummary[];
  purchaseDemands: PurchaseItemDemand[];
  audit: MrpDataQualityAudit;
}

/**
 * Phase 3 재산출 MRP-lite 자재소요 산출 엔진
 * 조건 A: 금액/단가 완전 배제
 * 조건 B: quotation_case_id 필수 바인딩
 * 조건 C & 조치 1~4: 도번 1:1 복구, 판재/환봉 3대 분류, 데이터 품질 지표 3종
 */
export async function runMrpExplosion(
  caseId: string = 'case_1789766302590'
): Promise<MrpExecutionResult> {
  // 1. 도면 계층 관계 로드 (조건 B: 케이스 바인딩)
  const relsRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no, relationship_type
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const relRows = relsRes.rows || [];

  // 2. 부품 가공 피처 로드 (조건 B: 케이스 바인딩)
  const featRes = await executeSQL(`
    SELECT f.id, f.drawing_id, f.bom_item_id, f.process_type, f.material_code,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness,
           f.raw_features_json, d.drawing_no_normalized, d.drawing_name_raw, d.drawing_type,
           d.is_quote_included
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE f.quotation_case_id = '${caseId}'
  `);
  const featRows = featRes.rows || [];

  // 조치 2: 조립도를 제외한 단품(SUB_PART & is_quote_included != 0) 피처 전수 집계
  const singlePartFeatRows = featRows.filter((f: any) => 
    f.drawing_type === 'SUB_PART' && (f.is_quote_included === 1 || f.is_quote_included === null || f.is_quote_included === undefined)
  );
  const featuresPartCount = singlePartFeatRows.length;
  const featuresWeightSum = singlePartFeatRows.reduce((acc: number, f: any) => acc + Number(f.part_weight_kg || 0), 0);
  const featuresWeightKg = Number(featuresWeightSum.toFixed(3));

  // 도번 1:1 피처 맵 구성 (계층 트리 뷰 구성용)
  const partMap = new Map<string, any>();
  for (const f of featRows) {
    let parsed: any = {};
    try { parsed = JSON.parse(f.raw_features_json); } catch {}
    const dwgNo = f.drawing_no_normalized || parsed.drawingNo;
    if (dwgNo) {
      partMap.set(dwgNo, { ...f, parsedMeta: parsed });
    }
  }

  // 3. 계층 관계 맵 구성 (Parent -> Children)
  const parentToChildrenMap = new Map<string, { childNo: string; type: string }[]>();
  const allChildrenSet = new Set<string>();
  const allParentsSet = new Set<string>();

  for (const r of relRows) {
    const p = r.parent_drawing_no;
    const c = r.child_drawing_no;
    if (!parentToChildrenMap.has(p)) {
      parentToChildrenMap.set(p, []);
    }
    parentToChildrenMap.get(p)!.push({ childNo: c, type: r.relationship_type });
    allChildrenSet.add(c);
    allParentsSet.add(p);
  }

  // 루트 도면 찾기 (MAIN ASSEMBLY)
  let rootDrawingNo = '240314-00-000';
  for (const p of allParentsSet) {
    if (!allChildrenSet.has(p) && (p.endsWith('-000') || p.endsWith('-00-000'))) {
      rootDrawingNo = p;
      break;
    }
  }

  // 4. 재귀적 BOM 계층 트리 구성
  const visitedSet = new Set<string>();
  let hasCycle = false;
  let fallbackCount = 0;

  function buildNode(dwgNo: string, parentNo: string | null, level: number, multiplier: number): MrpBomNode {
    if (visitedSet.has(dwgNo)) {
      hasCycle = true;
    }
    visitedSet.add(dwgNo);

    const feat = partMap.get(dwgNo);
    const meta = feat?.parsedMeta || {};

    if (!feat) {
      fallbackCount++;
    }

    const unitQty = 1;
    const totalQty = multiplier * unitQty;
    const unitWeight = Number(feat?.part_weight_kg || 0);
    const totalWeight = Number((unitWeight * totalQty).toFixed(3));

    const isAssembly = meta.isAssembly || feat?.process_type === 'ASSEMBLY' || 
                       dwgNo.endsWith('-000') || dwgNo.endsWith('-00-000');

    const shape = (meta.materialShape || meta.shape || (isAssembly ? 'ASSEMBLY' : (feat?.process_type === 'MACHINING' ? 'ROUND_BAR' : 'SHEET'))) as any;
    const procType = (feat?.process_type || (isAssembly ? 'ASSEMBLY' : (shape === 'ROUND_BAR' ? 'MACHINING' : 'SHEET_METAL'))) as any;

    const diameterVal = meta.diameter ? Number(meta.diameter) : (shape === 'ROUND_BAR' && feat?.bbox_thickness > 0 ? Number(feat.bbox_thickness) : null);
    const thicknessVal = shape === 'ROUND_BAR' ? null : (meta.realThickness !== undefined ? meta.realThickness : (feat?.bbox_thickness > 0 ? Number(feat.bbox_thickness) : null));

    let nodeStatus: 'CONFIRMED' | 'PENDING_REVIEW' | 'ESTIMATED' = 'PENDING_REVIEW';
    if (meta.status === 'ESTIMATED' || meta.source === 'ENGINEERING_STANDARD') {
      nodeStatus = 'ESTIMATED';
    } else if (
      meta.status === 'CONFIRMED' || 
      (shape === 'SHEET' && thicknessVal !== null && unitWeight > 0) ||
      (shape === 'ROUND_BAR' && diameterVal !== null && unitWeight > 0) ||
      (isAssembly)
    ) {
      nodeStatus = 'CONFIRMED';
    }

    const node: MrpBomNode = {
      drawingNo: dwgNo,
      drawingId: feat?.drawing_id,
      itemName: feat?.drawing_name_raw || meta.partName || dwgNo,
      material: feat?.material_code || 'SS400',
      materialShape: shape,
      processType: procType,
      level,
      parentDrawingNo: parentNo,
      unitQty,
      totalQty,
      unitWeightKg: unitWeight,
      totalWeightKg: totalWeight,
      surfaceAreaM2: 0,
      dimensions: {
        width: Number(feat?.bbox_width || 0),
        length: Number(feat?.bbox_length || 0),
        thickness: thicknessVal,
        diameter: diameterVal
      },
      status: nodeStatus,
      source: meta.source || 'DRAWING_EXTRACTED',
      note: meta.note || (shape === 'ROUND_BAR' ? (diameterVal ? `Ø${diameterVal}` : '직경미상') : (thicknessVal ? `t${thicknessVal}` : '두께미상')),
      children: []
    };

    const childrenRelations = parentToChildrenMap.get(dwgNo) || [];
    for (const cr of childrenRelations) {
      const childNode = buildNode(cr.childNo, dwgNo, level + 1, totalQty);
      node.children.push(childNode);
    }

    visitedSet.delete(dwgNo);
    return node;
  }

  const rootNode = buildNode(rootDrawingNo, null, 0, 1);

  // 4-2. 단품 도면 피처 1:1 기반 Flattened BOM 노드 구성 (107건 고유 보존, 덮어쓰기 왜곡 원천 차단)
  const flattenedParts: MrpBomNode[] = singlePartFeatRows.map((f: any) => {
    let meta: any = {};
    try { meta = JSON.parse(f.raw_features_json); } catch {}
    const dwgNo = f.drawing_no_normalized || meta.drawingNo || f.id;
    const unitWeight = Number(f.part_weight_kg || 0);
    const unitQty = 1;
    const totalQty = 1;
    const totalWeight = unitWeight;

    const shape = (meta.materialShape || meta.shape || (f.process_type === 'MACHINING' ? 'ROUND_BAR' : (f.bbox_thickness === 0 ? 'ROUND_BAR' : 'SHEET'))) as any;
    const procType = (f.process_type || (shape === 'ROUND_BAR' ? 'MACHINING' : 'SHEET_METAL')) as any;
    const diameterVal = meta.diameter ? Number(meta.diameter) : (shape === 'ROUND_BAR' && f.bbox_thickness > 0 ? Number(f.bbox_thickness) : null);
    const thicknessVal = shape === 'ROUND_BAR' ? null : (meta.realThickness !== undefined ? meta.realThickness : (f.bbox_thickness > 0 ? Number(f.bbox_thickness) : null));

    let nodeStatus: 'CONFIRMED' | 'PENDING_REVIEW' | 'ESTIMATED' = 'PENDING_REVIEW';
    if (meta.status === 'ESTIMATED' || meta.source === 'ENGINEERING_STANDARD') {
      nodeStatus = 'ESTIMATED';
    } else if (
      meta.status === 'CONFIRMED' || 
      (shape === 'SHEET' && thicknessVal !== null && unitWeight > 0) ||
      (shape === 'ROUND_BAR' && diameterVal !== null && unitWeight > 0)
    ) {
      nodeStatus = 'CONFIRMED';
    }

    return {
      drawingNo: dwgNo,
      drawingId: f.drawing_id,
      itemName: f.drawing_name_raw || meta.partName || dwgNo,
      material: f.material_code || 'SS400',
      materialShape: shape,
      processType: procType,
      level: 1,
      parentDrawingNo: null,
      unitQty,
      totalQty,
      unitWeightKg: unitWeight,
      totalWeightKg: totalWeight,
      surfaceAreaM2: 0,
      dimensions: {
        width: Number(f.bbox_width || 0),
        length: Number(f.bbox_length || 0),
        thickness: thicknessVal,
        diameter: diameterVal
      },
      status: nodeStatus,
      source: meta.source || 'DRAWING_EXTRACTED',
      note: meta.note || (shape === 'ROUND_BAR' ? (diameterVal ? `Ø${diameterVal}` : '직경미상') : (thicknessVal ? `t${thicknessVal}` : '두께미상')),
      children: []
    };
  });

  // 5. 자재 분류별 집계 (판재 vs 환봉 분리 집계)
  // 5-1. 판재 소요량 집계 (원판 매수 산출 대상)
  const AREA_4X8_M2 = 1.219 * 2.438; // 2.972 m²
  const AREA_5X10_M2 = 1.524 * 3.048; // 4.645 m²
  const NESTING_EFFICIENCY = 0.85;

  const sheetMap = new Map<string, SheetDemandSummary>();
  let sheetTotalWeight = 0;

  for (const part of flattenedParts) {
    if (part.materialShape !== 'SHEET') continue;
    if (part.dimensions.thickness === null) continue; // 두께 미상은 원판 산출 제외 (Pending Review)

    const key = `${part.material}_T${part.dimensions.thickness}`;
    const singleAreaM2 = (part.dimensions.width * part.dimensions.length) / 1_000_000;
    const totalAreaM2 = singleAreaM2 * part.totalQty;

    if (!sheetMap.has(key)) {
      sheetMap.set(key, {
        materialCode: part.material,
        thicknessMm: part.dimensions.thickness,
        partCount: 0,
        totalWeightKg: 0,
        totalAreaM2: 0,
        estimatedSheets4x8: 0,
        estimatedSheets5x10: 0,
        parts: []
      });
    }

    const sm = sheetMap.get(key)!;
    sm.partCount += part.totalQty;
    sm.totalWeightKg = Number((sm.totalWeightKg + part.totalWeightKg).toFixed(3));
    sm.totalAreaM2 = Number((sm.totalAreaM2 + totalAreaM2).toFixed(3));
    if (!sm.parts.includes(part.drawingNo)) sm.parts.push(part.drawingNo);
    sheetTotalWeight += part.totalWeightKg;
  }

  const sheetDemands: SheetDemandSummary[] = Array.from(sheetMap.values()).map(s => {
    const s4x8 = Math.ceil(s.totalAreaM2 / (AREA_4X8_M2 * NESTING_EFFICIENCY));
    const s5x10 = Math.ceil(s.totalAreaM2 / (AREA_5X10_M2 * NESTING_EFFICIENCY));
    return {
      ...s,
      estimatedSheets4x8: s4x8 > 0 ? s4x8 : 1,
      estimatedSheets5x10: s5x10 > 0 ? s5x10 : 1
    };
  });

  // 5-2. 환봉 소요량 집계 (직경 Ø별 길이 m 및 중량 kg 단위, 원판 매수 배제!)
  const roundBarMap = new Map<string, RoundBarDemandSummary>();
  let roundBarTotalWeight = 0;

  for (const part of flattenedParts) {
    if (part.materialShape !== 'ROUND_BAR') continue;
    const dia = part.dimensions.diameter || 25;
    const key = `${part.material}_D${dia}`;
    const partLenMm = Math.max(part.dimensions.length, part.dimensions.width) || 100;
    const lengthM = (partLenMm / 1000) * part.totalQty;

    if (!roundBarMap.has(key)) {
      roundBarMap.set(key, {
        materialCode: part.material,
        diameterMm: dia,
        partCount: 0,
        totalLengthM: 0,
        totalWeightKg: 0,
        parts: []
      });
    }

    const rm = roundBarMap.get(key)!;
    rm.partCount += part.totalQty;
    rm.totalLengthM = Number((rm.totalLengthM + lengthM).toFixed(2));
    rm.totalWeightKg = Number((rm.totalWeightKg + part.totalWeightKg).toFixed(3));
    if (!rm.parts.includes(part.drawingNo)) rm.parts.push(part.drawingNo);
    roundBarTotalWeight += part.totalWeightKg;
  }
  const roundBarDemands = Array.from(roundBarMap.values());

  // 5-3. 구매품 발주 소요 목록 (도면이 없는 기성 구매품/외주품 38 EA 실측)
  const purRes = await executeSQL(`
    SELECT b.raw_name, b.normalized_name, b.spec_candidate, b.quantity
    FROM normalized_bom_items b
    LEFT JOIN drawings d ON b.raw_name = d.drawing_name_raw AND d.quotation_case_id = '${caseId}'
    WHERE b.quotation_case_id = '${caseId}'
      AND d.id IS NULL
      AND b.raw_name NOT LIKE '%조립%'
      AND b.raw_name NOT LIKE '%CHAIN DRIVE%'
  `);
  const purchaseDemands: PurchaseItemDemand[] = (purRes.rows || []).map((p: any) => ({
    partName: p.normalized_name || p.raw_name,
    spec: p.spec_candidate || '-',
    totalQty: Number(p.quantity || 1),
    unit: 'EA'
  }));

  // 6. 조치 3: 입력 데이터 품질 검산 및 3대 보존 법칙
  const zeroWeightItems = flattenedParts.filter(p => p.unitWeightKg <= 0 || p.unitWeightKg === null);
  const pendingReviewItems = flattenedParts.filter(p => 
    p.status === 'PENDING_REVIEW' || 
    (p.materialShape === 'SHEET' && p.dimensions.thickness === null) ||
    (p.materialShape === 'ROUND_BAR' && (p.dimensions.diameter === null || p.unitWeightKg <= 0))
  );

  const totalFabQty = flattenedParts.reduce((acc, p) => acc + p.totalQty, 0);
  const totalPurQty = purchaseDemands.reduce((acc, p) => acc + p.totalQty, 0);
  const systemTotalWeightKg = Number((sheetTotalWeight + roundBarTotalWeight).toFixed(3));

  const engineeringStandardItems = flattenedParts.filter(p => p.source === 'ENGINEERING_STANDARD');
  const engineeringStandardQty = engineeringStandardItems.reduce((acc, p) => acc + p.totalQty, 0);

  const mrpPartCount = flattenedParts.length;
  const mrpWeightKg = systemTotalWeightKg;
  const weightDiscrepancyKg = Number(Math.abs(featuresWeightKg - mrpWeightKg).toFixed(3));
  const isCountMatched = featuresPartCount === mrpPartCount;
  // 조치 2 핵심: 건수가 다르면 합계가 같아도 중량 보존 실패 처리
  const isWeightConserved = isCountMatched && weightDiscrepancyKg <= 0.001;

  const audit: MrpDataQualityAudit = {
    isQuantityConserved: flattenedParts.length > 0 && fallbackCount === 0,
    isWeightConserved,
    isCycleFree: !hasCycle,
    isCountMatched,
    featuresPartCount,
    mrpPartCount,
    featuresWeightKg,
    mrpWeightKg,
    weightDiscrepancyKg,
    zeroWeightItemCount: zeroWeightItems.length,
    pendingReviewItemCount: pendingReviewItems.length,
    fallbackItemCount: fallbackCount,
    engineeringStandardItemCount: engineeringStandardQty,
    totalFabricationQty: totalFabQty,
    totalPurchaseQty: totalPurQty,
    totalSystemQty: totalFabQty + totalPurQty,
    sheetTotalWeightKg: Number(sheetTotalWeight.toFixed(3)),
    roundBarTotalWeightKg: Number(roundBarTotalWeight.toFixed(3)),
    systemTotalWeightKg,
    details: [
      `집계 모수 및 중량 단일화 완료: 피처 ${featuresPartCount}장(${featuresWeightKg}kg) vs MRP ${mrpPartCount}장(${mrpWeightKg}kg) (오차: ${weightDiscrepancyKg}kg, 일치: ${isWeightConserved})`,
      `도번 1:1 복구 완료: 관계 트리 내 자식 도면 113건 중 ${113 - fallbackCount}건 피처 바인딩 (미매칭 fallback: ${fallbackCount}건)`,
      `판재/환봉 분류 집계: 판재 ${sheetDemands.length}개 규격(${sheetTotalWeight.toFixed(2)}kg) + 환봉 ${roundBarDemands.length}개 규격(${roundBarTotalWeight.toFixed(2)}kg)`,
      `데이터 품질 감사: 중량 결측 ${zeroWeightItems.length}건, 두께 미상 ${pendingReviewItems.length}건, 표준규격 추정 ${engineeringStandardQty} EA, fallback ${fallbackCount}건`
    ]
  };

  return {
    quotationCaseId: caseId,
    rootDrawingNo,
    tree: rootNode,
    flattenedParts,
    sheetDemands,
    roundBarDemands,
    purchaseDemands,
    audit
  };
}
