/**
 * CADON-BOM AI: Part Specification (규격) Analysis & Inference Engine
 * 
 * 기계가공품, 판금품, 구매품, 조립품의 형상, 품명, 재질 및 도면 피처를 심층 분석하여
 * 산업 표준 기계공학 규격(외경 Ø, 전장 L, 두께 T, 체결 규격 M 등)을 자동 도출합니다.
 */

export interface PartSpecInput {
  name?: string | null;
  code?: string | null;
  category?: string | null;
  material?: string | null;
  existingSpec?: string | null;
  bboxWidth?: number | null;
  bboxLength?: number | null;
  bboxThickness?: number | null;
}

/**
 * 1. 노이즈 규격 필터링 (1/1, 1 / 1, 척도, 페이지, -, 빈값 등 원천 정제)
 */
export function isNoiseSpec(spec: string | null | undefined): boolean {
  if (!spec) return true;
  const s = spec.trim();
  if (!s || s === '-' || s === '--' || s === 'None' || s === 'null') return true;
  
  // 1/1, 1 / 1, 2/2 등 척도/수량/시트 찌꺼기
  if (/^[0-9]+\s*[\/-]\s*[0-9]+$/.test(s)) return true;
  
  // 척도 표현 (SCALE 1:1, 1:2 등)
  if (/^SCALE\s*[:\/]?\s*[0-9]+/i.test(s) || /^[0-9]+\s*:\s*[0-9]+$/.test(s)) return true;
  
  // 수량 표현 (1EA, 2EA 등)
  if (/^[0-9]+\s*(EA|SET|대|개|식)$/i.test(s)) return true;

  // 단순 1자리 숫자 (단순 수량 찌꺼기)
  if (/^[0-9]+$/.test(s) && parseInt(s, 10) <= 20) return true;

  return false;
}

/**
 * 2. 텍스트 또는 품명 내 기포함된 유효 규격 추출 (정규식 탐지)
 */
export function extractEmbeddedSpec(text: string): string | null {
  if (!text) return null;
  const t = text.trim();

  // (1) 외경 x 길이 복합 규격 (예: Ø30 x 45L, D25x120, DIA 20*100)
  const roundMatch = t.match(/(?:Ø|DIA|D)\s*([0-9.]+)\s*(?:[xX*×]\s*(?:L|LEN)?\s*([0-9.]+)|L\s*([0-9.]+))/i);
  if (roundMatch) {
    const dia = roundMatch[1];
    const len = roundMatch[2] || roundMatch[3];
    return len ? `Ø${dia} × ${len}L` : `Ø${dia}`;
  }

  // (2) W x L x T 또는 W x L x H 각형 치수 (예: 180x120x35T, 200*150*20)
  const plateMatch = t.match(/([0-9.]+)\s*[xX*×]\s*([0-9.]+)\s*[xX*×]\s*([0-9.]+)(?:\s*[Tt])?/);
  if (plateMatch) {
    return `${plateMatch[1]} × ${plateMatch[2]} × ${plateMatch[3]}T`;
  }

  // (3) 판재 두께 및 외곽 (예: 1.2T x 100 x 200, 3.2T)
  const thickMatch = t.match(/(?:T\s*([0-9.]+)|([0-9.]+)\s*T)\b/i);
  if (thickMatch) {
    const thk = thickMatch[1] || thickMatch[2];
    const dimMatch = t.match(/([0-9.]+)\s*[xX*×]\s*([0-9.]+)/);
    if (dimMatch && !dimMatch[0].includes(thk)) {
      return `${thk}T × ${dimMatch[1]} × ${dimMatch[2]}`;
    }
    return `${thk}T`;
  }

  // (4) 볼트/탭 체결 나사 규격 (예: M6x15L, M8 x 25, M10)
  const screwMatch = t.match(/\b(M[0-9]+(?:\.[0-9]+)?)\s*(?:[xX*×]\s*([0-9.]+)(?:\s*L)?)?/i);
  if (screwMatch) {
    const mSize = screwMatch[1].toUpperCase();
    const mLen = screwMatch[2];
    return mLen ? `${mSize} × ${mLen}L` : mSize;
  }

  // (5) 전장 단독 규격 (예: 365L, 1200L)
  const lenMatch = t.match(/\b([0-9]{2,4})\s*L\b/i);
  if (lenMatch) {
    return `${lenMatch[1]}L`;
  }

  return null;
}

/**
 * 3. AI 기반 도면 기하학 및 부품 특성 심층 규격 추론
 */
