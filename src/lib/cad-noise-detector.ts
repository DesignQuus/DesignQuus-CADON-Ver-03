/**
 * 🧹 CAD 도면 비부품 주석/표제란 노이즈 감지 및 사내 블랙리스트 학습 엔진
 * (Unicode artifacts, Title block metadata, Assembly notes, Sheet sizes 등 필터링)
 */

// 1. 시스템 내장 기본 노이즈 정규식 패턴 목록
export const DEFAULT_NOISE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // 유니코드 특수문자/치수 기호 왜곡 (예: 10U+00B0, U+00B0)
  { pattern: /\b\d*U\+[0-9A-Fa-f]{4}\b/i, reason: '유니코드 특수문자 깨짐 (각도 기호 등)' },
  { pattern: /%%[CcDdPp]/i, reason: 'CAD 특수 제어 코드 (%%C, %%D 등)' },

  // 조립 수량 및 세트 주기 (예: 2 SET, 1 SET, Q'TY, REF)
  { pattern: /^\d+\s*SET$/i, reason: '도면 조립 세트 수량 표기 (부품 아님)' },
  { pattern: /^Q'?TY$/i, reason: '수량 라벨 헤더 (부품 아님)' },
  { pattern: /^REF\.?$/i, reason: '참조 주기 표기 (부품 아님)' },

  // 도면 방향 및 뷰/섹션 라벨 (예: 1.DIR, 2.P N, SPEED, VIEW A-A, SECTION B-B)
  { pattern: /^\d+\.DIR$/i, reason: '도면 방향 지시 라벨' },
  { pattern: /^\d+\.P\s*N$/i, reason: '도면 포인트 라벨' },
  { pattern: /^SPEED$/i, reason: '도면 운전 속도 표기' },
  { pattern: /^(VIEW|SECTION|DETAIL)\s+[A-Z](-[A-Z])?$/i, reason: '도면 상세도/단면도 뷰 라벨' },

  // 도면 용지 규격 (예: A0, A1, A2, A3, A4)
  { pattern: /^A[0-4]$/i, reason: '도면 용지 규격 표기 (A0~A4)' },

  // 표제란 공통 라벨 (예: PROJECT NO, DRAWN BY, DATE, SCALE, DWG NO, TITLE)
  { pattern: /^PROJECT\s*(NO|NAME)?\.?$/i, reason: '도면 표제란 관리 라벨 (PROJECT NO)' },
  { pattern: /^(DRAWN|CHECKED|APPROVED)\s*BY$/i, reason: '도면 서명란 라벨' },
  { pattern: /^DWG\s*NO\.?$/i, reason: '도면 번호 헤더 라벨' },
  { pattern: /^SCALE$/i, reason: '도면 척도 라벨' },
  { pattern: /^DATE$/i, reason: '작성일자 라벨' },

  // 사내 설계자/작성자 인명 패턴 (실제 도면에서 추출된 '이경중' 등 2~4글자 한글 인명 단독 표기)
  { pattern: /^(이경중|김철수|홍길동|박영희|최진호|정대현)$/, reason: '설계자 성명 표기 (표제란 인명)' }
];

// 2. 사내 노이즈 블랙리스트 영구 저장소 (로컬 스토리지 + 메모리 캐시)
const STORAGE_KEY = 'cadon_cad_noise_blacklist_keywords';

// 사내 노이즈 블랙리스트 등록 금지 단어 (실가공품 부품명, 재질명, 기본 단위 보호)
const FORBIDDEN_KEYWORDS = new Set([
  'SS400', 'S45C', 'SS41', 'AL6061', 'AL5052', 'SUS304', 'SUS316', 'FC250', 'FCD450', 'SKD11',
  'UNKNOWN', 'EA', 'SET', 'PCS', '-', '--', '---', '.', '/',
  'SHAFT', 'COVER', 'BRACKET', 'PLATE', 'BLOCK', 'FLANGE', 'ROLLER', 'PIN', 'BOLT', 'NUT', 'WASHER',
  '샤프트', '커버', '브라켓', '플레이트', '블록', '플랜지', '롤러', '볼트', '너트', '와셔'
]);

