/**
 * BOM Similarity Analysis & Standard Master Schema Normalizer
 * 자재리스트 표준 데이터 규격(Standard Master Schema) 및 자재 유사도 분석 엔진
 */

import { db } from './db';
import { queryTable, executeSQL } from '../../egdesk-helpers';

/**
 * 이지데스크 user-data API(queryTable, executeSQL)를 통해 실시간 부품 마스터 및 단가 풀을 동적으로 조회
 */
export async function fetchDbMastersAndPricePool(companyId?: string): Promise<{ masters: any[]; learnedPool: any[] }> {
  try {
    const pMastersRes = await queryTable('product_masters', { limit: 500 });
    const prcMastersRes = await queryTable('price_masters', { limit: 500 });
    
    const pRows = pMastersRes?.rows || [];
    const prcRows = prcMastersRes?.rows || [];
    const prcMap = new Map(prcRows.map((p: any) => [p.master_id, p.unit_price]));

    const combinedMasters = pRows.map((pm: any) => ({
      ...pm,
      item_code: pm.master_code,
      item_name: pm.standard_name,
      unit_price: prcMap.get(pm.id) || 0
    }));

    const poolFilters: Record<string, string> = {};
    if (companyId) {
      poolFilters['company_id'] = companyId;
    }
    const poolRes = await queryTable('manual_price_pool', {
      filters: Object.keys(poolFilters).length > 0 ? poolFilters : undefined,
      limit: 200
    });
    const learnedPool = poolRes?.rows || [];

    return { masters: combinedMasters, learnedPool };
  } catch (e) {
    console.warn('[fetchDbMastersAndPricePool] Failed to query via egdesk-helpers, returning empty:', e);
    return { masters: [], learnedPool: [] };
  }
}

export interface StandardSchemaSuggestion {
  // 1. 자재구분 (가공품 vs 구매품/기성품)
  item_type: 'MACHINED' | 'COMMERCIAL';
  item_type_label: string; // '가공품' | '구매품(기성품)'

  // 2. 표준 부품명
  standard_name: string;

  // 3. 표준 재질 및 비중
  standard_material: string;
  density: number; // g/cm³ (kg/dm³)

  // 4. 형상 구분 및 가공 치수
  shape_type: 'PLATE' | 'ROUND' | 'BLOCK' | 'OTHER';
  shape_label: string; // '판재' | '환봉' | '각재' | '기타'
  thickness?: number; // 두께 (mm)
  width?: number; // 가로 (mm)
  length?: number; // 세로/길이 (mm)
  diameter?: number; // 외경 (mm)
  dimension_str: string; // "T15 x W200 x L350" 등

  // 5. 예상 소재 중량 (kg)
  calculated_weight_kg: number;

  // 6. 표준 후처리/열처리
  treatment_code?: string;
  treatment_label: string;

  // 7. 구매품(상용품) 메이커 및 모델
  maker?: string;
  model_no?: string;

  // 8. 매칭된 마스터 정보 및 자가학습(Self-Learning) 연동 정보
  matched_master_id?: string;
  matched_master_code?: string;
  matched_master_name?: string;
  matched_unit_price?: number;

  // 자가학습 지식풀 연계
  learned_unit_price?: number;
  learned_approval_count?: number;
  learned_source?: string;
  learned_date?: string;
  learned_company_name?: string;

  // 9. 종합 유사도 점수 (0 ~ 100%) 및 신뢰도 등급
  similarity_score: number; // 0 ~ 100
  confidence_grade: 'HIGH' | 'MEDIUM' | 'LOW'; // HIGH: >= 90%, MEDIUM: 70~89%, LOW: < 70%
  similarity_reasons: string[]; // 유사도 판단 근거 목록
}

