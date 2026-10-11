'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getClientCache, setClientCache, isCacheFresh, fetchWithCache } from '@/lib/cacheStore';
import {
  Database, Plus, Upload, Search, Download, Trash2, CheckCircle2,
  RefreshCw, FileSpreadsheet, ArrowLeft, Sliders, DollarSign,
  AlertCircle, Layers, X, Scissors, Flame, Sparkles, Wrench, Percent, Factory, ShieldCheck,
  Target, Calculator, TrendingUp, ArrowRight, CheckSquare, Square, Save, ChevronDown, Tag,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, RotateCcw, Clock
} from 'lucide-react';

import LearnedPriceHistoryDrawer from '@/components/masters/LearnedPriceHistoryDrawer';

import {
  PART_CATEGORIES,
  getPartCategoryLabel,
  getPartCategoryBadgeClass,
  getPartCategoryTextClass,
  getPartCategorySubDetail,
  normalizePartCategoryFromText,
  detectPartSubItem
} from '@/lib/part-categories';
import PartCategoryPickerModal from '@/components/common/PartCategoryPickerModal';
import { inferPartSpecification, isNoiseSpec } from '@/lib/part-spec-analyzer';

const MATERIAL_NAMES: Record<string, string> = {
  'SS400': '일반구조용 탄소강',
  'S45C': '기계구조용 탄소강',
  'SCM440': '크롬몰리브덴강 (열처리용)',
  'SUS304': '스테인리스강 (일반내식)',
  'SUS316': '스테인리스강 (고내식/내약품)',
  'AL6061': '알루미늄 합금 (가공용)',
  'AL5052': '알루미늄 판재 (절곡용)',
  'FC250': '회주철 (기계베이스/하우징 주물)',
  'FCD450': '구상흑연주철 (고강도 주물)',
  'SKD11': '냉간금형용 합금공구강',
  'BsBM': '쾌삭 황동 / 동합금',
  'MC-NYLON': 'MC 나일론 (엔지니어링 플라스틱)',
  'POM': '아세탈 (POM 폴리아세탈)'
};

const CATEGORY_STAT_KEYS: Record<string, 'machining' | 'sheetMetal' | 'casting' | 'injection' | 'commercial' | 'mechanical' | 'electrical' | 'imported' | 'supplied' | 'assembly'> = {
  MACHINING: 'machining',
  SHEET_METAL: 'sheetMetal',
  CASTING: 'casting',
  INJECTION: 'injection',
  COMMERCIAL: 'commercial',
  FASTENER: 'commercial',
  MECHANICAL: 'mechanical',
  ELECTRICAL: 'electrical',
  IMPORTED: 'imported',
  SUPPLIED: 'supplied',
  ASSEMBLY: 'assembly'
};

// 엑셀 스타일 열 너비 조절 설정 (기본값 및 최소 한도)
export type MasterColKey =
  | 'checkbox'
  | 'no'
  | 'code'
  | 'name'
  | 'material'
  | 'matCost'
  | 'procCost'
  | 'treatment'
  | 'spec'
  | 'category'
  | 'price'
  | 'action';

const DEFAULT_MASTER_COL_WIDTHS: Record<MasterColKey, number> = {
  checkbox: 44,
  no: 56,
  code: 175, // 마스터 코드 (PO-BE1632-P010 등 16자리 코드 100% 온전 표출 & 40px 여백)
  name: 250, // 품명 뒤 40px 여백
  material: 115, // 재질 (사용자 지정 최적 간격 기준)
  matCost: 210, // 소재 시세 (우측 pr-6 패딩으로 다음 열과 40px 균일 간격)
  procCost: 240, // 가공 단가 · 표준 공임 (우측 pr-6 패딩으로 다음 열과 40px 균일 간격)
  treatment: 195, // 후처리 (우측 pr-6 패딩으로 다음 열과 40px 균일 간격)
  spec: 175, // 규격 (Ø30 × 45L, 1.2T 등 와이드 여백 활용 최적 표출)
  category: 215, // 부품 분류 및 대표 품목
  price: 165, // 사내 기준단가 (우측 pr-6 패딩으로 관리 열과 40px 균일 간격)
  action: 60, // 관리 열
};

const MIN_MASTER_COL_WIDTHS: Record<MasterColKey, number> = {
  checkbox: 38,
  no: 44,
  code: 110,
  name: 130,
  material: 75,
  matCost: 150,
  procCost: 160,
  treatment: 140,
  spec: 110,
  category: 140,
  price: 100,
  action: 48,
};

const MASTER_COL_INDEX_MAP: Record<MasterColKey, number> = {
  checkbox: 0,
  no: 1,
  code: 2,
  name: 3,
  material: 4,
  matCost: 5,
  procCost: 6,
  treatment: 7,
  spec: 8,
  category: 9,
  price: 10,
  action: 11,
};

// 💡 3단계 담당자 눈높이: 실시간 단가 영향도 시뮬레이션용 대표 5대 부품
const BENCHMARK_PARTS = [
  {
    id: 0,
    name: 'MOTOR BRACKET',
    type: 'SHEET_METAL' as const,
    material: 'AL6061',
    spec: '660x400x10T',
    weightKg: 7.13,
    cuttingLengthM: 2.12,
    bendingCount: 2,
    pierceCount: 4,
    matKgRate: 5500,
    categoryLabel: '판금 절곡'
  },
  {
    id: 1,
    name: 'MOTOR SHAFT',
    type: 'MACHINING' as const,
    material: 'S45C',
    spec: 'Ø17 x L295',
    weightKg: 0.53,
    cuttingLengthM: 0.30,
    bendingCount: 0,
    pierceCount: 0,
    matKgRate: 1650,
    categoryLabel: '절삭 환봉'
  },
  {
    id: 2,
    name: 'BASE PLATE',
    type: 'SHEET_METAL' as const,
    material: 'SS400',
    spec: '620x375x3T',
    weightKg: 5.48,
    cuttingLengthM: 1.99,
    bendingCount: 0,
    pierceCount: 2,
    matKgRate: 1450,
    categoryLabel: '평판 레이저'
  },
  {
    id: 3,
    name: 'SENSOR BRACKET',
    type: 'SHEET_METAL' as const,
    material: 'AL6061',
    spec: '220x140x2T',
    weightKg: 0.17,
    cuttingLengthM: 0.72,
    bendingCount: 2,
    pierceCount: 4,
    matKgRate: 5500,
    categoryLabel: '판금 소형'
  },
  {
    id: 4,
    name: 'MOTOR END CAP',
    type: 'MACHINING' as const,
    material: 'S45C',
    spec: 'Ø25 x L35',
    weightKg: 0.14,
    cuttingLengthM: 0.05,
    bendingCount: 0,
    pierceCount: 0,
    matKgRate: 1650,
    categoryLabel: '절삭 소형'
  }
];

interface MasterProduct {
  id: string;
  master_code: string;
  standard_name: string;
  category: string;
  specification: string;
  material: string;
  unit: string;
  unit_price: number;
  price_type: string;
  created_at: string;
}

interface PartCostBreakdownInfo {
  materialRatePerKg: number;
  materialCost: number;
  processName: string;
  processRateStr: string;
  processCost: number;
  cycleTimeHours: number;
  treatmentName: string;
  treatmentCost: number;
}

function getPartCostBreakdown(
  it: MasterProduct,
  matRates: Record<string, number>,
  procRates: Record<string, number>
): PartCostBreakdownInfo {
  const mat = (it.material || 'SS400').toUpperCase().trim();
  const matRate = matRates[mat] || (mat.includes('SUS') ? 5500 : mat.includes('AL') ? 6500 : mat.includes('45C') ? 2200 : 1800);
  const cat = it.category || 'MACHINING';
  const unitPrice = it.unit_price || 0;

  let processName = 'CNC 선반';
  let processRateStr = '40,000원/h';
  let hourlyRate = procRates['HOURLY_LATHE_RATE'] || 40000;
  let treatmentName = '일반 방청';

  if (cat === 'SHEET_METAL') {
    processName = '레이저/절곡';
    const laserM = procRates['SHEET_LASER_PER_METER'] || 1800;
    processRateStr = `${laserM.toLocaleString()}원/m`;
    hourlyRate = procRates['HOURLY_WELDING_RATE'] || 38000;
    treatmentName = mat.includes('AL') ? '아노다이징' : mat.includes('SUS') ? '산세/연마' : '분체도장';
  } else if (cat === 'COMMERCIAL' || cat === 'FASTENER') {
    processName = '규격 조달';
    processRateStr = '마크업 8%';
    hourlyRate = 0;
    treatmentName = '아연도금(기본)';
  } else if (cat === 'CASTING') {
    processName = '주조 성형';
    const castR = procRates['CASTING_PER_KG_RATE'] || 2500;
    processRateStr = `${castR.toLocaleString()}원/kg`;
    hourlyRate = procRates['HOURLY_MACHINE_RATE'] || 45000;
    treatmentName = '쇼트블라스트';
  } else if (cat === 'INJECTION') {
    processName = '사출 성형';
    processRateStr = '32,000원/h';
    hourlyRate = 32000;
    treatmentName = '무도장(소재색)';
  } else if (cat === 'ASSEMBLY') {
    processName = '조립/검수';
    const assyR = procRates['HOURLY_ASSEMBLY_RATE'] || 35000;
    processRateStr = `${assyR.toLocaleString()}원/h`;
    hourlyRate = assyR;
    treatmentName = '최종 포장';
  } else {
    // MACHINING
    const sName = (it.standard_name || '').toUpperCase();
    if (sName.includes('SHAFT') || sName.includes('PIN') || sName.includes('ROLLER')) {
      processName = 'CNC 선반';
      const latheR = procRates['HOURLY_LATHE_RATE'] || 40000;
      processRateStr = `${latheR.toLocaleString()}원/h`;
      hourlyRate = latheR;
      treatmentName = mat.includes('45C') ? 'Q/T 열처리' : mat.includes('AL') ? '아노다이징' : '흑착색(방청)';
    } else {
      processName = 'MCT 밀링';
      const machR = procRates['HOURLY_MACHINE_RATE'] || 45000;
      processRateStr = `${machR.toLocaleString()}원/h`;
      hourlyRate = machR;
      treatmentName = mat.includes('AL') ? '아노다이징' : mat.includes('SUS') ? '버프연마' : '니켈도금';
    }
  }

  let materialCost = 0;
  let processCost = 0;
  let treatmentCost = 0;
  let cycleTimeHours = 0;

  if (unitPrice > 0) {
    if (cat === 'COMMERCIAL' || cat === 'FASTENER') {
      materialCost = Math.round(unitPrice * 0.92);
      processCost = Math.round(unitPrice * 0.08);
      treatmentCost = 0;
    } else {
      materialCost = Math.round(unitPrice * 0.28);
      processCost = Math.round(unitPrice * 0.48);
      treatmentCost = Math.round(unitPrice * 0.08);
      if (hourlyRate > 0) {
        cycleTimeHours = Number((processCost / hourlyRate).toFixed(1));
      }
    }
  }

  return {
    materialRatePerKg: matRate,
    materialCost,
    processName,
    processRateStr,
    processCost,
    cycleTimeHours,
    treatmentName,
    treatmentCost
  };
}

