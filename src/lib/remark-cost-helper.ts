/**
 * remark-cost-helper.ts
 * 별도비용(추가비1, 2, 3) 및 메모의 구조화(JSON 직렬화/역직렬화)와
 * 구버전 문자열 텍스트의 무손실 하위 호환 파싱을 담당하는 유틸리티
 */

export interface ExtraCostItem {
  name: string;
  amount: number;
}

export interface CostDiffInfo {
  engineSuggestedPrice: number; // 엔진 최초 제안 공급단가
  confirmedPrice: number;        // 실무자 확정 공급단가
  delta: number;                 // confirmedPrice - engineSuggestedPrice
  deltaPercent: number;          // 오차율 (%)
  recordedAt?: string;
}

export interface StructuredRemark {
  text: string;
  extraCosts: ExtraCostItem[];
  costDiff?: CostDiffInfo;
}

/**
 * DB에서 읽어온 remark 문자열을 StructuredRemark 객체로 안전하게 파싱합니다.
 * JSON 형식이면 직접 파싱하고, 구버전 일반 텍스트이거나 파싱 실패 시 안전하게 fallback 처리합니다.
 */
export function parseRemark(rawRemark: string | null | undefined): StructuredRemark {
  if (!rawRemark) {
    return { text: '', extraCosts: [] };
  }

  const trimmed = String(rawRemark).trim();

  // 1. JSON 포맷 파싱 시도
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const extraCosts: ExtraCostItem[] = [];

      if (Array.isArray(parsed.extraCosts)) {
        for (const ec of parsed.extraCosts) {
          const amt = Number(ec.amount) || 0;
          const name = String(ec.name || '').trim();
          if (name && amt > 0) {
            extraCosts.push({ name, amount: amt });
          }
        }
      }

      let costDiff: CostDiffInfo | undefined;
      if (parsed.costDiff && typeof parsed.costDiff === 'object') {
        const engPrice = Number(parsed.costDiff.engineSuggestedPrice) || 0;
        const confPrice = Number(parsed.costDiff.confirmedPrice) || 0;
        const delta = Number(parsed.costDiff.delta) || (confPrice - engPrice);
        const deltaPercent = Number(parsed.costDiff.deltaPercent) || (engPrice > 0 ? Number(((delta / engPrice) * 100).toFixed(1)) : 0);
        costDiff = {
          engineSuggestedPrice: engPrice,
          confirmedPrice: confPrice,
          delta,
          deltaPercent,
          recordedAt: parsed.costDiff.recordedAt || undefined
        };
      }

      return {
        text: String(parsed.text || parsed.memo || '').trim(),
        extraCosts,
        costDiff
      };
    } catch {
      // JSON 파싱 실패 시 아래 텍스트 파서로 fallback
    }
  }

  // 2. 구버전 문자열 포맷 하위 호환 파서
  // 예: "일반메모 | [별도추가비] 도금비: ₩10,000, 운송비: ₩20,000"
  const extraTagMatch = trimmed.match(/\[별도추가비\]\s*(.+)$/i);
  if (extraTagMatch) {
    const extraString = extraTagMatch[1];
    // 태그 앞부분의 본문 메모 추출
    const baseText = trimmed
      .replace(/\|\s*\[별도추가비\].*$/i, '')
      .replace(/\[별도추가비\].*$/i, '')
      .trim();

    const extraCosts: ExtraCostItem[] = [];
    const items = extraString.split(/[,|]/);

    for (const it of items) {
      const parts = it.split(/[:：]/);
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const amtStr = parts[1].replace(/[^\d]/g, '');
        const amount = Number(amtStr) || 0;
        if (name && amount > 0) {
          extraCosts.push({ name, amount });
        }
      }
    }

    return { text: baseText, extraCosts };
  }

  // 3. 단순 일반 텍스트
  return { text: trimmed, extraCosts: [] };
}

/**
 * 텍스트 메모와 별도비용 배열을 DB에 저장 가능한 포맷으로 직렬화합니다.
 * 별도비용이 없으면 일반 텍스트를 그대로 반환하고, 있으면 JSON 구조화 문자열로 변환합니다.
 */
export function stringifyRemark(
  text: string | null | undefined,
  extraCosts?: ExtraCostItem[] | null,
  costDiff?: CostDiffInfo | null
): string {
  const cleanText = String(text || '').trim();
  const validExtras = (extraCosts || []).filter(
    (e) => e && typeof e.name === 'string' && e.name.trim() !== '' && Number(e.amount) > 0
  );

  let validCostDiff: CostDiffInfo | undefined;
  if (costDiff && (costDiff.engineSuggestedPrice > 0 || costDiff.confirmedPrice > 0)) {
    validCostDiff = {
      engineSuggestedPrice: Math.round(Number(costDiff.engineSuggestedPrice) || 0),
      confirmedPrice: Math.round(Number(costDiff.confirmedPrice) || 0),
      delta: Math.round(Number(costDiff.delta) || (Number(costDiff.confirmedPrice) - Number(costDiff.engineSuggestedPrice))),
      deltaPercent: Number((costDiff.deltaPercent || 0).toFixed(1)),
      recordedAt: costDiff.recordedAt || new Date().toISOString()
    };
  }

  if (validExtras.length === 0 && !validCostDiff) {
    return cleanText;
  }

  return JSON.stringify({
    text: cleanText,
    extraCosts: validExtras.map((e) => ({
      name: e.name.trim(),
      amount: Math.round(Number(e.amount))
    })),
    ...(validCostDiff ? { costDiff: validCostDiff } : {})
  });
}