// 표준 재질 및 비중/동의어 사전
export const MATERIAL_DICTIONARY: Record<string, { standard: string; density: number; aliases: string[] }> = {
  SS400: { standard: 'SS400', density: 7.85, aliases: ['SS41', 'SS-400', 'SS400', 'STEEL', 'SM400', '철', '일반구조용강'] },
  S45C: { standard: 'S45C', density: 7.85, aliases: ['S-45C', 'S45C', 'SM45C', 'CARBON STEEL', '기계구조용탄소강'] },
  AL6061: { standard: 'AL6061-T6', density: 2.70, aliases: ['AL6061', 'A6061', 'AL6061-T6', 'A6061-T6', 'AL60', '알루미늄', 'ALUMINUM'] },
  AL5052: { standard: 'AL5052', density: 2.68, aliases: ['AL5052', 'A5052', 'AL50', 'AL 5052'] },
  AL7075: { standard: 'AL7075-T6', density: 2.81, aliases: ['AL7075', 'A7075', '초두랄루민'] },
  SUS304: { standard: 'SUS304', density: 7.93, aliases: ['SUS-304', 'SUS304', 'STS304', 'STS-304', 'STAINLESS', '스텐', 'SUS'] },
  SUS316: { standard: 'SUS316', density: 7.98, aliases: ['SUS-316', 'SUS316', 'STS316', 'STS-316'] },
  MC_NYLON: { standard: 'MC NYLON', density: 1.15, aliases: ['MC NYLON', 'MC나일론', 'M/C NYLON', '블루MC', 'MC-NYLON', 'MC-BLUE'] },
  POM: { standard: 'POM (아세탈)', density: 1.41, aliases: ['POM', 'ACETAL', '아세탈', 'DELRIN', '델린'] },
  PEEK: { standard: 'PEEK', density: 1.32, aliases: ['PEEK', '피크'] },
  SKD11: { standard: 'SKD11', density: 7.85, aliases: ['SKD-11', 'SKD11', '합금공구강'] },
  C3604: { standard: 'C3604 (황동)', density: 8.50, aliases: ['C3604', 'BRASS', '황동', '신주'] },
  PBC: { standard: 'PBC (인청동)', density: 8.80, aliases: ['PBC', '인청동', 'PHOSPHOR BRONZE'] }
};

// 구매품(기성품/상용품 COTS) 키워드 및 메이커 사전
export const COMMERCIAL_KEYWORDS = [
  'LM GUIDE', 'LM BLOC', 'LM 가이드', 'BALL SCREW', '볼스크류', 'BEARING', '베어링',
  'CYLINDER', '실린더', 'MOTOR', '모터', 'SENSOR', '센서', 'COUPLING', '커플링',
  'BOLT', '볼트', 'NUT', '너트', 'WASHER', '와셔', 'O-RING', '오링', 'SPRING', '스프링',
  'TIMING BELT', '타이밍 벨트', 'PULLEY', '풀리', 'BUSH', '부시', 'SPEED CONTROLLER'
];

export const COMMERCIAL_MAKERS = [
  'MISUMI', '미스미', 'THK', 'SMC', 'SBC', 'KEYENCE', '키엔스', 'FESTO', '페스토',
  'NSK', 'IKO', 'HIWIN', '하윈', 'SAMICK', '삼익', 'SANGWON', '상원', 'OMRON', '옴론'
];

// 후처리/열처리 사전
export const TREATMENT_DICTIONARY: Record<string, { code: string; label: string; aliases: string[] }> = {
  ANOD_WHITE: { code: 'ANOD_WHITE', label: '백색 아노다이징', aliases: ['백색아노', '백색 아노', 'WHITE ANODIZING', 'CL-ANOD', 'CL ANOD'] },
  ANOD_BLACK: { code: 'ANOD_BLACK', label: '흑색 아노다이징', aliases: ['흑색아노', '흑색 아노', 'BLACK ANODIZING', 'BK-ANOD', '착색아노'] },
  ANOD_HARD: { code: 'ANOD_HARD', label: '경질 아노다이징', aliases: ['경질아노', '경질 아노', 'HARD ANODIZING'] },
  BLACK_OXIDE: { code: 'BLACK_OXIDE', label: '흑착색 (착색)', aliases: ['흑착색', '착색', '착색처리', 'BLACK OXIDE', '사삼산화철'] },
  ELECTROLESS_NICKEL: { code: 'ELECTROLESS_NICKEL', label: '무전해 니켈도금 (ENP)', aliases: ['무전해니켈', '무전해 니켈', '카니젠', 'ENP', 'KANIGEN'] },
  HEAT_QT: { code: 'HEAT_QT', label: '담금질/템퍼링 (Q/T)', aliases: ['Q/T', 'QT', '조질', '담금질', '열처리'] },
  HEAT_HRC: { code: 'HEAT_HRC', label: '고주파/진공열처리 (HRC)', aliases: ['HRC', '고주파', '진공열처리', '침탄'] }
};

/**
 * Levenshtein Distance 기반 문자열 유사도 계산 (0 ~ 1)
 */