export function getCustomNoiseKeywords(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: string[] = JSON.parse(raw);
    // 금지 단어(재질, 가공품명)가 혹시 저장되어 있다면 필터링하여 안전하게 반환
    return list.filter((k) => k && k.length >= 2 && !FORBIDDEN_KEYWORDS.has(k.toUpperCase()));
  } catch {
    return [];
  }
}

export function addCustomNoiseKeyword(keyword: string): boolean {
  if (typeof window === 'undefined') return false;
  const clean = keyword.trim().toUpperCase();
  if (!clean || clean.length < 2) return false;
  if (FORBIDDEN_KEYWORDS.has(clean)) {
    console.warn(`[보호 가드] '${clean}'은(는) 표준 재질/가공 부품명이므로 노이즈 블랙리스트에 등록할 수 없습니다.`);
    return false;
  }
  try {
    const current = getCustomNoiseKeywords();
    if (!current.includes(clean)) {
      const updated = [...current, clean];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return true;
  } catch (e) {
    console.warn('Failed to add custom noise keyword:', e);
    return false;
  }
}

export function clearCustomNoiseKeywords(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear custom noise keywords:', e);
  }
}

export function removeCustomNoiseKeyword(keyword: string): void {
  if (typeof window === 'undefined') return;
  const clean = keyword.trim().toUpperCase();
  try {
    const current = getCustomNoiseKeywords();
    const updated = current.filter((k) => k !== clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to remove custom noise keyword:', e);
  }
}

// 3. 품목 노이즈 종합 판정 함수
export interface CadNoiseCheckResult {
  isNoise: boolean;
  reason?: string;
  matchedRule?: string;
}

export function isCadNoiseItem(line: {
  partNo?: string;
  partName?: string;
  material?: string;
  specification?: string;
}): CadNoiseCheckResult {
  const pNo = (line.partNo || '').trim();
  const pName = (line.partName || '').trim();
  const mat = (line.material || '').trim();
  const spec = (line.specification || '').trim();

  const combinedTargets = [pNo, pName, mat, spec].filter(Boolean);

  // A. 사내 학습된 블랙리스트 대조 (단, 표준 가공 부품명/재질이 포함된 진짜 부품은 블랙리스트 매칭 차단)
  const customKeywords = getCustomNoiseKeywords();
  for (const text of combinedTargets) {
    const upper = text.toUpperCase();
    const isProtectedFabrication = Array.from(FORBIDDEN_KEYWORDS).some(f => upper.includes(f) && f.length >= 3);
    if (!isProtectedFabrication && customKeywords.includes(upper)) {
      return {
        isNoise: true,
        reason: `사내 학습 블랙리스트 등록 키워드 [${upper}]`,
        matchedRule: 'CUSTOM_BLACKLIST'
      };
    }
  }

  // B. 시스템 기본 룰셋 정규식 대조
  for (const text of combinedTargets) {
    for (const rule of DEFAULT_NOISE_PATTERNS) {
      if (rule.pattern.test(text)) {
        return {
          isNoise: true,
          reason: rule.reason,
          matchedRule: rule.pattern.toString()
        };
      }
    }
  }

  // C. 복합 조건: 도번이나 품명이 단독 용지규격(A3 등)이면서 재질도 A3인 경우
  if ((pNo.toUpperCase() === 'A3' || pName.toUpperCase() === 'A3') && mat.toUpperCase() === 'A3') {
    return {
      isNoise: true,
      reason: '도면 용지 규격 표기 (A3 Sheet Size)',
      matchedRule: 'SHEET_SIZE_A3'
    };
  }

  return { isNoise: false };
}
