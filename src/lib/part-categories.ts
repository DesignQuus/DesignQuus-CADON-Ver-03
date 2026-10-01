export interface PartCategoryDef {
  id: string;
  label: string;
  fullLabel: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  bgClass: string;
  group: 'FABRICATED' | 'COMMERCIAL' | 'SPECIAL' | 'ASSEMBLY';
  groupName: string;
  description: string;
  costFormulaHint: string;
  subItems: string[];
}

export const PART_CATEGORY_GROUPS = [
  { id: 'ALL', label: '전체' },
  { id: 'FABRICATED', label: '도면 가공/제작품', desc: '도면 형상 기반 자체 및 외주 가공' },
  { id: 'COMMERCIAL', label: '표준 기성 구매품', desc: '카탈로그 기반 시중 구매품' },
  { id: 'SPECIAL', label: '특수 조달 자재', desc: '해외 직수입품 및 고객사 지급 자재' },
  { id: 'ASSEMBLY', label: '조립 단위/모듈', desc: '서브 조립체 및 유닛 모듈' }
] as const;

export const PART_CATEGORIES: PartCategoryDef[] = [
  {
    id: 'MACHINING',
    label: '가공품',
    fullLabel: '기계 가공품 (절삭/선반/밀링)',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    borderClass: 'border-blue-300',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    group: 'FABRICATED',
    groupName: '도면 가공/제작품',
    description: 'CNC 선반, MCT 밀링, 연마, 방전 등 환봉 및 블록 절삭 가공품',
    costFormulaHint: '(소재중량 × kg단가) + (절삭시간 × 가공임율) + 열처리/표면처리비',
    subItems: ['샤프트', '롤러', '블록', '플랜지', '보스', '핀', '부싱', '기어블랭크', '정밀절삭']
  },
  {
    id: 'SHEET_METAL',
    label: '판금/제관',
    fullLabel: '판금 / 제관품 (레이저/절곡/용접)',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    borderClass: 'border-cyan-300',
    textClass: 'text-cyan-700',
    bgClass: 'bg-cyan-100',
    group: 'FABRICATED',
    groupName: '도면 가공/제작품',
    description: '레이저 절단, V커팅 절곡, 제관용접, 프레임 구조물 및 커버류',
    costFormulaHint: '(원판면적 × 비중 × 단가) + 레이저절단비 + 절곡비 + 용접공수 + 분체도장',
    subItems: ['브라켓', '커버', '베이스플레이트', '프레임용접', '덕트', '호퍼', '판금케이스', '패널']
  },
  {
    id: 'INJECTION',
    label: '사출/성형',
    fullLabel: '사출 / 성형품 (플라스틱/고무/압출)',
    badgeClass: 'bg-pink-100 text-pink-800 border-pink-300',
    borderClass: 'border-pink-300',
    textClass: 'text-pink-700',
    bgClass: 'bg-pink-100',
    group: 'FABRICATED',
    groupName: '도면 가공/제작품',
    description: '플라스틱 금형 사출품, 고무 몰딩, 엔프라(POM/MC/PEEK), AL 압출재',
    costFormulaHint: '(원료수지비 + 사출임율) + (금형비 ÷ 상각수량) 또는 단중(m당) 단가',
    subItems: ['사출기구물', 'POM/아세탈', 'MC나일론', 'PEEK', '고무 몰딩/오링', '우레탄', 'AL 압출 프로파일']
  },
  {
    id: 'MECHANICAL',
    label: '기계요소',
    fullLabel: '기계요소 구동품 (베어링/LM/볼스크류/커플링)',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
    borderClass: 'border-teal-300',
    textClass: 'text-teal-700',
    bgClass: 'bg-teal-100',
    group: 'COMMERCIAL',
    groupName: '표준 기성 구매품',
    description: 'LM가이드, 볼스크류, 베어링, 플렉시블 커플링, 기어, 체인, 벨트/풀리 등 구동품',
    costFormulaHint: '카탈로그 표준 소비자가격(MSRP) × 대리점 공급률(DC%)',
    subItems: ['LM가이드', '볼스크류', '볼/롤러베어링', '플렉시블커플링', '기어/랙피니언', '타이밍풀리/벨트', '체인/스프라켓', '쇼바/완충기']
  },
  {
    id: 'COMMERCIAL',
    label: '규격철물',
    fullLabel: '표준 규격품 / 체결류 (볼트/너트/와셔/핀)',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderClass: 'border-emerald-300',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-100',
    group: 'COMMERCIAL',
    groupName: '표준 기성 구매품',
    description: '육각/렌치볼트, 너트, 평/스프링와셔, 세트스크류, 다웰핀, 평행키 등 체결철물',
    costFormulaHint: '시중 단가표(M규격/길이별 박스단가) × 소요 수량',
    subItems: ['렌치볼트', '육각볼트', '육각너트', '평/스프링와셔', '세트스크류(무두)', '다웰핀', '평행키', '아이볼트', '리벳']
  },
  {
    id: 'ELECTRICAL',
    label: '전장/공압',
    fullLabel: '전장 / 공압 / 제어품 (모터/실린더/센서/PLC)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    borderClass: 'border-amber-300',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-100',
    group: 'COMMERCIAL',
    groupName: '표준 기성 구매품',
    description: '서보모터, 감속기, 에어 실린더, 솔레노이드 밸브, 센서, PLC, 인버터, 공압 피팅',
    costFormulaHint: '제조사 표준 소비자가격 × 프로젝트 특약 공급률',
    subItems: ['서보모터', '감속기', '에어 실린더', '솔레노이드 밸브', '센서(포토/근접)', 'PLC/IO모듈', '인버터', '공압 피팅', '진공패드']
  },
  {
    id: 'CASTING',
    label: '주조품',
    fullLabel: '주조 / 주물 / 단조품 (Casting / Forging)',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    borderClass: 'border-orange-300',
    textClass: 'text-orange-700',
    bgClass: 'bg-orange-100',
    group: 'FABRICATED',
    groupName: '도면 가공/제작품',
    description: '사형주조, 정밀주조, 다이캐스팅, 단조품 (기어박스 몸체, 주물 베이스 등)',
    costFormulaHint: '(소재 용해 중량 × 주물단가) + (목형/금형비 상각) + 2차 정밀가공비',
    subItems: ['기어박스 하우징', '주물 베이스', '대형 프레임', '단조 플랜지', '주물 브라켓', '다이캐스팅 몸체']
  },
  {
    id: 'IMPORTED',
    label: '해외수입',
    fullLabel: '해외 직수입품 (미스미 일본/독일/미국 외산)',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-300',
    borderClass: 'border-violet-300',
    textClass: 'text-violet-700',
    bgClass: 'bg-violet-100',
    group: 'SPECIAL',
    groupName: '특수 조달 자재',
    description: '해외 제조사 직발주 또는 해외 수입 조달품 (환율, 관세, 통관/운임 반영)',
    costFormulaHint: '[외화단가 × 기준환율] × (1 + 관세율 + 운임/통관율) × 수입마진율',
    subItems: ['미스미 일본 직수입', '외산 THK/SMC', '수입 정밀 계측기', '하모닉 드라이브', '외산 특수 밸브']
  },
  {
    id: 'SUPPLIED',
    label: '고객사급',
    fullLabel: '고객 지급품 (발주처 무상/유상 지급자재)',
    badgeClass: 'bg-slate-200 text-slate-800 border-slate-400',
    borderClass: 'border-slate-400',
    textClass: 'text-slate-700',
    bgClass: 'bg-slate-200',
    group: 'SPECIAL',
    groupName: '특수 조달 자재',
    description: '발주처/고객사가 사전에 구매하여 무상 지급하는 부품 (자재비 0원 처리)',
    costFormulaHint: '자재비 0원 (자재비 완전 제외, 단순 장착/배선 조립비만 계상)',
    subItems: ['고객 지급 모터', '발주처 사급 컨트롤러', '고객사 전용 센서', '무상 사급 자재', '지급 통신모듈']
  },
  {
    id: 'ASSEMBLY',
    label: '조립품',
    fullLabel: '조립품 / 모듈 (Sub-Assembly / Module)',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    borderClass: 'border-indigo-300',
    textClass: 'text-indigo-700',
    bgClass: 'bg-indigo-100',
    group: 'ASSEMBLY',
    groupName: '조립 단위/모듈',
    description: '하위 부품들로 조립된 서브 어셈블리 또는 모듈형 유닛',
    costFormulaHint: '하위 부품 원가 합산(Roll-up) + 유닛 조립 공수(M/H) × 조립 임율',
    subItems: ['서브 어셈블리', '구동 유닛 모듈', '스테이션 조립체', '메인 프레임 유닛', '컨베이어 조립체']
  }
];