export function calculateStringSimilarity(s1: string, s2: string): number {
  const str1 = (s1 || '').trim().toUpperCase();
  const str2 = (s2 || '').trim().toUpperCase();

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  if (str1.includes(str2) || str2.includes(str1)) {
    const longer = Math.max(str1.length, str2.length);
    const shorter = Math.min(str1.length, str2.length);
    return Math.max(0.7, shorter / longer);
  }

  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const maxLen = Math.max(str1.length, str2.length);
  return 1 - (track[str2.length][str1.length] / maxLen);
}

/**
 * 도면 원본 치수 텍스트(예: "15t*200*350", "Ø30x150L") 정규식 분해 파서
 */
export function parseDimensions(dimStr?: string): {
  shape_type: 'PLATE' | 'ROUND' | 'BLOCK' | 'OTHER';
  shape_label: string;
  thickness?: number;
  width?: number;
  length?: number;
  diameter?: number;
  dimension_str: string;
} {
  if (!dimStr || !dimStr.trim()) {
    return {
      shape_type: 'PLATE',
      shape_label: '판재 (추정)',
      dimension_str: '도면 치수 참조'
    };
  }

  const s = dimStr.trim();

  // 1. 환봉형 (Ø, D, 파이) 예: Ø30 x 150L, 30파이*150, D25x100
  const roundMatch = s.match(/(?:Ø|D|Ф|파이)?\s*(\d+(?:\.\d+)?)\s*(?:Ø|D|Ф|파이)?\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(?:L|l|mm)?/i);
  if (roundMatch && (s.includes('Ø') || s.includes('파이') || s.toLowerCase().includes('d') || s.toLowerCase().includes('l'))) {
    const dia = parseFloat(roundMatch[1]);
    const len = parseFloat(roundMatch[2]);
    return {
      shape_type: 'ROUND',
      shape_label: '환봉 (Round)',
      diameter: dia,
      length: len,
      dimension_str: `Ø${dia} x ${len}L`
    };
  }

  // 2. 판재형 (T, t, 두께 x 가로 x 세로) 예: 15T*200*350, T15x200x350, 15*200*350
  const plateMatch = s.match(/(?:T|t)?\s*(\d+(?:\.\d+)?)\s*(?:T|t)?\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/i);
  if (plateMatch) {
    const t = parseFloat(plateMatch[1]);
    const w = parseFloat(plateMatch[2]);
    const l = parseFloat(plateMatch[3]);
    return {
      shape_type: 'PLATE',
      shape_label: '판재 (Plate)',
      thickness: t,
      width: w,
      length: l,
      dimension_str: `T${t} x W${w} x L${l}`
    };
  }

  // 3. 각재/블록형 (2개 수치만 있는 경우: W x L)
  const blockMatch = s.match(/(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/i);
  if (blockMatch) {
    const w = parseFloat(blockMatch[1]);
    const l = parseFloat(blockMatch[2]);
    return {
      shape_type: 'BLOCK',
      shape_label: '각재/블록',
      width: w,
      length: l,
      dimension_str: `${w} x ${l}`
    };
  }

  return {
    shape_type: 'OTHER',
    shape_label: '기타/가공',
    dimension_str: s
  };
}

/**
 * 소재 중량(Weight kg) 계산
 * 판재: T x W x L x 비중 x 절단여유(1.05) / 1,000,000
 * 환봉: PI x (Dia/2)^2 x L x 비중 x 절단여유(1.05) / 1,000,000
 */
export function calculateWeightKg(
  shape: { shape_type: string; thickness?: number; width?: number; length?: number; diameter?: number },
  density: number
): number {
  const margin = 1.05; // 톱절단 및 가공 여유율 5%
  if (shape.shape_type === 'PLATE' && shape.thickness && shape.width && shape.length) {
    const volumeMm3 = shape.thickness * shape.width * shape.length;
    const weight = (volumeMm3 / 1000000) * density * margin;
    return Math.round(weight * 100) / 100;
  }
  if (shape.shape_type === 'ROUND' && shape.diameter && shape.length) {
    const radius = shape.diameter / 2;
    const volumeMm3 = Math.PI * radius * radius * shape.length;
    const weight = (volumeMm3 / 1000000) * density * margin;
    return Math.round(weight * 100) / 100;
  }
  return 0;
}

/**
 * 핵심: 단일 품목에 대한 자재리스트 표준 데이터 규격 변환 및 유사도 분석
 */
export function analyzeBomSimilarity(rawItem: {
  raw_name?: string;
  drawing_name?: string;
  normalized_name?: string;
  drawing_material?: string;
  material_candidate?: string;
  spec_candidate?: string;
  remark?: string;
  quantity?: number;
  unit?: string;
  company_id?: string;
  company_name?: string;
}, existingMasters: any[] = [], learnedPool: any[] = []): StandardSchemaSuggestion {
  const name = (rawItem.drawing_name || rawItem.normalized_name || rawItem.raw_name || '').trim();
  const rawMaterial = (rawItem.drawing_material || rawItem.material_candidate || '').trim();
  const rawSpec = (rawItem.spec_candidate || '').trim();
  const rawRemark = (rawItem.remark || '').trim();
  const upperCombined = `${name} ${rawMaterial} ${rawSpec} ${rawRemark}`.toUpperCase();

  const reasons: string[] = [];
  let similarityScore = 80; // 기본 출발 점수

  // 1. 자재구분 판별 (가공품 vs 구매품)
  let itemType: 'MACHINED' | 'COMMERCIAL' = 'MACHINED';
  let matchedMaker: string | undefined;

  for (const maker of COMMERCIAL_MAKERS) {
    if (upperCombined.includes(maker.toUpperCase())) {
      itemType = 'COMMERCIAL';
      matchedMaker = maker;
      reasons.push(`기성품 제조사(${maker}) 키워드 일치`);
      break;
    }
  }

  if (itemType === 'MACHINED') {
    for (const kw of COMMERCIAL_KEYWORDS) {
      if (upperCombined.includes(kw.toUpperCase())) {
        itemType = 'COMMERCIAL';
        reasons.push(`표준 상용품 품명(${kw}) 감지`);
        break;
      }
    }
  }

  if (itemType === 'MACHINED') {
    reasons.push('가공 치수 및 제작 부품 형태 (가공품 자동 분류)');
  }

  // 2. 재질 표준화 및 비중 연계
  let standardMaterial = 'SS400';
  let density = 7.85;
  let materialMatched = false;

  const matUpper = (rawMaterial || 'SS400').toUpperCase().replace(/\s+/g, '');
  for (const [key, val] of Object.entries(MATERIAL_DICTIONARY)) {
    if (val.aliases.some(a => matUpper.includes(a.toUpperCase().replace(/\s+/g, '')))) {
      standardMaterial = val.standard;
      density = val.density;
      materialMatched = true;
      reasons.push(`표준 재질 사전 매칭: ${rawMaterial || '기본'} ➔ ${val.standard} (비중 ${val.density})`);
      break;
    }
  }

  if (!materialMatched && rawMaterial) {
    standardMaterial = rawMaterial;
    similarityScore -= 10;
    reasons.push(`사전 미등록 재질: ${rawMaterial} (확인 권장)`);
  } else if (materialMatched) {
    similarityScore += 10;
  }

  // 3. 형상 및 가공 치수 파싱
  const shape = parseDimensions(rawSpec || name);
  const calculatedWeight = calculateWeightKg(shape, density);
  if (calculatedWeight > 0) {
    reasons.push(`가공 치수(${shape.dimension_str}) 기준 소재 중량 ${calculatedWeight}kg 자동 산출`);
    similarityScore += 5;
  }

  // 4. 후처리/열처리 감지
  let treatmentCode: string | undefined;
  let treatmentLabel = '미표기 / 일반';
  for (const [key, val] of Object.entries(TREATMENT_DICTIONARY)) {
    if (val.aliases.some(a => upperCombined.includes(a.toUpperCase()))) {
      treatmentCode = val.code;
      treatmentLabel = val.label;
      reasons.push(`후처리 감지: ${val.label}`);
      similarityScore += 5;
      break;
    }
  }

  // 5. 표준 부품명 정규화
  // 특수문자 정리 및 영문 대문자 정규화
  let standardName = name
    .replace(/[\[\]\(\)\{\}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  // 6. 누적 자가학습 지식풀(manual_price_pool) 우선 매칭 & 기존 단가 마스터 매칭
  let bestLearned: any = null;
  let highestLearnedSim = 0;

  for (const lp of learnedPool) {
    const lpName = (lp.standard_name || lp.item_name || '').trim();
    const sim = calculateStringSimilarity(standardName, lpName);
    const lpMat = (lp.standard_material || lp.material || '').trim().toUpperCase().replace(/\s+/g, '');
    const matMatch = lpMat && (matUpper.includes(lpMat) || lpMat.includes(matUpper));
    
    // 동일 고객사 가중치 + 재질 일치 가중치
    let totalMatchScore = sim;
    if (matMatch) totalMatchScore += 0.08;
    if (rawItem.company_id && lp.company_id === rawItem.company_id) totalMatchScore += 0.07;
    
    if (totalMatchScore > highestLearnedSim) {
      highestLearnedSim = totalMatchScore;
      bestLearned = lp;
    }
  }

  let learnedPrice: number | undefined;
  let learnedCount: number | undefined;
  let learnedSource: string | undefined;
  let learnedDate: string | undefined;
  let learnedCompany: string | undefined;

  if (bestLearned && highestLearnedSim >= 0.72) {
    learnedPrice = bestLearned.unit_price;
    learnedCount = bestLearned.approval_count || 1;
    learnedSource = bestLearned.source === 'QUOTE_MANUAL' ? '과거 견적 승인 단가' : '과거 도면 검수 단가';
    learnedDate = bestLearned.last_used_at || bestLearned.created_at;
    learnedCompany = bestLearned.company_name;

    reasons.push(`자가학습 지식 일치: '${bestLearned.standard_name || bestLearned.item_name}' (${learnedCount}회 검증, ₩${Number(learnedPrice || 0).toLocaleString()})`);
    
    // 자가학습 가중치: 승인 횟수에 따라 최대 15% 보너스
    const bonus = Math.min(15, (learnedCount || 1) * 3);
    similarityScore = Math.min(99, Math.max(similarityScore, Math.round(highestLearnedSim * 100) + bonus));
  }

  // 7. 기존 단가 마스터(Price/Product Master)와의 유사도 매칭 (기존)
  let bestMaster: any = null;
  let highestMasterSim = 0;

  for (const m of existingMasters) {
    const mName = (m.item_name || m.name || '').trim();
    const sim = calculateStringSimilarity(standardName, mName);
    if (sim > highestMasterSim) {
      highestMasterSim = sim;
      bestMaster = m;
    }
  }

  if (bestMaster && highestMasterSim >= 0.7) {
    reasons.push(`기존 마스터 [${bestMaster.item_code || bestMaster.master_code}] '${bestMaster.item_name}'와 ${(highestMasterSim * 100).toFixed(0)}% 유사`);
    if (!bestLearned || highestMasterSim > highestLearnedSim) {
      similarityScore = Math.round(similarityScore * 0.5 + highestMasterSim * 100 * 0.5);
    }
  }

  // 최종 유사도 점수 클램핑 (0 ~ 100)
  similarityScore = Math.min(100, Math.max(30, similarityScore));
  const confidenceGrade: 'HIGH' | 'MEDIUM' | 'LOW' =
    similarityScore >= 90 ? 'HIGH' : similarityScore >= 70 ? 'MEDIUM' : 'LOW';

  return {
    item_type: itemType,
    item_type_label: itemType === 'MACHINED' ? '가공품' : '구매품(기성품)',
    standard_name: standardName,
    standard_material: standardMaterial,
    density,
    shape_type: shape.shape_type,
    shape_label: shape.shape_label,
    thickness: shape.thickness,
    width: shape.width,
    length: shape.length,
    diameter: shape.diameter,
    dimension_str: shape.dimension_str,
    calculated_weight_kg: calculatedWeight,
    treatment_code: treatmentCode,
    treatment_label: treatmentLabel,
    maker: matchedMaker,
    matched_master_id: bestMaster?.id || bestMaster?.master_id || bestLearned?.id,
    matched_master_code: bestMaster?.item_code || bestMaster?.master_code || (bestLearned ? 'LEARNED' : undefined),
    matched_master_name: bestMaster?.item_name || bestLearned?.standard_name || bestLearned?.item_name,
    matched_unit_price: bestMaster?.unit_price || learnedPrice,
    learned_unit_price: learnedPrice,
    learned_approval_count: learnedCount,
    learned_source: learnedSource,
    learned_date: learnedDate,
    learned_company_name: learnedCompany,
    similarity_score: similarityScore,
    confidence_grade: confidenceGrade,
    similarity_reasons: reasons
  };
}