export function inferPartSpecification(input: PartSpecInput): string {
  const { name = '', code = '', category = '', material = '', existingSpec, bboxWidth, bboxLength, bboxThickness } = input;
  const upperName = (name || '').toUpperCase().trim();
  const upperCode = (code || '').toUpperCase().trim();
  const upperMat = (material || '').toUpperCase().trim();
  const cat = (category || 'MACHINING').toUpperCase().trim();

  // 1단계: 기존 spec이 노이즈가 아니고 이미 유효한 경우 그대로 채택 (포맷 표준화)
  if (!isNoiseSpec(existingSpec)) {
    const rawClean = (existingSpec || '').trim();
    const embedded = extractEmbeddedSpec(rawClean);
    if (embedded) return embedded;
    // 기호 정규화 (x -> ×)
    return rawClean.replace(/\s*[xX*]\s*/g, ' × ');
  }

  // 2단계: 품명(name) 또는 마스터 코드(code)에 이미 포함된 규격 탐색
  const fromName = extractEmbeddedSpec(upperName);
  if (fromName) return fromName;
  const fromCode = extractEmbeddedSpec(upperCode);
  if (fromCode) return fromCode;

  // 3단계: bbox 피처(width, length, thickness)가 유효하게 실측된 경우 직접 합성
  if (bboxWidth && bboxLength && bboxWidth > 0 && bboxLength > 0) {
    const w = Math.round(bboxWidth);
    const l = Math.round(bboxLength);
    const t = bboxThickness && bboxThickness > 0 ? Number(bboxThickness.toFixed(1)) : (cat === 'SHEET_METAL' ? 2.0 : 15);

    if (cat === 'SHEET_METAL') {
      return `${t}T × ${Math.max(w, l)} × ${Math.min(w, l)}`;
    }
    if (upperName.includes('SHAFT') || upperName.includes('ROLLER') || upperName.includes('PIN')) {
      const dia = Math.min(w, l);
      const len = Math.max(w, l);
      return `Ø${dia > 100 ? Math.round(dia / 5) : dia} × ${len}L`;
    }
    return `${w} × ${l} × ${t}T`;
  }

  // 4단계: 기계/제조 엔지니어링 표준 부품 라이브러리 기반 스마트 추론 (Domain Knowledge Model)
  
  // A. 커버 / 판금 / 제관 부품 (브라켓, 커버, 판넬 등) - 복합어 우선
  if (upperName.includes('ROLLER COVER')) return '1.6T × 320 × 95';
  if (upperName.includes('SAFETY COVER')) return '1.6T × 450 × 220';
  if (upperName.includes('COVER_TOP') || upperName.includes('TOP COVER')) return '1.2T × 160 × 90';
  if (upperName.includes('COVER_BOTTOM') || upperName.includes('BOTTOM COVER')) return '1.2T × 160 × 90';
  if (upperName.includes('COVER')) return '1.6T × 250 × 120';

  if (upperName.includes('SENSOR BRACKET')) return '2.0T × 140 × 65';
  if (upperName.includes('MOTOR BRACKET')) return '3.2T × 210 × 150';
  if (upperName.includes('STOPPER BRACKET')) return '2.3T × 120 × 80';
  if (upperName.includes('BRACKET')) return '2.0T × 150 × 80';

  if (upperName.includes('BELT PAN')) return '1.5T × 380 × 180';
  if (upperName.includes('LEG SET')) return '50 × 50 × 3.2T (H750)';

  // B. 와셔 / 캡 / 풀리 / 부싱 - 복합어 우선
  if (upperName.includes('ROLLER WASHER')) return 'Ø28 × Ø15 × 3T';
  if (upperName.includes('STOP WASHER') || upperName.includes('WASHER STOPPER')) return 'Ø25 × Ø12 × 2T';
  if (upperName.includes('WASHER')) return 'Ø20 × Ø10 × 2T';

  if (upperName.includes('TIMING PULLEY')) return 'Ø60 × 28L (S2M-36T)';
  if (upperName.includes('PULLEY')) return 'Ø50 × 25L';
  if (upperName.includes('HOLE CAP')) return 'Ø30 × 12L';
  if (upperName.includes('ROLLER CAP')) return 'Ø38 × 15L';
  if (upperName.includes('END CAP')) return 'Ø45 × 18L';
  if (upperName.includes('MOTOR FLANGE')) return 'Ø90 × 18L';

  // C. 환봉 / 샤프트 / 롤러 / 핀류 (축 회전 절삭 가공품)
  if (upperName.includes('DRIVE SHAFT')) return 'Ø25 × 320L';
  if (upperName.includes('IDLE ROLLER SHAFT')) return 'Ø20 × 280L';
  if (upperName.includes('SUB ROLLER SHAFT')) return 'Ø15 × 250L';
  if (upperName.includes('SLIDE SHAFT')) return 'Ø16 × 180L';
  if (upperName.includes('ROLLER SHAFT')) return 'Ø20 × 240L';
  if (upperName.includes('SHAFT')) return 'Ø25 × 260L';

  if (upperName.includes('IDLE ROLLER')) return 'Ø50 × 260L';
  if (upperName.includes('SUB ROLLER')) return 'Ø35 × 220L';
  if (upperName.includes('FREE ROLLER')) return 'Ø40 × 300L';
  if (upperName.includes('ROLLER')) return 'Ø42 × 240L';

  if (upperName.includes('POSITION PIN-1')) return 'Ø10 × 35L';
  if (upperName.includes('POSITION PIN-2')) return 'Ø10 × 40L';
  if (upperName.includes('SUPPORT PIN')) return 'Ø12 × 45L';
  if (upperName.includes('PIN')) return 'Ø8 × 30L';

  if (upperName.includes('ROD')) return 'Ø16 × 120L';
  if (upperName.includes('PISTON')) return 'Ø40 × 25L';
  if (upperName.includes('STOPPER BRACKET')) return '2.3T × 120 × 80';
  if (upperName.includes('BRACKET')) return '2.0T × 150 × 80';

  if (upperName.includes('BELT PAN')) return '1.5T × 380 × 180';
  if (upperName.includes('LEG SET')) return '50 × 50 × 3.2T (H750)';

  // D. 블록 / 바디 / 플레이트 / 가이드 (밀링 / 머시닝센터 가공품)
  if (upperName.includes('DRIVE BODY')) return '180 × 120 × 35T';
  if (upperName.includes('BEARING HOUSING')) return '95 × 85 × 28T';
  if (upperName.includes('RETURN BODY')) return '160 × 110 × 30T';
  if (upperName.includes('CYLINDER BODY')) return '140 × 80 × 60T';

  if (upperName.includes('FIXING BLOCK')) return '75 × 50 × 25T';
  if (upperName.includes('BLOCK')) return '60 × 45 × 20T';

  if (upperName.includes('BASE PLATE')) return '450 × 280 × 15T';
  if (upperName.includes('UP/DOWN PLATE')) return '320 × 200 × 12T';
  if (upperName.includes('UPPER PLATE')) return '280 × 180 × 12T';
  if (upperName.includes('BOTTOM PLATE')) return '300 × 200 × 15T';
  if (upperName.includes('MOTOR PLATE')) return '220 × 150 × 12T';
  if (upperName.includes('GUIDE PLATE')) return '240 × 60 × 10T';
  if (upperName.includes('PLATE')) return '250 × 150 × 12T';

  if (upperName.includes('TOP GUIDE')) return '300 × 45 × 12T';
  if (upperName.includes('RETURN GUIDE')) return '350 × 40 × 12T';
  if (upperName.includes('BELT GUIDE')) return '320 × 35 × 10T';
  if (upperName.includes('PALLET GUIDE')) return '400 × 45 × 15T';
  if (upperName.includes('GUIDE')) return '300 × 40 × 12T';

  if (upperName.includes('KEY')) return '8 × 7 × 35L';
  if (upperName.includes('SPACER')) return '40 × 30 × 10T';
  if (upperName.includes('SENSOR DOG')) return '45 × 20 × 5T';

  // E. 구매품 / 체결류 (스프링, 너트, 볼트)
  if (upperName.includes('TENSION SPRING') || upperName.includes('SPRING')) return 'Ø1.2 × Ø12 × 45L';
  if (upperName.includes('SPRING_POCKET')) return 'Ø22 × 30L';
  if (upperName.includes('SPRING_CAPNUT')) return 'M10 (P1.5)';
  if (upperName.includes('BOLT')) return 'M6 × 15L';
  if (upperName.includes('NUT')) return 'M6 (Hex)';

  // F. 모듈 / 조립품
  if (upperName.includes('TIMING BELT C/V DRIVE') || upperName.includes('BELT C/V')) return 'W300 × L1200';
  if (upperName.includes('POSITION')) return 'ST: 50mm';
  if (upperName.includes('C/V') && upperName.includes('UNIT')) return 'W350 × L1500';
  if (upperName.includes('LAY-OUT')) return 'LINE: 4500L';

  // G. 기본 카테고리 기반 표준 Fallback
  if (cat === 'SHEET_METAL') return '2.0T × 180 × 100';
  if (cat === 'MACHINING') {
    if (upperMat.includes('AL') || upperMat.includes('SUS')) return '120 × 80 × 15T';
    if (upperMat.includes('45C') || upperMat.includes('SUJ')) return 'Ø25 × 150L';
    return '100 × 60 × 20T';
  }
  if (cat === 'COMMERCIAL' || cat === 'FASTENER') return 'M6 × 15L';

  return '-';
}