export function getPartCategoryLabel(catId?: string): string {
  if (!catId) return '미분류';
  const found = PART_CATEGORIES.find(c => c.id === catId);
  if (found) return found.label;
  if (catId === 'FASTENER') return '규격철물';
  return catId;
}

export function getPartCategoryFullLabel(catId?: string): string {
  if (!catId) return '미분류';
  const found = PART_CATEGORIES.find(c => c.id === catId);
  if (found) return found.fullLabel;
  if (catId === 'FASTENER') return '표준 규격품 / 체결류 (볼트/너트/와셔/핀)';
  return catId;
}

export function getPartCategoryBadgeClass(catId?: string): string {
  if (!catId) return 'bg-slate-100 text-slate-700 border-slate-300';
  const found = PART_CATEGORIES.find(c => c.id === catId);
  if (found) return found.badgeClass;
  if (catId === 'FASTENER') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

export function normalizePartCategoryFromText(rawText: string): string {
  if (!rawText) return 'MACHINING';
  const t = rawText.toString().trim();
  if (t === 'INJECTION' || t.includes('사출') || t.includes('성형') || t.includes('몰딩') || t.includes('압출') || t.includes('플라스틱') || t.includes('엔프라')) {
    return 'INJECTION';
  }
  if (t === 'MECHANICAL' || t.includes('기계요소') || t.includes('구동') || t.includes('베어링') || t.includes('LM') || t.includes('볼스크류') || t.includes('커플링') || t.includes('풀리') || t.includes('스프라켓')) {
    return 'MECHANICAL';
  }
  if (t === 'IMPORTED' || t.includes('수입') || t.includes('해외') || t.includes('외산') || t.includes('미스미') || t.includes('일본') || t.includes('독일')) {
    return 'IMPORTED';
  }
  if (t === 'SUPPLIED' || t.includes('사급') || t.includes('지급') || t.includes('무상') || t.includes('고객지급')) {
    return 'SUPPLIED';
  }
  if (t === 'SHEET_METAL' || t.includes('판금') || t.includes('제관') || t.includes('레이저') || t.includes('절곡') || t.includes('용접')) {
    return 'SHEET_METAL';
  }
  if (t === 'CASTING' || t.includes('주조') || t.includes('주물') || t.includes('단조')) {
    return 'CASTING';
  }
  if (t === 'COMMERCIAL' || t === 'FASTENER' || t.includes('철물') || t.includes('규격') || t.includes('볼트') || t.includes('너트') || t.includes('와셔') || t.includes('체결')) {
    return 'COMMERCIAL';
  }
  if (t === 'ELECTRICAL' || t.includes('전장') || t.includes('전기') || t.includes('전자') || t.includes('공압') || t.includes('모터') || t.includes('실린더') || t.includes('센서') || t.includes('밸브') || t.includes('PLC')) {
    return 'ELECTRICAL';
  }
  if (t === 'ASSEMBLY' || t.includes('조립') || t.includes('모듈') || t.includes('어셈블리') || t.toLowerCase().includes('assy')) {
    return 'ASSEMBLY';
  }
  if (t === 'MACHINING' || t.includes('가공') || t.includes('절삭') || t.includes('선반') || t.includes('밀링') || t.includes('CNC') || t.includes('MCT')) {
    return 'MACHINING';
  }
  return 'MACHINING';
}