export default function MasterDataManagerPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'learned' | 'settings'>('products');
  const [learnedItems, setLearnedItems] = useState<any[]>([]);
  const [loadingLearned, setLoadingLearned] = useState<boolean>(false);
  const [learnedSearchQuery, setLearnedSearchQuery] = useState<string>('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);

  const fetchLearnedItems = async (isSilent = false) => {
    if (!isSilent && learnedItems.length === 0) {
      setLoadingLearned(true);
    }
    try {
      const res = await apiFetch('/api/manual-prices?mode=ALL_LEARNED');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.list)) {
          setLearnedItems(data.list);
        }
      }
    } catch (err) {
      console.warn('자가학습 풀 로딩 오류:', err);
    } finally {
      setLoadingLearned(false);
    }
  };

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [learnedFilterTab, setLearnedFilterTab] = useState<'ALL' | 'UNREGISTERED' | 'REGISTERED'>('ALL');

  // ⚡ SSR 하이드레이션 불일치 방지: 초기 상태는 서버/클라이언트 동일 기본값으로 유지하고, 마운트 직후(useEffect) 캐시를 즉각 복원
  const [items, setItems] = useState<MasterProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 💡 사내 기준 등록 여부 판별 (items 대장과의 실시간 교차 검증 및 source 플래그 확인)
  const isItemRegisteredInStandard = useCallback((item: any) => {
    if (!item) return false;
    if (item.source === 'MASTER_REGISTERED') return true;
    const nameToMatch = (item.standard_name || item.item_name || '').trim().toLowerCase();
    if (!nameToMatch || !items || items.length === 0) return false;
    return items.some((m) => {
      const mName = (m.standard_name || '').trim().toLowerCase();
      const mCode = (m.master_code || '').trim().toLowerCase();
      return (mName && mName === nameToMatch) || (mCode && mCode.length > 2 && nameToMatch.includes(mCode));
    });
  }, [items]);

  const unregisteredCount = useMemo(() => {
    return learnedItems.filter(item => !isItemRegisteredInStandard(item)).length;
  }, [learnedItems, isItemRegisteredInStandard]);

  const registeredCount = useMemo(() => {
    return learnedItems.filter(item => isItemRegisteredInStandard(item)).length;
  }, [learnedItems, isItemRegisteredInStandard]);

  // 💡 인큐베이팅 필터 탭 & 검색어 기반 자가학습 단가 목록 필터링
  const filteredLearnedItems = useMemo(() => {
    return learnedItems.filter((item) => {
      // 1. 사내 기준 등록 여부 인큐베이팅 필터
      if (learnedFilterTab === 'UNREGISTERED') {
        if (isItemRegisteredInStandard(item)) return false;
      } else if (learnedFilterTab === 'REGISTERED') {
        if (!isItemRegisteredInStandard(item)) return false;
      }

      // 2. 실시간 검색어 필터
      if (!learnedSearchQuery.trim()) return true;
      const q = learnedSearchQuery.toLowerCase().trim();
      return (
        (item.item_name || '').toLowerCase().includes(q) ||
        (item.standard_name || '').toLowerCase().includes(q) ||
        (item.specification || '').toLowerCase().includes(q) ||
        (item.material || '').toLowerCase().includes(q) ||
        (item.company_name || '').toLowerCase().includes(q)
      );
    });
  }, [learnedItems, learnedFilterTab, isItemRegisteredInStandard, learnedSearchQuery]);

  // 💡 자가학습 품목의 실제 유효 규격 산출 (노이즈 '1 / 1' 필터링 및 표준 마스터 품목 규격 실시간 연동)
  const getEffectiveLearnedSpec = useCallback((item: any) => {
    if (!item) return '-';

    // 1. 표준 품목 및 단가 대장(items)에서 매칭되는 품목의 실제 규격 우선 탐색
    const nameToMatch = (item.standard_name || item.item_name || '').trim().toLowerCase();
    if (nameToMatch && items && items.length > 0) {
      const matchedMaster = items.find((m) => {
        const mName = (m.standard_name || '').trim().toLowerCase();
        const mCode = (m.master_code || '').trim().toLowerCase();
        return (mName && mName === nameToMatch) || (mCode && mCode.length > 2 && nameToMatch.includes(mCode));
      });

      if (matchedMaster) {
        const rawMasterSpec = matchedMaster.specification;
        if (rawMasterSpec && !isNoiseSpec(rawMasterSpec) && rawMasterSpec !== '-') {
          return rawMasterSpec;
        }
        const inferredMasterSpec = inferPartSpecification({
          name: matchedMaster.standard_name,
          code: matchedMaster.master_code,
          category: matchedMaster.category,
          material: matchedMaster.material,
          existingSpec: rawMasterSpec
        });
        if (inferredMasterSpec && inferredMasterSpec !== '-') {
          return inferredMasterSpec;
        }
      }
    }

    // 2. 학습 품목 자체의 규격이 유효한지(노이즈 '1 / 1' 등이 아닌지) 검사
    const rawItemSpec = item.specification;
    if (rawItemSpec && !isNoiseSpec(rawItemSpec) && rawItemSpec !== '-') {
      return rawItemSpec;
    }

    // 3. 자체 형상/품명 기반 규격 역산 추정
    const inferred = inferPartSpecification({
      name: item.standard_name || item.item_name || '',
      code: '',
      category: 'MACHINING',
      material: item.material || item.standard_material || 'SS400',
      existingSpec: rawItemSpec
    });

    return inferred && inferred !== '-' ? inferred : '-';
  }, [items]);

  const handlePromoteToStandard = (item: any) => {
    const effSpec = getEffectiveLearnedSpec(item);
    setNewName(item.standard_name || item.item_name || '');
    setNewSpec(effSpec !== '-' ? effSpec : (!isNoiseSpec(item.specification) ? item.specification : ''));
    setNewMaterial(item.material || 'SS400');
    setNewPrice(Number(item.unit_price || 0));
    setNewCategory('MACHINING');
    setNewCode(`STD-${Date.now().toString().slice(-6)}`);
    setShowAddModal(true);
  };

  // 자가학습 단가 풀 대장 엑셀(.xlsx) 다운로드
  const handleExportLearnedExcel = async () => {
    if (learnedItems.length === 0) return;
    try {
      const XLSX = await import('xlsx');
      const exportData = learnedItems.map((item, idx) => ({
        'No': idx + 1,
        '학습품목명': item.item_name || '',
        '표준품명': item.standard_name || item.item_name || '',
        '규격(Spec)': getEffectiveLearnedSpec(item),
        '재질': item.material || item.standard_material || 'SS400',
        '최근학습단가(원)': Number(item.unit_price || 0),
        '검증횟수': item.approval_count || 1,
        '출처': item.source === 'DRAWING_APPROVAL' ? '도면승인' : item.source === 'QUOTE_MANUAL' ? '수동견적' : item.source || '자가학습',
        '고객사': item.company_name || '-',
        '최근학습일시': item.last_used_at?.slice(0, 10) || item.created_at?.slice(0, 10) || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 22 },
        { wch: 24 },
        { wch: 14 },
        { wch: 16 },
        { wch: 10 },
        { wch: 12 },
        { wch: 18 },
        { wch: 14 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '자가학습_단가풀');
      XLSX.writeFile(wb, `CADON_자가학습단가풀_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (e) {
      alert('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null); // 개별 단가 인라인 편집 상태 (다중 선택과 완전 분리)
  const [modifiedItems, setModifiedItems] = useState<Record<string, number>>({});
  const [customSubItems, setCustomSubItems] = useState<Record<string, string>>({}); // 품목별 세부 대표 품목 수동 지정 매핑
  const [activeCategoryDropdownId, setActiveCategoryDropdownId] = useState<string | null>(null); // 커스텀 부품 유형 드롭다운 활성화 품목 ID
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [bulkCustomPriceInput, setBulkCustomPriceInput] = useState('');
  const [bulkCategory, setBulkCategory] = useState<string>('MACHINING');
  const [isApplyingCategory, setIsApplyingCategory] = useState<boolean>(false);

  // ⚡ 추천 1: 스마트 일괄 원가·임률 설정 모달 상태
  const [showBulkCostModal, setShowBulkCostModal] = useState<boolean>(false);
  const [bulkModalProcess, setBulkModalProcess] = useState<string>('MACHINING_LATHE');
  const [bulkModalTreatment, setBulkModalTreatment] = useState<string>('QT');
  const [bulkModalTargetPrice, setBulkModalTargetPrice] = useState<string>('');

  // 10대 부품 분류 & 실무 대표 품목 스마트 피커 모달 상태
  const [categoryPickerState, setCategoryPickerState] = useState<{
    isOpen: boolean;
    mode: 'inline' | 'bulk' | 'add';
    targetId?: string;
    targetInfo?: { code?: string; name?: string; spec?: string };
    currentCategory: string;
  }>({
    isOpen: false,
    mode: 'inline',
    currentCategory: 'MACHINING'
  });

  // 페이지네이션 상태 (10, 20, 30, 40, 50개씩 보기)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 페이지 또는 페이지당 행수 변경 시 테이블 스크롤 최상단 복귀
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, pageSize]);

  // ⚡ 엑셀 스타일 열 너비 상태 및 실시간 드래그 리사이즈 핸들러
  const [colWidths, setColWidths] = useState<Record<MasterColKey, number>>(DEFAULT_MASTER_COL_WIDTHS);
  const resizingRef = useRef<{
    colKey: MasterColKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  // 로컬 스토리지에서 사용자가 커스텀 설정한 열 폭 복원 (글자 가림 방지 안전 보정)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cadon_masters_col_widths');
      if (saved) {
        const parsed = JSON.parse(saved);
        setColWidths((prev) => {
          const next = { ...prev };
          (Object.keys(DEFAULT_MASTER_COL_WIDTHS) as MasterColKey[]).forEach((k) => {
            // 과거 캐시가 새로운 기본 안전 폭보다 좁으면 텍스트 잘림 방지를 위해 기본값 이상으로 자동 업그레이드
            const cachedVal = parsed[k];
            next[k] = cachedVal ? Math.max(DEFAULT_MASTER_COL_WIDTHS[k], cachedVal) : DEFAULT_MASTER_COL_WIDTHS[k];
          });
          return next;
        });
      }
    } catch {}
  }, []);

  const handleColResizeStart = (e: React.MouseEvent, colKey: MasterColKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: colWidths[colKey] || DEFAULT_MASTER_COL_WIDTHS[colKey],
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colKey: key, startX, startWidth } = resizingRef.current;
      const delta = moveEvent.clientX - startX;
      const minW = MIN_MASTER_COL_WIDTHS[key] || 40;
      const newW = Math.max(minW, Math.round(startWidth + delta));
      setColWidths((prev) => ({ ...prev, [key]: newW }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        setColWidths((latest) => {
          try {
            localStorage.setItem('cadon_masters_col_widths', JSON.stringify(latest));
          } catch {}
          return latest;
        });
      }
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ⚡ 엑셀(Excel) 표준: 열 경계 더블클릭 시 콘텐츠/텍스트 길이에 딱 맞추는 Auto-fit
  const handleAutoFitColWidth = (colKey: MasterColKey) => {
    const colIdx = MASTER_COL_INDEX_MAP[colKey];
    if (colIdx === undefined || !tableContainerRef.current) return;

    const table = tableContainerRef.current.querySelector('table');
    if (!table) return;

    // 1) 헤더 텍스트 너비 실측 (제목 폭 + 패딩 및 리사이즈 핸들 여유)
    const th = table.querySelectorAll('thead th')[colIdx] as HTMLElement;
    let maxContentWidth = 0;
    if (th) {
      const span = th.querySelector('span');
      const thTextWidth = span ? span.getBoundingClientRect().width : th.scrollWidth;
      maxContentWidth = Math.max(maxContentWidth, thTextWidth + 36);
    }

    // 2) 현재 렌더링된 모든 행의 해당 열 셀(td) 콘텐츠 실측
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const td = row.querySelectorAll('td')[colIdx] as HTMLElement;
      if (td) {
        const truncatedElem = td.querySelector('.truncate') as HTMLElement;
        const inner = td.firstElementChild as HTMLElement;
        let cellW = inner ? inner.scrollWidth : td.scrollWidth;
        if (truncatedElem && truncatedElem.scrollWidth > cellW) {
          cellW = truncatedElem.scrollWidth;
        }

        const totalCellW = cellW + 32; // 좌우 셀 패딩 24px + 여유 8px
        if (totalCellW > maxContentWidth) {
          maxContentWidth = totalCellW;
        }
      }
    });

    const minW = MIN_MASTER_COL_WIDTHS[colKey] || 40;
    const optimalWidth = Math.max(minW, Math.min(Math.ceil(maxContentWidth), 520));

    setColWidths((prev) => {
      const next = { ...prev, [colKey]: optimalWidth };
      try {
        localStorage.setItem('cadon_masters_col_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleResetSingleColWidth = (colKey: MasterColKey) => {
    setColWidths((prev) => {
      const next = { ...prev, [colKey]: DEFAULT_MASTER_COL_WIDTHS[colKey] };
      try {
        localStorage.setItem('cadon_masters_col_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleResetAllColWidths = () => {
    setColWidths(DEFAULT_MASTER_COL_WIDTHS);
    try {
      localStorage.removeItem('cadon_masters_col_widths');
    } catch {}
  };

  const totalTableWidth = useMemo(() => {
    return Object.values(colWidths).reduce((a, b) => a + b, 0);
  }, [colWidths]);

  // New Item Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('MACHINING');
  const [newSpec, setNewSpec] = useState('');
  const [newMaterial, setNewMaterial] = useState('SS400');
  const [newPrice, setNewPrice] = useState<number>(0);
  const [savingItem, setSavingItem] = useState(false);

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedPreview, setImportedPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState<{
    total: number;
    machining: number;
    sheetMetal: number;
    casting: number;
    injection: number;
    commercial: number;
    mechanical: number;
    electrical: number;
    imported: number;
    supplied: number;
    assembly: number;
  }>({
    total: 0,
    machining: 0,
    sheetMetal: 0,
    casting: 0,
    injection: 0,
    commercial: 0,
    mechanical: 0,
    electrical: 0,
    imported: 0,
    supplied: 0,
    assembly: 0
  });

  // Settings State: 임률 설정 상태
  const [materialRates, setMaterialRates] = useState<Record<string, number>>({});
  const [processRates, setProcessRates] = useState<Record<string, number>>({});

  const [savingSettings, setSavingSettings] = useState(false);

  // 💡 3단계 담당자 눈높이 UX 상태
  const [selectedEstimatorIndex, setSelectedEstimatorIndex] = useState<number>(0);
  const [targetPriceInput, setTargetPriceInput] = useState<number>(30000);
  const [reverseEstimating, setReverseEstimating] = useState<boolean>(false);
  const [reverseResult, setReverseResult] = useState<any>(null);
  const [appliedNotice, setAppliedNotice] = useState<string>('');

  // 기준 표준 단가 vs 현재 임률 시뮬레이션 계산
  const calculateBenchmarkPrice = (part: typeof BENCHMARK_PARTS[0], rates: Record<string, number>) => {
    const matRate = materialRates[part.material] || part.matKgRate;
    const matCost = Math.round(part.weightKg * matRate * 1.08);
    let procCost = 0;
    if (part.type === 'SHEET_METAL') {
      const cutRate = rates['SHEET_LASER_PER_METER'] || 1800;
      const bendRate = rates['SHEET_BEND_PER_STROKE'] || 800;
      const pierceRate = rates['SHEET_PIERCING_RATE'] || 80;
      procCost = Math.round(part.cuttingLengthM * cutRate) + (part.bendingCount * bendRate) + (part.pierceCount * pierceRate);
    } else {
      const machRate = rates['HOURLY_MACHINE_RATE'] || 45000;
      const setup = rates['SETUP_BASE_COST'] || 30000;
      const hours = part.weightKg > 1.0 ? 0.46 : (part.weightKg > 0.5 ? 0.43 : 0.40);
      procCost = Math.round(setup * 0.3 + hours * machRate * 0.6);
    }
    const margin = rates['DEFAULT_MARGIN_RATE'] || 0.18;
    const subtotal = matCost + procCost;
    return Math.ceil((subtotal * (1 + margin)) / 100) * 100;
  };

  // 목표 단가 역산 실행
  const handleRunReverseEstimate = async () => {
    const part = BENCHMARK_PARTS[selectedEstimatorIndex];
    if (!part) return;
    setReverseEstimating(true);
    setAppliedNotice('');
    try {
      const matRate = materialRates[part.material] || part.matKgRate;
      const matCost = Math.round(part.weightKg * matRate * 1.08);
      const res = await apiFetch('/api/admin/masters/reverse-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processType: part.type,
          targetPrice: Number(targetPriceInput) || 30000,
          materialCost: matCost,
          cuttingLengthMeter: part.cuttingLengthM,
          bendingCount: part.bendingCount,
          weightKg: part.weightKg,
          currentRates: {
            laserRatePerMeter: processRates['SHEET_LASER_PER_METER'] || 1800,
            bendRatePerStroke: processRates['SHEET_BEND_PER_STROKE'] || 800,
            machineRatePerHour: processRates['HOURLY_MACHINE_RATE'] || 45000
          }
        })
      });
      if (res.ok) {
        const json = await res.json();
        setReverseResult(json.result);
      }
    } catch (e: any) {
      alert('역산 실패: ' + e.message);
    } finally {
      setReverseEstimating(false);
    }
  };

  // 역산된 추천 임률 폼에 반영
  const handleApplyRecommendedRates = (rateType: 'bend' | 'cut' | 'mach') => {
    if (!reverseResult) return;
    if (rateType === 'bend' && reverseResult.recommendedBendRate) {
      setProcessRates({ ...processRates, SHEET_BEND_PER_STROKE: reverseResult.recommendedBendRate });
      setAppliedNotice(`절곡 단가가 ${reverseResult.recommendedBendRate.toLocaleString()}원/회(으)로 임률표에 반영되었습니다.`);
    } else if (rateType === 'cut' && reverseResult.recommendedCutRate) {
      setProcessRates({ ...processRates, SHEET_LASER_PER_METER: reverseResult.recommendedCutRate });
      setAppliedNotice(`절단 단가가 ${reverseResult.recommendedCutRate.toLocaleString()}원/m(으)로 임률표에 반영되었습니다.`);
    } else if (rateType === 'mach' && reverseResult.recommendedMachineRate) {
      setProcessRates({ ...processRates, HOURLY_MACHINE_RATE: reverseResult.recommendedMachineRate });
      setAppliedNotice(`기계가공 임률이 ${reverseResult.recommendedMachineRate.toLocaleString()}원/h(으)로 임률표에 반영되었습니다.`);
    }
  };

  const loadData = async (forceSpinner = false) => {
    const cachedData = getClientCache<any>('masters_items_ALL');
    const hasCached = (cachedData?.items && Array.isArray(cachedData.items) && cachedData.items.length > 0) || (items.length > 0);

    // 캐시가 전혀 없거나 명시적으로 스피너를 요청한 경우에만 로딩 활성화
    if (!hasCached || forceSpinner) {
      setLoading(true);
    }

    try {
      const urlItems = '/api/admin/masters?category=ALL';
      const urlSettings = '/api/admin/masters?type=settings';

      // ⚡ fetchWithCache를 통해 GNB 프리페치 캐시를 0ms 즉시 공유 (중복 대기 100% 해소)
      const [data, sData] = await Promise.all([
        fetchWithCache<any>('masters_items_ALL', urlItems, { maxAgeMs: 20000, forceFresh: forceSpinner }),
        fetchWithCache<any>('masters_settings', urlSettings, { maxAgeMs: 40000 })
      ]);

      if (data?.items) {
        setItems(data.items);
        if (data.stats) {
          setStats(data.stats);
        }
        setClientCache('masters_items_ALL', data);
      }

      if (sData) {
        if (sData.materialRates) setMaterialRates(sData.materialRates);
        if (sData.processRates) setProcessRates(sData.processRates);
        setClientCache('masters_settings', sData);
      }
    } catch (e) {
      console.error('Failed to load masters:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // ⚡ 0ms 즉시 화면 복원: 마운트 시 캐시된 품목 및 통계가 있으면 즉각 표출 (하이드레이션 완료 후 안전 복원)
    try {
      const cachedData = getClientCache<any>('masters_items_ALL');
      if (cachedData?.items && Array.isArray(cachedData.items) && cachedData.items.length > 0) {
        setItems(cachedData.items);
        setLoading(false);
        if (cachedData.stats) setStats(cachedData.stats);
      }
      const cachedSettings = getClientCache<any>('masters_settings');
      if (cachedSettings) {
        if (cachedSettings.materialRates) setMaterialRates(cachedSettings.materialRates);
        if (cachedSettings.processRates) setProcessRates(cachedSettings.processRates);
      }
    } catch {}

    loadData(false);
  }, []);

  // 커스텀 부품 유형 드롭다운 외부 클릭 및 ESC 닫기 핸들러
  useEffect(() => {
    if (!activeCategoryDropdownId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-category-dropdown]')) {
        setActiveCategoryDropdownId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveCategoryDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeCategoryDropdownId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(true);
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      alert('품목 코드와 품명은 필수 입력 항목입니다.');
      return;
    }

    setSavingItem(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_product',
          master_code: newCode,
          standard_name: newName,
          category: newCategory,
          specification: newSpec,
          material: newMaterial,
          unit_price: newPrice
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewCode('');
        setNewName('');
        setNewSpec('');
        setNewPrice(0);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '품목 등록에 실패했습니다.');
      }
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (id: string, code: string) => {
    if (!confirm(`정말로 마스터 품목 [${code}]을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/admin/masters?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(it => it.id !== id));
      } else {
        alert('삭제 실패');
      }
    } catch (e) {
      alert('삭제 중 오류 발생');
    }
  };

  // ⚡ 0ms 즉각 반응 하이브리드 필터링 (카테고리 칩 선택 + 실시간 검색어)
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // 1. 10대 실무 분류 카테고리 필터링
      let matchesCategory = true;
      if (categoryFilter !== 'ALL') {
        if (categoryFilter === 'COMMERCIAL') {
          matchesCategory = it.category === 'COMMERCIAL' || it.category === 'FASTENER';
        } else {
          matchesCategory = it.category === categoryFilter;
        }
      }

      // 2. 검색어 필터링 (마스터코드, 표준품명, 규격, 재질)
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (it.master_code && it.master_code.toLowerCase().includes(q)) ||
        (it.standard_name && it.standard_name.toLowerCase().includes(q)) ||
        (it.specification && it.specification.toLowerCase().includes(q)) ||
        (it.material && it.material.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [items, categoryFilter, searchTerm]);

  // ⚡ 페이지네이션 연동 품목 및 페이지 번호 계산
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  const paginatedItems = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredItems.slice(startIdx, startIdx + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const getPageNumbers = () => {
    // 💡 10페이지 이하: 1번부터 끝 번호까지 전량 표출하여 직관성 보장 (7페이지면 1~7 전체 노출)
    if (totalPages <= 10) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // 💡 10페이지 초과 시: 표준 10버튼 윈도우 슬라이딩 표출
    const maxButtons = 10;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // 체크박스 다중 선택 핸들러 (현재 페이지 기준 토글)
  const allPageSelected = paginatedItems.length > 0 && paginatedItems.every((it) => selectedIds.includes(it.id));

  const handleToggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !paginatedItems.some((it) => it.id === id)));
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedItems.forEach((it) => next.add(it.id));
        return Array.from(next);
      });
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 선택 품목 일괄 삭제
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개 마스터 품목을 정말로 일괄 삭제하시겠습니까?\n삭제된 기준 정보는 복구할 수 없습니다.`)) return;

    try {
      const res = await apiFetch(`/api/admin/masters?ids=${selectedIds.join(',')}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => !selectedIds.includes(it.id)));
        alert(`선택한 ${selectedIds.length}개 마스터 품목이 일괄 삭제되었습니다.`);
        setSelectedIds([]);
      } else {
        alert('일괄 삭제 중 오류가 발생했습니다.');
      }
    } catch (e) {
      alert('일괄 삭제 처리 중 네트워크 오류가 발생했습니다.');
    }
  };

  // 선택 품목 엑셀 다운로드
  const handleExportSelectedExcel = async () => {
    if (selectedIds.length === 0) return;
    const selectedItems = items.filter((it) => selectedIds.includes(it.id));
    try {
      const XLSX = await import('xlsx');
      const exportData = selectedItems.map((it, idx) => ({
        'No': idx + 1,
        '마스터코드': it.master_code,
        '표준품명': it.standard_name,
        '규격(Spec)': it.specification || '-',
        '재질': it.material || 'SS400',
        '부품유형': getPartCategoryLabel(it.category),
        '사내기준단가(원)': it.unit_price || 0,
        '단위': it.unit || 'EA'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 28 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 8 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '선택_마스터_단가목록');
      XLSX.writeFile(wb, `CADON_선택마스터품목_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (e) {
      alert('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  // ⚡ 플로팅 비침습 토스트 알림 상태
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // ⚡ AI 규격 자동 분석 및 일괄 보정 핸들러
  const [isAnalyzingSpecs, setIsAnalyzingSpecs] = useState(false);
  const handleAnalyzeSpecsWithAi = async () => {
    setIsAnalyzingSpecs(true);
    try {
      // 1. 로컬 상태 즉각 선반영 (0ms 낙관적 업데이트)
      setItems((prev) =>
        prev.map((it) => {
          if (isNoiseSpec(it.specification)) {
            const inferred = inferPartSpecification({
              name: it.standard_name,
              code: it.master_code,
              category: it.category,
              material: it.material,
              existingSpec: it.specification
            });
            return { ...it, specification: inferred };
          }
          return it;
        })
      );

      // 2. 백엔드 DB 영구 보정 비동기 호출
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze_specs' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ AI 규격 분석 완료 (총 ${data.count}개 부품 치수·사양 정밀 보정)`);
        loadData(false); // 사일런트 백그라운드 동기화
      } else {
        showToast('AI 규격 분석 처리 중 오류가 발생했습니다.');
      }
    } catch (e) {
      showToast('AI 규격 분석 처리 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsAnalyzingSpecs(false);
    }
  };

  // 1. 인라인 셀 단가 직접 타이핑 핸들러 (Excel/Notion 스프레드시트 방식 - 최대 백억 원대 지원)
  const handleInlinePriceChange = (id: string, valStr: string) => {
    // 최대 백억 원대(11자리: 99,999,999,999)까지 안전하게 처리
    const cleaned = valStr.replace(/[^0-9]/g, '').slice(0, 11);
    const rawVal = parseInt(cleaned, 10) || 0;
    setModifiedItems((prev) => ({ ...prev, [id]: rawVal }));
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, unit_price: rawVal } : it))
    );
    if (!selectedIds.includes(id)) {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  // 2. 하단 툴바: 선택 품목 일괄 증감률 (+5%, +10%, -5%, -10% 등) 적용
  const handleBulkRateAdjust = (ratePct: number) => {
    if (selectedIds.length === 0) return;
    const newMod: Record<string, number> = { ...modifiedItems };
    setItems((prev) =>
      prev.map((it) => {
        if (!selectedIds.includes(it.id)) return it;
        const currentPrice = it.unit_price || 0;
        if (currentPrice <= 0) return it;
        const adjusted = Math.round((currentPrice * (1 + ratePct / 100)) / 100) * 100;
        newMod[it.id] = adjusted;
        return { ...it, unit_price: adjusted };
      })
    );
    setModifiedItems(newMod);
  };

  // 3. 하단 툴바: 선택 품목 직접 입력 단가 일괄 적용
  const handleBulkApplyCustomPrice = () => {
    const targetPrice = parseInt(bulkCustomPriceInput.replace(/[^0-9]/g, ''), 10);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      alert('유효한 단가 금액을 입력해 주세요.');
      return;
    }
    const newMod: Record<string, number> = { ...modifiedItems };
    setItems((prev) =>
      prev.map((it) => {
        if (!selectedIds.includes(it.id)) return it;
        newMod[it.id] = targetPrice;
        return { ...it, unit_price: targetPrice };
      })
    );
    setModifiedItems(newMod);
    setBulkCustomPriceInput('');
  };

  // 3-1. 테이블 인라인 개별 부품 유형 변경 (방안 A: 1-클릭 즉시 변경 및 자동 DB 반영)
  const handleInlineCategoryChange = async (id: string, newCategory: string) => {
    const targetItem = items.find((it) => it.id === id);
    if (!targetItem || targetItem.category === newCategory) return;
    const oldCat = targetItem.category;

    // 1. UI 및 상단 통계 즉시 갱신 (반응속도 0ms)
    setStats((prev) => {
      const updated = { ...prev };
      const oldKey = CATEGORY_STAT_KEYS[oldCat];
      const newKey = CATEGORY_STAT_KEYS[newCategory];
      if (oldKey && updated[oldKey] > 0) updated[oldKey]--;
      if (newKey) updated[newKey] = (updated[newKey] || 0) + 1;
      return updated;
    });

    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, category: newCategory } : it))
    );

    // 2. DB 즉시 저장
    try {
      await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_update_products',
          items: [{ id, category: newCategory }]
        })
      });
    } catch (err) {
      console.error('부품 유형 변경 저장 실패:', err);
    }
  };

  // 3-2. 하단 툴바: 선택 품목 부품 유형 일괄 변경 (방안 B: 다중 선택 일괄 적용)
  const handleBulkApplyCategory = async () => {
    if (selectedIds.length === 0) {
      alert('유형을 변경할 품목을 먼저 선택해 주세요.');
      return;
    }

    setIsApplyingCategory(true);
    try {
      const targetItems = items.filter((it) => selectedIds.includes(it.id));

      // 상단 통계 갱신
      setStats((prev) => {
        const updated = { ...prev };
        for (const it of targetItems) {
          if (it.category !== bulkCategory) {
            const oldKey = CATEGORY_STAT_KEYS[it.category];
            const newKey = CATEGORY_STAT_KEYS[bulkCategory];
            if (oldKey && updated[oldKey] > 0) updated[oldKey]--;
            if (newKey) updated[newKey] = (updated[newKey] || 0) + 1;
          }
        }
        return updated;
      });

      // 테이블 품목 상태 갱신
      setItems((prev) =>
        prev.map((it) => (selectedIds.includes(it.id) ? { ...it, category: bulkCategory } : it))
      );

      // DB 일괄 갱신 API 호출
      const payload = selectedIds.map((id) => ({ id, category: bulkCategory }));
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_update_products',
          items: payload
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '일괄 부품 유형 저장 실패');
      }

      const catLabel = getPartCategoryLabel(bulkCategory);

      alert(`선택된 ${selectedIds.length}개 품목의 부품 유형이 [${catLabel}]으로 일괄 변경 및 저장되었습니다.`);
    } catch (err: any) {
      alert('부품 유형 일괄 변경 중 오류: ' + (err.message || ''));
    } finally {
      setIsApplyingCategory(false);
    }
  };

  // ⚡ 추천 1: 선택 품목 스마트 일괄 원가·임률 설정 적용
  const handleApplyBulkCostSettings = async () => {
    if (selectedIds.length === 0) return;
    const priceNum = bulkModalTargetPrice ? Number(bulkModalTargetPrice.replace(/[^0-9]/g, '')) : 0;

    let catToApply = 'MACHINING';
    if (bulkModalProcess.startsWith('SHEET')) catToApply = 'SHEET_METAL';
    else if (bulkModalProcess.startsWith('COMMERCIAL')) catToApply = 'COMMERCIAL';
    else if (bulkModalProcess.startsWith('CASTING')) catToApply = 'CASTING';

    // 1. 클라이언트 UI 즉시 반영 (0ms)
    setItems((prev) =>
      prev.map((p) => {
        if (selectedIds.includes(p.id)) {
          return {
            ...p,
            category: catToApply,
            unit_price: priceNum > 0 ? priceNum : p.unit_price
          };
        }
        return p;
      })
    );

    if (priceNum > 0) {
      setModifiedItems((prev) => {
        const next = { ...prev };
        selectedIds.forEach((id) => { next[id] = priceNum; });
        return next;
      });
    }

    // 2. 서버 DB 자동 반영
    try {
      const payload = selectedIds.map((id) => {
        const item = items.find((p) => p.id === id);
        return {
          id,
          category: catToApply,
          unit_price: priceNum > 0 ? priceNum : item?.unit_price || 0
        };
      });
      await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_update_products',
          items: payload
        })
      });
      alert(`선택된 ${selectedIds.length}개 품목의 원가·임률 설정이 일괄 적용 및 저장되었습니다.`);
    } catch (err: any) {
      console.error('일괄 원가 설정 저장 실패:', err);
    }

    setShowBulkCostModal(false);
  };

  // 4. 선택 및 수정된 품목 일괄 DB 저장
  const handleSaveModifiedItems = async () => {
    const targetIds = Array.from(new Set([...selectedIds, ...Object.keys(modifiedItems)]));
    if (targetIds.length === 0) {
      alert('저장할 품목이 선택되지 않았습니다.');
      return;
    }

    const payloadItems = targetIds
      .map((id) => {
        const item = items.find((it) => it.id === id);
        if (!item) return null;
        return {
          id: item.id,
          unit_price: item.unit_price,
          standard_name: item.standard_name,
          specification: item.specification,
          material: item.material,
          category: item.category
        };
      })
      .filter(Boolean);

    setIsSavingBatch(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_update_products',
          items: payloadItems
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '단가 갱신 실패');
      }

      alert(`총 ${payloadItems.length}건의 마스터 품목 단가가 성공적으로 DB에 일괄 저장되었습니다.`);
      setModifiedItems({});
    } catch (e: any) {
      alert('단가 일괄 저장 중 오류: ' + (e.message || ''));
    } finally {
      setIsSavingBatch(false);
    }
  };

  // 5. Ctrl + S 키보드 단축키 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (selectedIds.length > 0 || Object.keys(modifiedItems).length > 0) {
          handleSaveModifiedItems();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, modifiedItems, items]);

  // Excel Template Download Handler (.xlsx)
  const handleDownloadExcelTemplate = async () => {
    try {
      const XLSX = await import('xlsx');

      // 1. 등록 템플릿 양식 시트 (실무 6대 분류 대표 샘플 포함)
      const templateData = [
        {
          '품목코드(필수)': 'SF-001',
          '품명(필수)': 'MOTOR SHAFT',
          '규격(Spec)': 'DIA 25x300L',
          '재질': 'S45C',
          '부품분류': '가공품',
          '기준단가(원)': 45000,
          '단위': 'EA',
          '비고': '선반/밀링 가공'
        },
        {
          '품목코드(필수)': 'MB-001',
          '품명(필수)': 'MOTOR BASE BRACKET',
          '규격(Spec)': '150x120x10T',
          '재질': 'SS400',
          '부품분류': '판금/제관',
          '기준단가(원)': 28000,
          '단위': 'EA',
          '비고': '레이저 절단 및 절곡'
        },
        {
          '품목코드(필수)': 'CS-001',
          '품명(필수)': 'BEARING HOUSING',
          '규격(Spec)': 'DIA 120x80H',
          '재질': 'FC250',
          '부품분류': '주조품',
          '기준단가(원)': 55000,
          '단위': 'EA',
          '비고': '주물 성형 후 정밀가공'
        },
        {
          '품목코드(필수)': 'ST-B01',
          '품명(필수)': 'HEX SOCKET BOLT',
          '규격(Spec)': 'M8x25L',
          '재질': 'SCM435',
          '부품분류': '규격철물',
          '기준단가(원)': 350,
          '단위': 'EA',
          '비고': '기계 표준 규격볼트'
        },
        {
          '품목코드(필수)': 'EL-001',
          '품명(필수)': 'SERVO MOTOR 750W',
          '규격(Spec)': 'HG-KR73',
          '재질': 'STANDARD',
          '부품분류': '전장/모터',
          '기준단가(원)': 380000,
          '단위': 'EA',
          '비고': '미쓰비시 서보모터'
        },
        {
          '품목코드(필수)': 'AS-001',
          '품명(필수)': 'X-AXIS SLIDE MODULE',
          '규격(Spec)': 'STROKE 500mm',
          '재질': 'AL6061',
          '부품분류': '조립품',
          '기준단가(원)': 1250000,
          '단위': 'SET',
          '비고': '서브 조립체 모듈'
        }
      ];

      const wsTemplate = XLSX.utils.json_to_sheet(templateData);

      // 열 너비 자동 최적화
      wsTemplate['!cols'] = [
        { wch: 18 }, // 품목코드(필수)
        { wch: 28 }, // 품명(필수)
        { wch: 22 }, // 규격(Spec)
        { wch: 14 }, // 재질
        { wch: 14 }, // 부품분류
        { wch: 16 }, // 기준단가(원)
        { wch: 10 }, // 단위
        { wch: 24 }  // 비고
      ];

      // 2. 작성 가이드 및 분류 안내 시트
      const guideData = [
        { '항목': '품목코드', '필수여부': '필수', '허용값 / 설명': '사내 고유 품번 또는 도면번호 (예: SF-001, 10U+00B0 등). 중복 시 기존 정보가 갱신됩니다.' },
        { '항목': '품명', '필수여부': '필수', '허용값 / 설명': '표준 부품 명칭 (예: MOTOR SHAFT, BASE PLATE 등)' },
        { '항목': '규격(Spec)', '필수여부': '선택', '허용값 / 설명': '치수 또는 사양 (예: 150x120x10T, DIA 25x300L, M8x25L 등)' },
        { '항목': '재질', '필수여부': '선택', '허용값 / 설명': 'SS400, S45C, SUS304, SUS316, AL6061, FC250 등 (미입력 시 기본값 SS400)' },
        { '항목': '부품분류', '필수여부': '선택', '허용값 / 설명': '가공품, 판금/제관, 사출/성형, 기계요소, 규격철물, 전장/공압, 주조품, 해외수입, 고객사급, 조립품 중 하나 입력 (미입력 시 가공품)' },
        { '항목': '기준단가', '필수여부': '선택', '허용값 / 설명': '숫자만 입력 (단위: 원, 쉼표 제외 권장, 예: 45000)' },
        { '항목': '단위', '필수여부': '선택', '허용값 / 설명': 'EA, SET, M, KG 등 (미입력 시 기본값 EA)' },
        { '항목': '비고', '필수여부': '선택', '허용값 / 설명': '용도, 가공 특이사항, 구매처 등 참고사항' }
      ];

      const wsGuide = XLSX.utils.json_to_sheet(guideData);
      wsGuide['!cols'] = [
        { wch: 16 },
        { wch: 12 },
        { wch: 80 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsTemplate, '마스터기준정보_등록양식');
      XLSX.utils.book_append_sheet(wb, wsGuide, '작성가이드');

      XLSX.writeFile(wb, 'CADON_마스터기준정보_등록템플릿.xlsx');
    } catch (error) {
      console.error('Failed to download template:', error);
      alert('엑셀 템플릿 다운로드 중 오류가 발생했습니다.');
    }
  };

  // CSV/Excel (.xlsx, .xls, .csv) 통합 파서
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rows || rows.length === 0) {
            alert('시트에 유효한 데이터가 존재하지 않습니다.');
            return;
          }

          // 다양한 헤더 명칭 유연하게 정규화
          const normalizedRows = rows.map((row: any) => {
            // 부품분류 텍스트를 영문 카테고리 코드로 변환
            const rawCategory = (row['부품분류'] || row['분류'] || row['카테고리'] || row['category'] || '').toString().trim();
            const category = normalizePartCategoryFromText(rawCategory);

            return {
              master_code: (row['품목코드(필수)'] || row['품목코드'] || row['도면번호'] || row['코드'] || row['master_code'] || '').toString().trim(),
              standard_name: (row['품명(필수)'] || row['품명'] || row['표준품명'] || row['부품명'] || row['standard_name'] || '').toString().trim(),
              specification: (row['규격(Spec)'] || row['규격'] || row['specification'] || row['spec'] || '').toString().trim(),
              material: (row['재질'] || row['소재'] || row['material'] || 'SS400').toString().trim(),
              category,
              unit: (row['단위'] || row['unit'] || 'EA').toString().trim(),
              unit_price: Number(String(row['기준단가(원)'] || row['기준단가'] || row['단가'] || row['unit_price'] || '0').replace(/[^0-9.-]+/g, '')) || 0,
              notes: (row['비고'] || row['notes'] || '').toString().trim()
            };
          }).filter(r => r.master_code || r.standard_name);

          if (normalizedRows.length === 0) {
            alert('유효한 품목코드 또는 품명이 포함된 데이터 행을 찾을 수 없습니다.');
            return;
          }

          setImportedPreview(normalizedRows);
        } catch (err: any) {
          console.error('File parse error:', err);
          alert('파일을 읽는 도중 오류가 발생했습니다. 올바른 엑셀/CSV 파일인지 확인해 주세요.');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error('XLSX module load error:', err);
      alert('엑셀 파서 모듈 로드 실패');
    }
  };

  const handleConfirmImport = async () => {
    if (importedPreview.length === 0) return;
    setImporting(true);

    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_import',
          items: importedPreview
        })
      });

      if (res.ok) {
        const result = await res.json();
        alert(`총 ${result.count}건의 마스터 품목이 성공적으로 데이터베이스에 적재되었습니다.`);
        setShowImportModal(false);
        setImportedPreview([]);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '대량 일괄 업로드 실패');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          materialRates,
          processRates
        })
      });

      if (res.ok) {
        alert('소재 시세 및 공정 임률 설정이 안전하게 저장되었습니다.');
      } else {
        alert('설정 저장 실패');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] bg-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 w-full px-3 sm:px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <Link href="/cases" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Database className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-black text-slate-900 leading-tight">원가 기준 관리 센터</h1>
            </div>
            <p className="text-[16px] text-slate-500 font-medium leading-tight mt-0.5">
              사내 표준 부품, 단가표, 소재 시세 및 가공 원가 기준을 등록하고 관리합니다.
            </p>
          </div>
        </div>

        {/* Tab Controls (3단 탭: 표준 품목 / 실무 자가학습 단가 풀 / 임률 설정) */}
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'products' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>표준 품목 및 단가 대장</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('learned');
              fetchLearnedItems(learnedItems.length > 0);
            }}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'learned' ? 'bg-white text-purple-700 shadow-xs ring-1 ring-purple-300' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="도면 검수 승인 및 견적 진행 과정에서 AI가 자동 학습하고 누적한 실무 단가 풀입니다."
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>⚡ 실무 자가학습 단가 풀</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'settings' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>소재 시세 & 가공 단가 설정</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'products' ? (
          <>
            {/* 💡 올인원 통합 마스터 콘솔 (통계 리본 + 툴바 + 테이블 100% 일체형 & 풀너비 엣지 투 엣지 & 뷰포트 고정) */}
            <div className="bg-white flex flex-col flex-1 min-h-0 w-full overflow-hidden">
              {/* 1. 상단 통계 리본 바 겸 인터랙티브 필터 탭 (1px 세선 divide-x & 원클릭 카테고리 필터링 올인원 통합) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 divide-x divide-slate-200 bg-slate-100/70 border-b border-slate-200 shrink-0">
                {[
                  { id: 'ALL', label: '전체 표준 품목', count: stats.total, unit: '개', textCol: 'text-slate-700', activeBar: 'bg-blue-600' },
                  { id: 'MACHINING', label: '기계 가공품', count: stats.machining || 0, unit: '종', textCol: 'text-blue-600', activeBar: 'bg-blue-600' },
                  { id: 'SHEET_METAL', label: '판금/제관품', count: stats.sheetMetal || 0, unit: '종', textCol: 'text-cyan-600', activeBar: 'bg-cyan-600' },
                  { id: 'INJECTION', label: '사출/성형품', count: stats.injection || 0, unit: '종', textCol: 'text-pink-600', activeBar: 'bg-pink-600' },
                  { id: 'MECHANICAL', label: '기계요소', count: stats.mechanical || 0, unit: '종', textCol: 'text-teal-600', activeBar: 'bg-teal-600' },
                  { id: 'COMMERCIAL', label: '규격 철물', count: stats.commercial || 0, unit: '종', textCol: 'text-emerald-600', activeBar: 'bg-emerald-600' },
                  { id: 'ELECTRICAL', label: '전장/공압품', count: stats.electrical || 0, unit: '종', textCol: 'text-amber-600', activeBar: 'bg-amber-600' },
                  { id: 'CASTING', label: '주조/단조품', count: stats.casting || 0, unit: '종', textCol: 'text-orange-600', activeBar: 'bg-orange-600' },
                  { id: 'IMPORTED', label: '해외 수입품', count: stats.imported || 0, unit: '종', textCol: 'text-violet-600', activeBar: 'bg-violet-600' },
                  { id: 'SUPPLIED', label: '고객 사급품', count: stats.supplied || 0, unit: '종', textCol: 'text-slate-600', activeBar: 'bg-slate-600' },
                  { id: 'ASSEMBLY', label: '조립품(모듈)', count: stats.assembly || 0, unit: '종', textCol: 'text-indigo-600', activeBar: 'bg-indigo-600' },
                ].map((tab) => {
                  const isActive = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(tab.id);
                        setCurrentPage(1);
                      }}
                      className={`group py-1.5 px-2.5 text-left transition-all cursor-pointer relative select-none flex flex-col justify-between ${
                        isActive
                          ? 'bg-white shadow-xs'
                          : 'bg-slate-50/60 hover:bg-white'
                      }`}
                      title={`${tab.label} 필터링 (클릭 시 ${tab.count.toLocaleString()}${tab.unit} 품목만 표출)`}
                    >
                      {/* 하단 강조 라인: 활성 탭은 3px 솔리드 바(100%), 호버 탭은 2.5px 프리뷰 라인(70%) 즉시 표출 */}
                      <span
                        className={`absolute bottom-0 left-0 right-0 z-10 transition-all duration-150 ${
                          isActive
                            ? `h-[3px] ${tab.activeBar} opacity-100`
                            : `h-[2.5px] ${tab.activeBar} opacity-0 group-hover:opacity-70`
                        }`}
                      />
                      <span className={`text-[15px] font-extrabold block leading-tight truncate ${tab.textCol}`}>
                        {tab.label}
                      </span>
                      <span className={`text-[15px] font-black font-mono mt-0.5 block text-right leading-tight tabular-nums ${
                        isActive ? 'text-slate-900' : 'text-slate-700'
                      }`}>
                        {tab.count.toLocaleString()}{tab.unit}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 2. 하단 툴바: 검색창 & 액션 버튼 (중복 필터 버튼 제거 후 시원하고 쾌적한 1줄 구성) */}
              <div className="py-2 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
                <form onSubmit={handleSearch} className="flex items-center space-x-2 flex-1 max-w-lg">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="품목코드, 품명, 규격, 재질 검색..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13.5px] focus:outline-none focus:border-blue-500 font-medium placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[13px] font-extrabold transition-colors cursor-pointer shadow-2xs shrink-0"
                  >
                    검색
                  </button>
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                      title="검색어 지우기"
                    >
                      초기화
                    </button>
                  )}
                </form>

                {/* Action Buttons */}
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetAllColWidths}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-[13px] font-extrabold flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer"
                    title="사용자가 조절한 테이블 열 폭을 기본 규격으로 초기화합니다."
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>열 폭 초기화</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyzeSpecsWithAi}
                    disabled={isAnalyzingSpecs}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[13px] font-extrabold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="기계가공품(Ø×L, W×L×T), 판금품(두께 T), 체결류(M) 등 부품 특성에 맞춰 AI 규격을 자동 분석 및 보정합니다."
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingSpecs ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
                    <span>{isAnalyzingSpecs ? '규격 분석 중...' : 'AI 규격 분석'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadExcelTemplate}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-[13px] font-extrabold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="사내 단가 대량 등록용 표준 엑셀 템플릿 서식 다운로드 (.xlsx)"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>엑셀 서식</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] font-extrabold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>엑셀 업로드</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-extrabold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>신규 품목 등록</span>
                  </button>
                </div>
              </div>

              {/* 4. 섹션 구분 1px 수평 라인 (툴바와 테이블 경계: 여백 제거 후 1px 라인 처리) */}
              <div className="border-t border-slate-200 shrink-0" />

              {/* 5. 데이터 테이블 (가로/세로 내부 스크롤 대응 & 엑셀 스타일 열 너비 실시간 조절 & 스크롤바 생성 시 텍스트 흔들림 방지 scrollbarGutter) */}
              <div
                ref={tableContainerRef}
                className="flex-1 min-h-0 overflow-auto w-full"
                style={{ scrollbarGutter: 'stable' }}
              >
                <table
                  className="text-left border-collapse text-xs table-fixed min-w-full"
                  style={{ width: `max(100%, ${totalTableWidth}px)` }}
                >
                <colgroup>
                  <col style={{ width: `${colWidths.checkbox}px` }} />
                  <col style={{ width: `${colWidths.no}px` }} />
                  <col style={{ width: `${colWidths.code}px` }} />
                  <col style={{ width: `${colWidths.name}px` }} />
                  <col style={{ width: `${colWidths.material}px` }} />
                  <col style={{ width: `${colWidths.matCost}px` }} />
                  <col style={{ width: `${colWidths.procCost}px` }} />
                  <col style={{ width: `${colWidths.treatment}px` }} />
                  <col style={{ width: `${colWidths.spec}px` }} />
                  <col style={{ width: `${colWidths.category}px` }} />
                  <col style={{ width: `${colWidths.price}px` }} />
                  <col style={{ width: `${colWidths.action}px` }} />
                  {/* 13. 우측 여백 흡수 열 (Ghost Spacer: 남는 와이드 화면 공간을 100% 흡수하여 데이터 12열 크기 보존) */}
                  <col className="w-auto" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 select-none h-9">
                    <th
                      className="py-2 px-2 text-center relative select-none"
                      style={{ width: `${colWidths.checkbox}px`, minWidth: `${colWidths.checkbox}px` }}
                    >
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center mx-auto"
                        title={allPageSelected ? '현재 페이지 전체 선택 해제' : '현재 페이지 전체 선택'}
                      >
                        {allPageSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                      </button>
                    </th>
                    <th
                      className="py-2 px-2 text-center font-mono text-[13px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.no}px`, minWidth: `${colWidths.no}px` }}
                    >
                      <span>No</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'no')}
                        onDoubleClick={() => handleAutoFitColWidth('no')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-4 text-[14px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.code}px`, minWidth: `${colWidths.code}px` }}
                    >
                      <span>마스터 코드</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'code')}
                        onDoubleClick={() => handleAutoFitColWidth('code')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-4 text-[14px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.name}px`, minWidth: `${colWidths.name}px` }}
                    >
                      <span>표준 품명</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'name')}
                        onDoubleClick={() => handleAutoFitColWidth('name')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-4 text-left text-[14px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.material}px`, minWidth: `${colWidths.material}px` }}
                    >
                      <span>재질</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'material')}
                        onDoubleClick={() => handleAutoFitColWidth('material')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 pl-4 pr-6 text-right text-[14px] font-extrabold whitespace-nowrap relative select-none"
                      style={{ width: `${colWidths.matCost}px`, minWidth: `${colWidths.matCost}px` }}
                    >
                      <span>소재 시세 · 재료비</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'matCost')}
                        onDoubleClick={() => handleAutoFitColWidth('matCost')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 pl-4 pr-6 text-right text-[14px] font-extrabold whitespace-nowrap relative select-none"
                      style={{ width: `${colWidths.procCost}px`, minWidth: `${colWidths.procCost}px` }}
                    >
                      <span>가공 단가 · 표준 공임</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'procCost')}
                        onDoubleClick={() => handleAutoFitColWidth('procCost')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 pl-4 pr-6 text-right text-[14px] font-extrabold whitespace-nowrap relative select-none"
                      style={{ width: `${colWidths.treatment}px`, minWidth: `${colWidths.treatment}px` }}
                    >
                      <span>후처리 · 열처리</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'treatment')}
                        onDoubleClick={() => handleAutoFitColWidth('treatment')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-4 text-left text-[14px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.spec}px`, minWidth: `${colWidths.spec}px` }}
                    >
                      <span>규격 (Spec)</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'spec')}
                        onDoubleClick={() => handleAutoFitColWidth('spec')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-4 text-left text-[14px] font-extrabold whitespace-nowrap relative select-none"
                      style={{ width: `${colWidths.category}px`, minWidth: `${colWidths.category}px` }}
                    >
                      <span>부품 분류 · 대표 품목</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'category')}
                        onDoubleClick={() => handleAutoFitColWidth('category')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 pl-4 pr-6 text-right text-[14px] font-extrabold whitespace-nowrap relative select-none"
                      style={{ width: `${colWidths.price}px`, minWidth: `${colWidths.price}px` }}
                    >
                      <span>사내 기준단가</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'price')}
                        onDoubleClick={() => handleAutoFitColWidth('price')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    <th
                      className="py-2 px-2 text-center text-[14px] font-extrabold relative select-none"
                      style={{ width: `${colWidths.action}px`, minWidth: `${colWidths.action}px` }}
                    >
                      <span>관리</span>
                      <div
                        onMouseDown={(e) => handleColResizeStart(e, 'action')}
                        onDoubleClick={() => handleAutoFitColWidth('action')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/resize hover:bg-blue-500/20"
                        title="드래그: 열 너비 조절 | 더블클릭: 내용에 맞게 자동 맞춤 (Auto-fit)"
                      >
                        <div className="w-[1px] h-4 bg-slate-300 group-hover/resize:bg-blue-600 group-hover/resize:w-[2px] transition-all" />
                      </div>
                    </th>
                    {/* 13. 우측 여백 흡수 열 (Ghost Spacer: 남는 와이드 화면 공간을 100% 흡수하여 데이터 12열 크기 보존) */}
                    <th className="p-0 bg-slate-100 border-b border-slate-200 select-none pointer-events-none" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 font-sans">
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        기준정보 데이터를 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400">
                        {searchTerm.trim() ? (
                          <>검색어 &apos;{searchTerm}&apos;에 일치하는 품목이 없습니다.</>
                        ) : categoryFilter !== 'ALL' ? (
                          <>&apos;{PART_CATEGORIES.find(c => c.id === categoryFilter)?.label || categoryFilter}&apos; 분류에 등록된 마스터 품목이 없습니다.</>
                        ) : (
                          <>등록된 마스터 품목이 없습니다. 상단 [신규 품목 등록] 또는 [엑셀 일괄 업로드]를 진행해 주세요.</>
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((it, idx) => {
                      const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                      const isSelected = selectedIds.includes(it.id);
                      const breakdown = getPartCostBreakdown(it, materialRates, processRates);

                      return (
                        <tr
                          key={it.id || it.master_code || `master-item-${globalIdx}`}
                          onClick={() => handleToggleSelect(it.id)}
                          className={`cursor-pointer select-none border-b border-slate-200/80 min-h-[36px] ${
                            isSelected
                              ? 'bg-blue-100/80 hover:bg-blue-100'
                              : idx % 2 === 1
                                ? 'bg-slate-100/60 hover:bg-blue-50/80'
                                : 'bg-white hover:bg-blue-50/80'
                          }`}
                          title="클릭하여 품목을 선택/해제합니다."
                        >
                          <td
                            className="py-1.5 px-2 text-center"
                            style={{ boxShadow: isSelected ? 'inset 3px 0 0 #2563eb' : 'none' }}
                          >
                            <div className="flex items-center justify-center">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-center text-slate-500 font-mono text-[14px] font-bold">{globalIdx}</td>
                          <td className="py-1.5 px-4 font-mono font-bold text-blue-700 truncate text-[14.5px] tabular-nums" title={it.master_code}>
                            {it.master_code}
                          </td>
                          <td className="py-1.5 px-4 font-bold text-slate-900 truncate text-[15px]" title={it.standard_name}>
                            {it.standard_name}
                          </td>

                          {/* 0. 재질 (소재 시세 · 재료비와 직결되도록 전진 배치 & 선명한 15px 굵은 폰트) */}
                          <td className="py-1.5 px-4 text-left font-bold text-slate-900 text-[15px] truncate" title={it.material || 'SS400'}>
                            {it.material || 'SS400'}
                          </td>

                          {/* 1. 소재 시세 · 재료비 (방법 1: 시세 좌측 + 금액 우측끝 고정 정렬 & 균일한 40px 간격 형성) */}
                          <td className="py-1.5 pl-4 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2.5 leading-none">
                              <span className="text-[14px] text-slate-600 font-normal font-mono whitespace-nowrap" title={`소재 시세: ${breakdown.materialRatePerKg.toLocaleString()}원/kg`}>
                                ({breakdown.materialRatePerKg.toLocaleString()}원/kg)
                              </span>
                              {breakdown.materialCost > 0 ? (
                                <span className="font-mono font-bold text-slate-900 text-[15px] tabular-nums min-w-[72px] text-right">
                                  ₩{breakdown.materialCost.toLocaleString()}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-300 text-[14px] min-w-[72px] text-right">-</span>
                              )}
                            </div>
                          </td>

                          {/* 2. 가공 단가 · 표준 공임 (방법 1: 공정/공수 좌측 + 가공비 우측끝 고정 정렬 & 균일한 40px 간격 형성) */}
                          <td className="py-1.5 pl-4 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2.5 leading-none">
                              <span className="text-[14px] text-blue-600 font-normal font-mono truncate max-w-[145px]" title={`가공비: ${breakdown.processName} (${breakdown.processRateStr})`}>
                                ({breakdown.processName}{breakdown.cycleTimeHours > 0 ? ` ${breakdown.cycleTimeHours}h` : ''})
                              </span>
                              {breakdown.processCost > 0 ? (
                                <span className="font-mono font-bold text-blue-700 text-[15px] tabular-nums min-w-[72px] text-right">
                                  ₩{breakdown.processCost.toLocaleString()}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-300 text-[14px] min-w-[72px] text-right">-</span>
                              )}
                            </div>
                          </td>

                          {/* 3. 후처리 · 열처리 (방법 1: 후처리 뱃지 좌측 + 후처리비 우측끝 고정 정렬 & 균일한 40px 간격 형성) */}
                          <td className="py-1.5 pl-4 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2.5 leading-none">
                              {breakdown.treatmentCost > 0 ? (
                                <>
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[12.5px] font-bold border border-emerald-200 leading-none truncate max-w-[115px]" title={breakdown.treatmentName}>
                                    {breakdown.treatmentName}
                                  </span>
                                  <span className="font-mono font-extrabold text-emerald-800 text-[14.5px] tabular-nums min-w-[65px] text-right">
                                    ₩{breakdown.treatmentCost.toLocaleString()}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[12.5px] text-slate-400 font-medium truncate max-w-[115px]" title={breakdown.treatmentName}>
                                    ({breakdown.treatmentName})
                                  </span>
                                  <span className="font-mono text-slate-300 text-[14px] min-w-[65px] text-right">-</span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-1.5 px-4 text-left font-mono font-normal text-slate-800 truncate text-[14px] tabular-nums">
                            {(() => {
                              const rawSpec = it.specification;
                              const effectiveSpec = !isNoiseSpec(rawSpec)
                                ? rawSpec
                                : inferPartSpecification({
                                    name: it.standard_name,
                                    code: it.master_code,
                                    category: it.category,
                                    material: it.material,
                                    existingSpec: rawSpec
                                  });

                              if (effectiveSpec && effectiveSpec !== '-') {
                                return (
                                  <span className="font-mono font-normal text-slate-800" title={`부품 규격(Spec): ${effectiveSpec}`}>
                                    {effectiveSpec}
                                  </span>
                                );
                              }
                              return <span className="font-mono text-slate-300 font-normal">-</span>;
                            })()}
                          </td>
                          {/* 🏷️ 부품 분류 · 실무 대표 품목 통합 열 (원클릭 스마트 피커 연동) */}
                          <td className="py-1.5 px-4 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const subItem = customSubItems[it.id] || detectPartSubItem(it.standard_name, it.category, it.master_code);
                              const catLabel = getPartCategoryLabel(it.category);
                              const hasDistinctSubItem = Boolean(subItem && subItem !== catLabel && subItem !== '가공품');

                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategoryPickerState({
                                      isOpen: true,
                                      mode: 'inline',
                                      targetId: it.id,
                                      targetInfo: { code: it.master_code, name: it.standard_name, spec: it.specification },
                                      currentCategory: it.category || 'MACHINING'
                                    });
                                  }}
                                  className="inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-lg border border-slate-200/90 hover:border-blue-400 bg-white hover:bg-blue-50/70 text-left transition-colors cursor-pointer shadow-2xs group max-w-[210px]"
                                  title={`클릭하여 부품 분류 & 대표 품목 스마트 피커 열기 (현재: ${catLabel}${hasDistinctSubItem ? ` > ${subItem}` : ''})`}
                                >
                                  {/* 대분류 (분류 고유 컬러 텍스트) */}
                                  <span className={`font-bold text-[13px] ${getPartCategoryTextClass(it.category)} leading-none shrink-0`}>
                                    {catLabel}
                                  </span>

                                  {/* 대표 품목이 있을 때 브레드크럼 구분자 및 대표 품목명 표출 */}
                                  {hasDistinctSubItem && (
                                    <>
                                      <span className="text-slate-300 font-normal text-[12px] leading-none select-none shrink-0">›</span>
                                      <span className="font-normal text-[13px] text-slate-800 group-hover:text-blue-700 leading-none truncate max-w-[110px]">
                                        {subItem}
                                      </span>
                                    </>
                                  )}

                                  {/* 드롭다운 화살표 */}
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0 ml-0.5" />
                                </button>
                              );
                            })()}
                          </td>
                          {editingPriceId === it.id ? (
                            <td className="py-1 pl-4 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                              <div
                                className="inline-flex items-center gap-1 bg-white border-2 border-blue-500 rounded-lg px-2.5 py-0.5 shadow-2xs ring-2 ring-blue-100 justify-end w-full max-w-[170px] h-[28px]"
                                title={
                                  selectedIds.includes(it.id) && selectedIds.length > 1
                                    ? `Enter: 단일 저장 | Ctrl+Enter: 선택된 ${selectedIds.length}개 일괄 동시 적용`
                                    : 'Enter: 저장 | Esc: 취소'
                                }
                              >
                                {selectedIds.includes(it.id) && selectedIds.length > 1 && (
                                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded font-bold shrink-0 border border-blue-200">
                                    Ctrl+↵
                                  </span>
                                )}
                                <span className="text-slate-400 font-mono text-[13px] shrink-0 font-bold">₩</span>
                                <input
                                  type="text"
                                  autoFocus
                                  value={
                                    it.unit_price > 0
                                      ? it.unit_price.toLocaleString()
                                      : ''
                                  }
                                  placeholder="0"
                                  maxLength={15}
                                  onBlur={() => setEditingPriceId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      // ⚡ 추천 2: Ctrl+Enter 다중 선택 품목 동시 적용
                                      if ((e.ctrlKey || e.metaKey) && selectedIds.includes(it.id) && selectedIds.length > 1) {
                                        const currentPrice = it.unit_price;
                                        setItems((prev) =>
                                          prev.map((p) => (selectedIds.includes(p.id) ? { ...p, unit_price: currentPrice } : p))
                                        );
                                        setModifiedItems((prev) => {
                                          const next = { ...prev };
                                          selectedIds.forEach((id) => { next[id] = currentPrice; });
                                          return next;
                                        });
                                      }
                                      setEditingPriceId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingPriceId(null);
                                    }
                                  }}
                                  onChange={(e) => handleInlinePriceChange(it.id, e.target.value)}
                                  className="w-full text-right font-mono font-black text-[15px] text-blue-700 outline-none bg-transparent"
                                />
                                {modifiedItems[it.id] !== undefined && (
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="수정됨 (저장 대기)" />
                                )}
                              </div>
                            </td>
                          ) : (
                            <td
                              className="py-1.5 pl-4 pr-6 text-right font-mono font-black text-blue-700 text-[15.5px] tabular-nums hover:bg-blue-100/60 cursor-pointer whitespace-nowrap leading-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPriceId(it.id);
                              }}
                              title="클릭하여 단가 즉시 수정"
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                {modifiedItems[it.id] !== undefined && (
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="수정됨 (저장 대기)" />
                                )}
                                <span>{it.unit_price > 0 ? `₩${it.unit_price.toLocaleString()}` : '-'}</span>
                              </div>
                            </td>
                          )}
                          <td className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(it.id, it.master_code);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                          {/* 13. 우측 여백 흡수 셀 (줄무늬 및 하단 테두리 일체감 유지) */}
                          <td className="py-1.5 px-0 pointer-events-none" />
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>

              {/* Standard Pagination Navigation Bar (최적화 슬림 고정형 & 3구역 정렬) */}
              {filteredItems.length > 0 && (
                <div className="py-1 px-3 sm:px-4 border-t border-slate-200 bg-white/95 backdrop-blur-xs flex flex-col sm:flex-row items-center justify-between gap-2 text-[12.5px] text-slate-600 shrink-0 font-medium shadow-[0_-2px_6px_rgba(0,0,0,0.02)] h-11">
                  {/* 좌측: 건수 정보 및 페이지 정보 */}
                  <div className="flex items-center space-x-2 text-slate-600">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-0.5" />
                    <span>
                      총 <strong className="text-slate-900 font-black">{filteredItems.length.toLocaleString()}</strong>개 항목 중{' '}
                      <span className="font-mono font-bold text-slate-800">
                        {filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
                        {Math.min(filteredItems.length, currentPage * pageSize)}
                      </span>
                      개 표시
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500 font-medium">
                      전체 <strong className="text-slate-800 font-bold">{totalPages}</strong>페이지
                    </span>
                  </div>

                  {/* 중앙: 페이지 번호 네비게이션 버튼 그룹 */}
                  <div className="flex items-center space-x-1">
                    {/* 첫 페이지 버튼 */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage <= 1}
                      className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold transition-all cursor-pointer shadow-2xs h-7 w-7 flex items-center justify-center"
                      title="첫 페이지"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* 이전 페이지 버튼 */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:pointer-events-none text-[12px] font-bold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs h-7"
                      title="이전 페이지"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>이전</span>
                    </button>

                    {/* 페이지 번호 버튼 목록 */}
                    {getPageNumbers().map((pageNum) => (
                      <button
                        key={`page-${pageNum}`}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-w-[28px] h-7 px-2 rounded text-[12.5px] font-black transition-all cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}

                    {/* 다음 페이지 버튼 */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:pointer-events-none text-[12px] font-bold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs h-7"
                      title="다음 페이지"
                    >
                      <span>다음</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    {/* 마지막 페이지 버튼 */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage >= totalPages}
                      className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold transition-all cursor-pointer shadow-2xs h-7 w-7 flex items-center justify-center"
                      title="마지막 페이지"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 우측: 페이지당 행 수 선택기 */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-600 text-[12px] font-bold">페이지당 행 수:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-0 bg-white border border-slate-300 rounded text-[12.5px] font-bold text-slate-800 cursor-pointer shadow-2xs outline-none h-7 hover:border-slate-400 transition-colors"
                    >
                      <option value={10}>10개씩 보기</option>
                      <option value={15}>15개씩 보기</option>
                      <option value={20}>20개씩 보기</option>
                      <option value={30}>30개씩 보기</option>
                      <option value={40}>40개씩 보기</option>
                      <option value={50}>50개씩 보기</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 3. 플로팅 다중 선택 & 인라인 일괄 작업 툴바 */}
            {selectedIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl px-5 py-3 shadow-2xl border border-slate-700 flex flex-wrap items-center gap-3 z-50 animate-in slide-in-from-bottom-4 max-w-[96vw]">
                {/* 선택 카운터 뱃지 */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {selectedIds.length}
                  </span>
                  <span className="font-bold text-[13px] text-slate-100">개 품목 선택됨</span>
                  {Object.keys(modifiedItems).length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50">
                      {Object.keys(modifiedItems).length}건 수정됨
                    </span>
                  )}
                </div>

                <div className="h-5 w-px bg-slate-700 hidden sm:block" />

                {/* 단가 일괄 증감 컨트롤러 (원자재 시세 변동 반영) */}
                <div className="flex items-center gap-1.5 text-xs font-sans">
                  <span className="text-xs text-slate-300 font-semibold">일괄 증감:</span>
                  {[
                    { label: '+5%', rate: 5 },
                    { label: '+10%', rate: 10 },
                    { label: '-5%', rate: -5 },
                    { label: '-10%', rate: -10 }
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => handleBulkRateAdjust(btn.rate)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-sans text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                      title={`선택된 ${selectedIds.length}개 품목의 단가를 ${btn.label} 일괄 조정합니다.`}
                    >
                      {btn.label}
                    </button>
                  ))}

                  {/* 직접 입력 일괄 변경 (오른쪽 버튼 폰트 기준 통일) */}
                  <div className="flex items-center gap-1.5 ml-1 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1">
                    <span className="text-slate-400 font-sans text-xs font-bold">₩</span>
                    <input
                      type="text"
                      value={bulkCustomPriceInput ? Number(bulkCustomPriceInput.replace(/[^0-9]/g, '')).toLocaleString() : ''}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                        setBulkCustomPriceInput(cleaned);
                      }}
                      maxLength={15}
                      placeholder="단가 직접 입력"
                      className="w-32 text-xs font-sans font-bold text-white bg-transparent outline-none placeholder:text-slate-400 text-right"
                    />
                    <span className="text-xs text-slate-300 font-semibold font-sans">원</span>
                    <button
                      type="button"
                      onClick={handleBulkApplyCustomPrice}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold font-sans transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      적용
                    </button>
                  </div>
                </div>

                <div className="h-5 w-px bg-slate-700 hidden sm:block" />

                {/* 부품 유형 일괄 변경 컨트롤러 (방안 B - 오른쪽 폰트 기준 통일) */}
                <div className="flex items-center gap-2 text-xs font-sans bg-slate-800 border border-slate-700 rounded-xl px-3 py-1">
                  <span className="text-xs text-slate-200 font-semibold flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-blue-400" />
                    유형:
                  </span>
                  <select
                    value={bulkCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__OPEN_PICKER__') {
                        setCategoryPickerState({
                          isOpen: true,
                          mode: 'bulk',
                          currentCategory: bulkCategory
                        });
                        return;
                      }
                      setBulkCategory(val);
                    }}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1 text-xs text-white outline-none cursor-pointer font-bold font-sans max-w-[190px] truncate"
                    title="선택된 품목들에 일괄 적용할 부품 유형 선택"
                  >
                    <option value="__OPEN_PICKER__" className="bg-blue-600 text-white font-bold py-1">
                      세부 품목 검색·선택...
                    </option>
                    <option
                      disabled
                      className="text-slate-400 bg-slate-800 font-bold text-[13px] text-center py-1"
                      style={{ textAlign: 'center', fontSize: '13px' }}
                    >
                      10대 분류 및 실무 대표 품목
                    </option>
                    {PART_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.subDetail})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCategoryPickerState({
                      isOpen: true,
                      mode: 'bulk',
                      currentCategory: bulkCategory
                    })}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-blue-200 rounded-lg text-xs font-bold font-sans flex items-center gap-1 transition-colors cursor-pointer"
                    title="10대 부품 분류 & 실무 품목 스마트 피커 열기"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>스마트 피커</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkApplyCategory}
                    disabled={isApplyingCategory}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold font-sans transition-colors cursor-pointer disabled:opacity-50"
                    title={`선택된 ${selectedIds.length}개 품목의 부품 유형을 일괄 변경합니다.`}
                  >
                    {isApplyingCategory ? '적용 중...' : '유형 일괄 적용'}
                  </button>
                </div>

                {/* ⚡ 추천 1: 스마트 원가·임률 일괄 설정 버튼 */}
                <button
                  type="button"
                  onClick={() => {
                    setBulkModalTargetPrice(bulkCustomPriceInput || '');
                    setShowBulkCostModal(true);
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95 border border-blue-400/40"
                  title="선택된 품목들의 가공설비, 임률, 후처리, 단가를 한 번에 시뮬레이션하고 일괄 설정합니다."
                >
                  <Calculator className="w-3.5 h-3.5 text-amber-300" />
                  <span>원가·임률 일괄 설정</span>
                </button>

                <div className="h-5 w-px bg-slate-700 hidden md:block" />

                {/* 메인 저장 및 액션 버튼들 */}
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSaveModifiedItems}
                    disabled={isSavingBatch}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50 ring-1 ring-emerald-400"
                    title="선택 및 수정한 단가를 DB에 일괄 저장합니다. (단축키: Ctrl + S)"
                  >
                    {isSavingBatch ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[13px]">선택 저장 (Ctrl+S)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="px-3 py-1.5 rounded-xl bg-rose-700/80 hover:bg-rose-600 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="선택된 마스터 품목을 삭제합니다."
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>삭제</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportSelectedExcel}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="선택된 마스터 품목들을 엑셀 파일로 다운로드합니다."
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>엑셀</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([]);
                      setModifiedItems({});
                    }}
                    className="ml-1 text-slate-400 hover:text-white text-xs cursor-pointer font-medium"
                  >
                    선택 해제
                  </button>
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'learned' ? (
          /* Tab: Learned (실무 자가학습 단가 풀 대장) */
          <div className="p-3 sm:p-4 space-y-3">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/30 text-purple-200 border border-purple-400/40">
                    AI Knowledge Base
                  </span>
                  <h2 className="text-base font-extrabold tracking-tight flex items-center gap-1.5">
                    <span>⚡ 실무 자가학습 단가 풀 (Manual Price Pool)</span>
                  </h2>
                </div>
                <p className="text-[16px] text-purple-200/90 leading-relaxed max-w-4xl break-keep">
                  도면 검수 승인 및 견적 산출 과정에서 사용자가 입력한 단가와 품목 정보가 AI에 의해 자동으로 누적 학습된 실무 단가 저장소입니다.<br />
                  도면 파일이나 견적 건이 삭제되어도 이 학습 데이터베이스는 <strong className="text-amber-300 font-bold">영구 보존</strong>되며, 필요 시 원클릭으로 사내 기준단가로 공식 등록할 수 있습니다.
                </p>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => fetchLearnedItems()}
                  disabled={loadingLearned}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold border border-white/20 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="최신 자가학습 데이터 새로고침"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLearned ? 'animate-spin' : ''}`} />
                  <span>새로고침</span>
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
              {/* 3-State Incubator Subfilter Pills */}
              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-lg border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setLearnedFilterTab('UNREGISTERED')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    learnedFilterTab === 'UNREGISTERED'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="사내 기준단가 대장에 아직 정식 등록되지 않은 신규 가공/견적 학습 품목만 모아봅니다."
                >
                  <span className={`w-2 h-2 rounded-full ${unregisteredCount > 0 ? 'bg-amber-200 animate-pulse' : 'bg-slate-300'}`} />
                  <span>사내 기준 미등록</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                    learnedFilterTab === 'UNREGISTERED' ? 'bg-amber-600 text-amber-100' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {unregisteredCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLearnedFilterTab('REGISTERED')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    learnedFilterTab === 'REGISTERED'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="사내 기준단가 대장에 이미 공식 등록되어 마스터로 관리 중인 품목을 모아봅니다."
                >
                  <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                  <span>등록 완료</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                    learnedFilterTab === 'REGISTERED' ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {registeredCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLearnedFilterTab('ALL')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    learnedFilterTab === 'ALL'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="등록 여부와 무관하게 전체 실무 자가학습 품목을 조회합니다."
                >
                  <span>전체</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                    learnedFilterTab === 'ALL' ? 'bg-purple-700 text-purple-100' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {learnedItems.length}
                  </span>
                </button>
              </div>

              {/* Search Box */}
              <div className="flex items-center space-x-2 w-full md:w-auto flex-1 max-w-sm">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={learnedSearchQuery}
                    onChange={(e) => setLearnedSearchQuery(e.target.value)}
                    placeholder="학습 품목명, 규격, 재질, 고객사 검색..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                  />
                  {learnedSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLearnedSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={handleExportLearnedExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="자가학습 단가 풀 대장을 엑셀 파일(.xlsx)로 내려받습니다."
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>엑셀 서식 다운로드</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(100vh-260px)]">
                <table className="w-full text-left border-collapse font-sans">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[14px] font-extrabold sticky top-0 z-10 select-none">
                    <tr>
                      <th className="py-2 px-2 text-center w-12">No.</th>
                      <th className="py-2 px-4 text-left min-w-[200px]">학습 품목명 (도면 원문 / 표준)</th>
                      <th className="py-2 px-4 text-left min-w-[170px]">규격 (Specification)</th>
                      <th className="py-2 px-4 text-left min-w-[90px]">재질 (Material)</th>
                      <th className="py-2 pl-4 pr-6 text-right min-w-[130px]">최근 학습단가</th>
                      <th className="py-2 px-3 text-center min-w-[95px]">검증 횟수</th>
                      <th className="py-2 px-3 text-center min-w-[85px]">출처</th>
                      <th className="py-2 px-4 text-left min-w-[110px]">고객사</th>
                      <th className="py-2 px-3 text-center min-w-[110px]">최근 학습일시</th>
                      <th className="py-2 px-3 text-center w-28">사내 기준 등록</th>
                      <th className="p-0 bg-slate-100 border-b border-slate-200 select-none pointer-events-none" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 font-sans">
                    {loadingLearned && learnedItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-600" />
                          <span>자가학습 단가 풀을 불러오는 중입니다...</span>
                        </td>
                      </tr>
                    ) : learnedItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          <span>아직 자가학습된 단가 데이터가 없습니다. 도면 승인 및 견적 작성 시 자동 축적됩니다.</span>
                        </td>
                      </tr>
                    ) : filteredLearnedItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          {learnedFilterTab === 'UNREGISTERED' ? (
                            <div className="flex flex-col items-center justify-center space-y-1.5 py-4">
                              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-1" />
                              <span className="font-bold text-slate-700 text-sm">현재 사내 기준 미등록 품목이 없습니다.</span>
                              <span className="text-xs text-slate-400">자가학습된 모든 실무 단가가 사내 기준단가 대장과 연동되어 있습니다.</span>
                            </div>
                          ) : (
                            <div className="py-4">
                              <span>조건에 일치하는 품목이 없습니다.</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredLearnedItems.map((item, idx) => {
                        const effectiveSpec = getEffectiveLearnedSpec(item);
                        const isRegistered = isItemRegisteredInStandard(item);
                        return (
                          <tr
                            key={item.id || idx}
                            onClick={() => setSelectedHistoryItem(item)}
                            className={`cursor-pointer select-none border-b border-slate-200/80 min-h-[36px] transition-colors ${
                              idx % 2 === 1 ? 'bg-slate-100/60 hover:bg-purple-50/80' : 'bg-white hover:bg-purple-50/80'
                            }`}
                            title="클릭하여 단가 수정/승인 이력 타임라인 보기"
                          >
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-500 text-[14px]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-4">
                              <div className="font-bold text-slate-900 text-[14px]">{item.item_name}</div>
                              {item.standard_name && item.standard_name !== item.item_name && (
                                <div className="text-[11.5px] text-purple-700 font-semibold leading-tight mt-0.5">
                                  표준명: {item.standard_name}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-4 text-left font-mono font-normal text-slate-800 truncate text-[14px] tabular-nums">
                              {effectiveSpec && effectiveSpec !== '-' ? (
                                <span className="font-mono font-normal text-slate-800" title={`부품 규격(Spec): ${effectiveSpec}`}>
                                  {effectiveSpec}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-4 font-mono font-bold text-slate-700 truncate text-[13.5px] tabular-nums">
                              {item.material || item.standard_material || 'SS400'}
                            </td>
                            <td className="py-1.5 pl-4 pr-6 text-right font-mono font-bold text-blue-700 text-[15px] tabular-nums whitespace-nowrap leading-none">
                              ₩{Number(item.unit_price || 0).toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedHistoryItem(item);
                                }}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-900 text-[12px] font-bold border border-purple-200 hover:border-purple-300 shadow-2xs transition-all cursor-pointer group"
                                title="클릭하여 단가 변천사 및 승인 이력 타임라인 보기"
                              >
                                <Clock className="w-3 h-3 text-purple-500 group-hover:rotate-45 transition-transform" />
                                <span>{item.approval_count || 1}회 승인</span>
                              </button>
                            </td>
                            <td className="py-1.5 px-3 text-center whitespace-nowrap text-[12.5px] text-slate-500 font-medium">
                              {item.source === 'DRAWING_APPROVAL' ? '도면승인' : item.source === 'QUOTE_MANUAL' ? '수동견적' : item.source === 'MASTER_REGISTERED' ? '마스터연동' : item.source || '자가학습'}
                            </td>
                            <td className="py-1.5 px-4 text-left whitespace-nowrap text-[13px] font-medium text-slate-700 truncate max-w-[130px]" title={item.company_name || '-'}>
                              {item.company_name || '-'}
                            </td>
                            <td className="py-1.5 px-3 text-center font-mono text-slate-500 text-[12.5px] tabular-nums whitespace-nowrap">
                              {item.last_used_at?.slice(0, 10) || item.created_at?.slice(0, 10) || '-'}
                            </td>
                            <td className="py-1.5 px-3 text-center whitespace-nowrap">
                              {isRegistered ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[12px] font-bold border border-slate-200 select-none cursor-default"
                                  title="사내 기준단가 대장에 이미 공식 등록되어 있는 품목입니다."
                                >
                                  <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                  <span>등록 완료</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePromoteToStandard(item);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[12px] font-bold shadow-2xs transition-colors cursor-pointer"
                                  title="이 실무 단가를 사내 기준단가 대장에 공식 등록합니다."
                                >
                                  <Sparkles className="w-3 h-3 text-purple-200" />
                                  <span>기준 등록</span>
                                </button>
                              )}
                            </td>
                            <td className="p-0 pointer-events-none" />
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Settings (소재 시세 & 임률 설정) */
          <div className="m-3 sm:m-4 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">공학 표준 원가 기초 파라미터 설정</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  마스터에 없는 신규 부품 견적 시, 도면 치수와 결합되어 표준 원가를 자동 계산하는 사내 기준표입니다.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>설정 저장</span>
              </button>
            </div>

            {/* 💡 출발점(기본 추정치) 안내 배너 */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>안내: 가공 임률은 업계 표준 추정값(출발점)입니다</span>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 text-[10px] rounded font-mono font-medium">출발점 (Base Heuristic)</span>
                </p>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  본 임률은 절대값이 아닌 초기 계산을 위한 출발 기준선입니다. 
                  담당자가 견적 검토 화면에서 실제 거래 단가를 확정함에 따라, 시스템이 누적된 오차(Delta)와 도면 형상 피처를 분석하여 실제 공장 맞춤형 임률을 역산하고 자동 보정해 나갑니다.
                </p>
              </div>
            </div>

            {/* 🔒 회귀 엔진 상태 배너: 데이터 축적 중 명시 */}
            <div className="bg-slate-100/90 border border-slate-300 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800">
                  실거래 단가 기반 회귀 임률 역산 엔진
                </span>
                <span className="text-[10px] bg-amber-100 border border-amber-300 text-amber-800 px-2 py-0.5 rounded font-mono font-bold">
                  데이터 축적 모드 (가동 보류)
                </span>
              </div>
              <div className="text-[11px] text-slate-600">
                실무자 확정 표본: <strong className="text-slate-900 font-mono">0건</strong> (공정별 최소 10건 축적 시 자동 활성화)
              </div>
            </div>

            {/* 💡 3단계 담당자 눈높이 도구: 1) 실시간 견적 영향도 미리보기 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-800">
                    실시간 견적 영향도 미리보기 (대표 5대 부품 시뮬레이션)
                  </h3>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                    임률 수정 즉시 연동
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  ※ 아래 임률표의 수치를 변경하면 대표 부품들의 견적 변동액이 실시간으로 계산됩니다.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {BENCHMARK_PARTS.map((p) => {
                  const basePrice = calculateBenchmarkPrice(p, {
                    SHEET_LASER_PER_METER: 1800,
                    SHEET_BEND_PER_STROKE: 800,
                    SHEET_PIERCING_RATE: 80,
                    HOURLY_MACHINE_RATE: 45000,
                    SETUP_BASE_COST: 30000,
                    DEFAULT_MARGIN_RATE: 0.18
                  });
                  const currentPrice = calculateBenchmarkPrice(p, processRates);
                  const diff = currentPrice - basePrice;
                  const diffPct = basePrice > 0 ? Number(((diff / basePrice) * 100).toFixed(1)) : 0;

                  return (
                    <div key={p.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {p.categoryLabel}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 font-semibold">{p.material}</span>
                      </div>
                      <div className="font-bold text-[13.5px] text-slate-900 truncate" title={p.name}>
                        {p.name}
                      </div>
                      <div className="font-mono text-[12.5px] text-slate-500 truncate tabular-nums">{p.spec}</div>
                      <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[11.5px] text-slate-500 font-medium">예상 견적</span>
                        <span className="font-mono font-bold text-[15px] text-slate-900 tabular-nums">
                          ₩{currentPrice.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">기준 대비</span>
                        <span className={`font-mono font-bold tabular-nums ${
                          diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-blue-600' : 'text-slate-400'
                        }`}>
                          {diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? diff.toLocaleString() : '0'} ({diffPct > 0 ? `+${diffPct}` : diffPct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 💡 3단계 담당자 눈높이 도구: 2) 목표 단가 기반 임률 역산기 */}
            <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-indigo-950">
                    목표 단가 기반 임률 역산기 (Reverse Rate Estimator)
                  </h3>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">
                    "이 부품 3만원 맞추기"
                  </span>
                </div>
                {appliedNotice && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg animate-pulse">
                    ✓ {appliedNotice}
                  </span>
                )}
              </div>

              <div className="bg-white p-3 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[11.5px] text-slate-600 font-bold block">대상 부품 선택</label>
                  <select
                    value={selectedEstimatorIndex}
                    onChange={(e) => setSelectedEstimatorIndex(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {BENCHMARK_PARTS.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        [{p.categoryLabel}] {p.name} ({p.spec})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3 space-y-1">
                  <label className="text-[11.5px] text-slate-600 font-bold block">목표 희망 단가 (원)</label>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-400 font-mono font-bold">₩</span>
                    <input
                      type="number"
                      value={targetPriceInput}
                      onChange={(e) => setTargetPriceInput(Number(e.target.value))}
                      placeholder="30000"
                      className="w-full text-right font-mono text-[15px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 tabular-nums"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 md:pt-0">
                  <button
                    onClick={handleRunReverseEstimate}
                    disabled={reverseEstimating || targetPriceInput <= 0}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {reverseEstimating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                    <span>임률 역산</span>
                  </button>
                </div>

                <div className="md:col-span-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                  {reverseResult ? (
                    <div className="space-y-1.5">
                      <p className="text-slate-700 leading-snug">{reverseResult.guidance}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {reverseResult.recommendedBendRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('bend')}
                            className="px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            절곡 {reverseResult.recommendedBendRate.toLocaleString()}원 적용
                          </button>
                        )}
                        {reverseResult.recommendedCutRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('cut')}
                            className="px-2 py-0.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            절단 {reverseResult.recommendedCutRate.toLocaleString()}원 적용
                          </button>
                        )}
                        {reverseResult.recommendedMachineRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('mach')}
                            className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            임률 {reverseResult.recommendedMachineRate.toLocaleString()}원 적용
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      부품과 목표 단가를 입력하고 [임률 역산] 버튼을 누르면 추천 임률이 가이드됩니다.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 좌측: 소재별 시세 (5 cols) */}
              <div className="lg:col-span-5 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>소재별 kg당 기준 시세 (원/kg)</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono font-medium">총 {Object.keys(materialRates).length}개 강종</span>
                </div>
                
                {/* 표준 마스터 그리드 테이블 */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="max-h-[640px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-slate-600 text-[12px] font-bold">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12 font-mono text-slate-400">No.</th>
                          <th className="py-2.5 px-3">강종 / 소재명</th>
                          <th className="py-2.5 px-3 text-right">기준 시세 (원/kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {Object.entries(materialRates).map(([mat, rate], idx) => (
                          <tr key={mat} className="hover:bg-blue-50/40 transition-colors group">
                            <td className="py-2.5 px-3 text-center font-mono text-[13px] font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span className="font-mono text-[14px] font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                  {mat}
                                </span>
                                <span className="text-[11.5px] text-slate-500 font-medium">
                                  {MATERIAL_NAMES[mat] || '일반 금속/수지재'}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center space-x-1.5 justify-end">
                                <span className="text-slate-400 font-mono text-[13px] font-bold">₩</span>
                                <input
                                  type="number"
                                  value={rate}
                                  onChange={(e) => setMaterialRates({ ...materialRates, [mat]: Number(e.target.value) })}
                                  className="w-28 text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                                />
                                <span className="text-slate-600 font-mono text-[12.5px] font-medium w-8 text-left">/kg</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 우측: 공정별 가공 임률 및 표준 원가 파라미터 (7 cols) */}
              <div className="lg:col-span-7 space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>제조업 공정별 표준 가공 임률 & 파라미터</span>
                </h3>

                <div className="space-y-3.5 max-h-[640px] overflow-y-auto pr-1">
                  {/* 1. 기계 가공 (절삭) */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-blue-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                        <Factory className="w-4 h-4 text-blue-600" />
                        <span className="text-[13px]">1. 기계 가공 (절삭 / 선반 / 밀링)</span>
                      </div>
                      <span className="text-[10.5px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md font-bold">
                        기본 추정치 (Base Heuristic)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">CNC / 머시닝센터 시간당 임률</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_MACHINE_RATE'] || 45000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_MACHINE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-blue-700 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-blue-600 font-mono text-[12.5px] font-bold shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">범용 선반 / 밀링 시간당 임률</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_LATHE_RATE'] || 40000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_LATHE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-blue-700 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-blue-600 font-mono text-[12.5px] font-bold shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-blue-800 block mb-1">가공 준비 셋업 기본료 (소량보전)</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['SETUP_BASE_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'SETUP_BASE_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-blue-300 rounded-lg px-2.5 py-1.5 text-blue-900 bg-blue-50/40 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 tabular-nums transition-all"
                          />
                          <span className="text-blue-700 font-mono text-[12.5px] font-bold shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 판금 / 제관 (Sheet Metal) */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-cyan-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-800">
                        <Scissors className="w-4 h-4 text-cyan-600" />
                        <span className="text-[13px]">2. 판금 / 제관 (레이저 절단 / 피어싱 / 절곡 / 용접)</span>
                      </div>
                      <span className="text-[10.5px] bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-md font-bold">
                        기본 추정치 (Base Heuristic)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">레이저 외곽 절단 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_LASER_PER_METER'] || 1800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_LASER_PER_METER': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-cyan-800 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-cyan-700 font-mono text-[12.5px] font-bold shrink-0">원/m</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-cyan-800 block mb-1">레이저 피어싱(홀당) 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_PIERCING_RATE'] || 80}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_PIERCING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-cyan-300 rounded-lg px-2.5 py-1.5 text-cyan-900 bg-cyan-50/40 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-500 tabular-nums transition-all"
                          />
                          <span className="text-cyan-800 font-mono text-[12.5px] font-bold shrink-0">원/홀</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">절곡(Bending) 1회 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_BEND_PER_STROKE'] || 800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_BEND_PER_STROKE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-cyan-800 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-cyan-700 font-mono text-[12.5px] font-bold shrink-0">원/회</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">제관 용접 시간당 임률</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_WELDING_RATE'] || 38000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_WELDING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-cyan-800 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-cyan-700 font-mono text-[12.5px] font-bold shrink-0">원/h</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 주조 / 주물 (Casting) */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-amber-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <Layers className="w-4 h-4 text-amber-600" />
                        <span className="text-[13px]">3. 주조 / 주물 (형상 성형 및 주물 가공)</span>
                      </div>
                      <span className="text-[10.5px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md font-bold">
                        기본 추정치 (Base Heuristic)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">주조 형상 성형 kg당 공정비</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['CASTING_PER_KG_RATE'] || 2500}
                            onChange={(e) => setProcessRates({ ...processRates, 'CASTING_PER_KG_RATE': Number(e.target.value) })}
                            className="w-full max-w-[240px] text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-amber-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-amber-800 font-mono text-[12.5px] font-bold shrink-0">원/kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. 후처리 / 열처리 (외주 2차 공정 세창 직영 통제) */}
                  <div className="bg-white p-3.5 rounded-xl border border-purple-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-purple-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span className="text-[13px]">4. 외주 2차 가공 공정비 (세창 직영 통제)</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                        세창 본사 협정 기준가 적용
                      </span>
                    </div>

                    <div className="p-2.5 bg-purple-50/70 border border-purple-100 rounded-lg text-[11.5px] text-purple-900 leading-relaxed">
                      💡 <strong>외주 단가 통제:</strong> 열처리, 도금, 도장 등 2차 공정은 외주 공장에 단가 결정을 일임하지 않고, 세창인터내쇼날 본사에서 협약된 기준 단가표로 도면 분석 시 일괄 산출하여 원가 누수를 완벽히 방지합니다.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                      <div>
                        <span className="text-[11.5px] font-bold text-emerald-950 block mb-1">분체도장 ㎡당 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['PAINTING_PER_SQM'] || 9000}
                            onChange={(e) => setProcessRates({ ...processRates, 'PAINTING_PER_SQM': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[14.5px] font-extrabold border border-emerald-300 rounded-lg px-2.5 py-1.5 text-emerald-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 bg-emerald-50/30 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-emerald-700 font-mono text-[12px] font-bold shrink-0">원/㎡</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-emerald-950 block mb-1">아노다이징 개당 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['ANODIZING_PER_UNIT'] || 1500}
                            onChange={(e) => setProcessRates({ ...processRates, 'ANODIZING_PER_UNIT': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[14.5px] font-extrabold border border-emerald-300 rounded-lg px-2.5 py-1.5 text-emerald-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 bg-emerald-50/30 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-emerald-700 font-mono text-[12px] font-bold shrink-0">원/개</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-emerald-950 block mb-1">열처리(Q/T) kg당 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['HEAT_TREATMENT_PER_KG'] || 1200}
                            onChange={(e) => setProcessRates({ ...processRates, 'HEAT_TREATMENT_PER_KG': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[14.5px] font-extrabold border border-emerald-300 rounded-lg px-2.5 py-1.5 text-emerald-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 bg-emerald-50/30 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-emerald-700 font-mono text-[12px] font-bold shrink-0">원/kg</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-emerald-950 block mb-1">도금/착색 개당 단가</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['PLATING_PER_UNIT'] || 1200}
                            onChange={(e) => setProcessRates({ ...processRates, 'PLATING_PER_UNIT': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[14.5px] font-extrabold border border-emerald-300 rounded-lg px-2.5 py-1.5 text-emerald-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 bg-emerald-50/30 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-emerald-700 font-mono text-[12px] font-bold shrink-0">원/개</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-purple-900 block mb-1">외주 최소 로트 기본료</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['TREATMENT_MIN_LOT_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'TREATMENT_MIN_LOT_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[14.5px] font-extrabold border border-purple-300 rounded-lg px-2.5 py-1.5 text-purple-950 bg-purple-50/40 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500 tabular-nums transition-all"
                          />
                          <span className="text-purple-800 font-mono text-[12px] font-bold shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. 조달 관리 & 모듈 조립 & 물류 & 마진율 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                      <Wrench className="w-4 h-4 text-slate-600" />
                      <span className="text-[13px]">5. 조달 관리비율 & 조립 공수 & 물류 & 표준 마진</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">전장/구매품 조달관리율 (%)</span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['ELECTRICAL_OVERHEAD_RATE'] ?? 0.08) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'ELECTRICAL_OVERHEAD_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-slate-600 font-mono text-[12.5px] font-bold shrink-0">%</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">유닛 조립/배선 시간당 임률</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-[12px] font-bold">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_ASSEMBLY_RATE'] || 35000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_ASSEMBLY_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-500 bg-slate-50 focus:bg-white tabular-nums transition-all"
                          />
                          <span className="text-slate-600 font-mono text-[12.5px] font-bold shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-700 block mb-1">포장 및 출하 물류비율 (%)</span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['PACKAGING_SHIPPING_RATE'] ?? 0.03) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'PACKAGING_SHIPPING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 bg-slate-50 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-500 tabular-nums transition-all"
                          />
                          <span className="text-slate-600 font-mono text-[12.5px] font-bold shrink-0">% (3%)</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-blue-900 block mb-1">표준 목표 마진율 (%)</span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['DEFAULT_MARGIN_RATE'] ?? 0.18) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'DEFAULT_MARGIN_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono text-[15px] font-bold border border-blue-300 rounded-lg px-2.5 py-1.5 text-blue-900 bg-blue-50/50 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 tabular-nums transition-all"
                          />
                          <span className="text-blue-700 font-mono text-[12.5px] font-bold shrink-0">% (기준 18%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal 1: Create Single Item */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>신규 마스터 품목 등록</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">마스터 코드 *</label>
                  <input
                    type="text"
                    required
                    placeholder="예: SF-101, MB-001"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-slate-700 block">부품 유형</label>
                    <button
                      type="button"
                      onClick={() => setCategoryPickerState({
                        isOpen: true,
                        mode: 'add',
                        targetInfo: { code: newCode, name: newName, spec: newSpec },
                        currentCategory: newCategory
                      })}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="10대 부품 분류 및 실무 대표 품목 스마트 피커 열기"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>스마트 피커</span>
                    </button>
                  </div>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__OPEN_PICKER__') {
                        setCategoryPickerState({
                          isOpen: true,
                          mode: 'add',
                          targetInfo: { code: newCode, name: newName, spec: newSpec },
                          currentCategory: newCategory
                        });
                        return;
                      }
                      setNewCategory(val);
                    }}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                  >
                    <option value="__OPEN_PICKER__" className="bg-blue-600 text-white font-bold">
                      세부 품목 검색·선택...
                    </option>
                    <optgroup label="── 도면 기반 가공/제작품 ──">
                      <option value="MACHINING">기계 가공품 (Machining - 절삭/선반/밀링)</option>
                      <option value="SHEET_METAL">판금/제관품 (Sheet Metal / Weldment)</option>
                      <option value="INJECTION">사출/성형품 (Injection / Molding / Extrusion)</option>
                      <option value="CASTING">주조/단조품 (Casting / Forging)</option>
                    </optgroup>
                    <optgroup label="── 표준 기성 구매품 (Off-The-Shelf) ──">
                      <option value="MECHANICAL">기계요소 구동품 (Bearings / LM / Couplings)</option>
                      <option value="COMMERCIAL">표준 규격품/철물 (Hardware / Fasteners)</option>
                      <option value="ELECTRICAL">전장/공압품 (Electric & Pneumatic)</option>
                    </optgroup>
                    <optgroup label="── 특수 조달 및 모듈 ──">
                      <option value="IMPORTED">해외 수입품 (Direct Import / Foreign)</option>
                      <option value="SUPPLIED">고객 지급품 (Customer-Supplied / 사급 자재)</option>
                      <option value="ASSEMBLY">조립품/모듈 (Sub-Assembly / Module)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">표준 품명 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: MOTOR BRACKET, SHAFT"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">규격 (Specification)</label>
                  <input
                    type="text"
                    placeholder="예: 150x120x10T, DIA 25x300L"
                    value={newSpec}
                    onChange={(e) => setNewSpec(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">표준 재질 (최대 30자)</label>
                  <input
                    type="text"
                    placeholder="예: SS400, AL6061-T651, SUS304, MC NYLON"
                    value={newMaterial}
                    maxLength={30}
                    onChange={(e) => setNewMaterial(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">사내 기준단가 (원 - 최대 백억 원대)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₩</span>
                  <input
                    type="text"
                    placeholder="예: 45,000 (최대 백억 원 단위)"
                    value={newPrice > 0 ? newPrice.toLocaleString() : ''}
                    maxLength={15}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                      setNewPrice(parseInt(cleaned, 10) || 0);
                    }}
                    className="w-full border border-slate-200 rounded-lg p-2 pl-7 font-mono text-blue-700 font-bold text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                >
                  {savingItem ? '저장 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Bulk Import */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>엑셀/CSV 마스터 단가 대량 일괄 등록</span>
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 템플릿 다운로드 안내 박스 */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center space-x-1.5 text-emerald-900 font-bold">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>표준 엑셀 템플릿 양식에 맞춰 작성 후 업로드하세요</span>
                  </div>
                  <p className="text-emerald-700 text-[11px] mt-1">
                    <strong>품목코드, 품명, 규격, 재질, 부품분류, 기준단가</strong> 열이 포함된 엑셀(.xlsx) 및 CSV 파일을 완벽 지원합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center space-x-1.5 shrink-0 cursor-pointer shadow-2xs transition-colors"
                  title="CADON 마스터 기준정보 표준 엑셀 서식 다운로드"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>양식 다운로드 (.xlsx)</span>
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="w-full p-3 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600"
              />

              {importedPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>미리보기 ({importedPreview.length}건 감지됨)</span>
                  </div>
                  <div className="max-h-56 overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2">품목코드</th>
                          <th className="p-2">품명</th>
                          <th className="p-2">규격</th>
                          <th className="p-2">재질</th>
                          <th className="p-2 text-right">단가</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedPreview.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            <td className="p-2 font-mono">{row.master_code || row['품목코드'] || row['도면번호']}</td>
                            <td className="p-2">{row.standard_name || row['품명']}</td>
                            <td className="p-2 font-mono">{row.specification || row['규격']}</td>
                            <td className="p-2">{row.material || row['재질']}</td>
                            <td className="p-2 text-right font-mono font-bold text-blue-700">
                              ₩{Number(row.unit_price || row['기준단가'] || row['단가'] || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importedPreview.length > 10 && (
                    <span className="text-[10px] text-slate-400 block text-right">외 {importedPreview.length - 10}건 생략...</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={importing || importedPreview.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {importing ? '적재 중...' : `${importedPreview.length}건 DB로 적재하기`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 10대 부품 분류 & 실무 대표 품목 스마트 피커 모달 */}
      <PartCategoryPickerModal
        isOpen={categoryPickerState.isOpen}
        onClose={() => setCategoryPickerState((prev) => ({ ...prev, isOpen: false }))}
        selectedCategory={categoryPickerState.currentCategory}
        targetItemInfo={categoryPickerState.targetInfo}
        onSelect={(category, selectedSubItem) => {
          if (categoryPickerState.mode === 'inline' && categoryPickerState.targetId) {
            handleInlineCategoryChange(categoryPickerState.targetId, category);
            if (selectedSubItem) {
              setCustomSubItems(prev => ({ ...prev, [categoryPickerState.targetId!]: selectedSubItem }));
            }
          } else if (categoryPickerState.mode === 'bulk') {
            setBulkCategory(category);
          } else if (categoryPickerState.mode === 'add') {
            setNewCategory(category);
            // 품명이 비어있고 대표 품목이 선택된 경우 자동 제안
            if (!newName.trim() && selectedSubItem) {
              setNewName(selectedSubItem);
            }
          }
          setCategoryPickerState((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* ⚡ 추천 1: 스마트 일괄 원가·임률 설정 모달 */}
      {showBulkCostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">선택 품목 일괄 원가·임률 설정</h3>
                  <p className="text-[11px] text-slate-300">선택된 {selectedIds.length}개 품목의 투입 설비, 후처리, 기준단가를 일괄 적용합니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkCostModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Selected items chip list */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1.5">선택된 대상 품목 ({selectedIds.length}건)</label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  {items.filter(it => selectedIds.includes(it.id)).map(it => (
                    <span key={it.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono text-slate-700 shadow-2xs">
                      <strong className="text-blue-600 font-semibold">{it.standard_name}</strong>
                      <span className="text-slate-400">({it.material || 'SS400'})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 1. 공통 가공설비 & 임률 */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">1. 적용 가공설비 & 기준 임률</label>
                <select
                  value={bulkModalProcess}
                  onChange={(e) => setBulkModalProcess(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                >
                  <option value="MACHINING_LATHE">CNC 선반 가공 (시간당 임률: 40,000원/h)</option>
                  <option value="MACHINING_MCT">MCT 머시닝센터 가공 (시간당 임률: 45,000원/h)</option>
                  <option value="SHEET_LASER">판금 레이저 절단 & 절곡 (1,800원/m · 800원/회)</option>
                  <option value="MACHINING_5AXIS">5축 / 고속 가공 (시간당 임률: 65,000원/h)</option>
                  <option value="COMMERCIAL_BUY">표준 기성품 규격 조달 (관리 마크업: 8%)</option>
                  <option value="CASTING_FOUNDRY">주조 / 주물 성형 (kg당 공정비: 2,500원/kg)</option>
                </select>
              </div>

              {/* 2. 공통 후처리 · 열처리 */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">2. 표준 후처리 · 열처리</label>
                <select
                  value={bulkModalTreatment}
                  onChange={(e) => setBulkModalTreatment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                >
                  <option value="QT">Q/T 열처리 (1,200원/kg)</option>
                  <option value="HIGH_FREQ">고주파 열처리 (국부 경화)</option>
                  <option value="ANODIZING">백색/흑색 아노다이징 (1,500원/개)</option>
                  <option value="POWDER_PAINT">분체도장 / 우레탄도장 (9,000원/㎡)</option>
                  <option value="ZINC_PLATE">삼가 아연도금 (1,200원/개)</option>
                  <option value="NICKEL_PLATE">무전해 니켈도금</option>
                  <option value="BLACK_OXIDE">흑착색 (방청 피막)</option>
                  <option value="NONE">일반 방청유 도포 (무도장)</option>
                </select>
              </div>

              {/* 3. 사내 기준단가 일괄 입력 */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">3. 사내 기준단가 일괄 입력 (선택사항)</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">₩</span>
                    <input
                      type="text"
                      value={bulkModalTargetPrice ? Number(bulkModalTargetPrice.replace(/[^0-9]/g, '')).toLocaleString() : ''}
                      onChange={(e) => setBulkModalTargetPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                      placeholder="단가 미입력 시 기존 단가 유지"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white text-right"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '+5%', rate: 5 },
                      { label: '+10%', rate: 10 },
                      { label: '-5%', rate: -5 }
                    ].map(btn => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => {
                          const base = bulkModalTargetPrice ? Number(bulkModalTargetPrice) : 30000;
                          const nextVal = Math.round(base * (1 + btn.rate / 100));
                          setBulkModalTargetPrice(String(nextVal));
                        }}
                        className="px-2 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10.5px] font-bold transition-colors cursor-pointer"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">※ 단가를 입력하시면 소재비(28%), 가공비(48%), 후처리비(8%)가 1행 테이블에 자동 산출 연동됩니다.</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkCostModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApplyBulkCostSettings}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>선택 {selectedIds.length}개 품목에 일괄 적용 및 저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ 플로팅 비침습 토스트 알림 (Layout Shift 100% 방지) */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[80] shadow-xl flex items-center gap-2.5 bg-slate-900/95 backdrop-blur text-white px-4 py-2.5 rounded-xl border border-slate-700/80 text-[13.5px] font-bold animate-in fade-in slide-in-from-top-2 duration-200">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ⚡ 실무 단가 수정 및 승인 이력 타임라인 서랍 (Slide-over Drawer) */}
      <LearnedPriceHistoryDrawer
        isOpen={!!selectedHistoryItem}
        onClose={() => setSelectedHistoryItem(null)}
        item={selectedHistoryItem}
        onPriceUpdated={() => fetchLearnedItems(true)}
      />
    </div>
  );
}
