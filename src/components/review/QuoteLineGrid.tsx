'use client';

import React, { useState } from 'react';
import {
  CheckCircle2, Clock, HelpCircle, ShieldAlert, AlertCircle,
  Package, Wrench, Ban, Check, ChevronDown, CheckSquare, Square,
  Sparkles, ShieldCheck
} from 'lucide-react';

export type InclusionType = 'INCLUDED' | 'CUSTOMER_SUPPLIED' | 'FASTENER_EXCLUDED' | 'EXCLUDED' | 'ANNOTATION_NOISE';

export interface SimilarityBreakdown {
  totalScore: number; // 0 ~ 100 (가중 평균)
  nameMatchPct: number; // 0 ~ 100
  materialMatchPct: number; // 0 ~ 100
  specMatchPct: number; // 0 ~ 100
  processMatchPct: number; // 0 ~ 100
  matchedMasterName?: string;
  matchedMasterCode?: string;
  matchedUnitPrice?: number;
}

export interface QuoteReviewLine {
  id: string;
  itemNo: number;
  partNo: string;
  partName: string;
  partType: 'MACHINING' | 'SHEET_METAL' | 'CASTING' | 'COMMERCIAL' | 'ELECTRICAL' | 'ASSEMBLY' | 'UNCLASSIFIED';
  material: string;
  quantity: number;
  unitCost: number;
  supplyPrice: number;
  status: 'CONFIRMED' | 'NEEDS_REVIEW' | 'AUTO';
  balloonNo?: string;
  memo?: string;
  specification?: string;
  isAssembly?: boolean;
  isIncluded?: boolean;
  inclusionType?: InclusionType;
  excludeReason?: string;
  materialCost?: number;
  processCost?: number;
  treatmentCost?: number;
  extraCost1Name?: string;
  extraCost1Amount?: number;
  extraCost2Name?: string;
  extraCost2Amount?: number;
  extraCost3Name?: string;
  extraCost3Amount?: number;
  engineSuggestedPrice?: number;
  priceSource?: string;
  priceStatus?: string;
  similarityBreakdown?: SimilarityBreakdown;
  masterPrice?: number;
}

interface QuoteLineGridProps {
  lines: QuoteReviewLine[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onToggleConfirm: (id: string) => void;
  filterType: string;
  onFilterChange: (f: string) => void;
  selectedIds?: string[];
  onToggleSelectId?: (id: string) => void;
  onSelectAll?: (selectAll: boolean) => void;
  onUpdateLineInclusion?: (lineId: string, inclusionType: InclusionType) => void;
  onBatchUpdateInclusion?: (lineIds: string[], inclusionType: InclusionType) => void;
  onAddNoiseBlacklist?: (keyword: string) => void;
}

export default function QuoteLineGrid({
  lines,
  selectedIndex,
  onSelectIndex,
  onToggleConfirm,
  filterType,
  onFilterChange,
  selectedIds = [],
  onToggleSelectId,
  onSelectAll,
  onUpdateLineInclusion,
  onBatchUpdateInclusion,
  onAddNoiseBlacklist
}: QuoteLineGridProps) {
  // 열려있는 인라인 드롭다운 상태 관리
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // 견적 대상 부품: 조립도, 제외품, 체결구제외, 도면노이즈를 제외한 실 가공/구매 대상
  const quoteTargetLines = lines.filter((l) => {
    if (l.isAssembly) return false;
    const incType = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return incType === 'INCLUDED' || incType === 'CUSTOMER_SUPPLIED';
  });

  const noiseCount = lines.filter((l) => {
    const incType = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return incType === 'ANNOTATION_NOISE';
  }).length;

  const excludedCount = lines.filter((l) => {
    if (l.isAssembly) return true;
    const incType = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return incType === 'EXCLUDED' || incType === 'FASTENER_EXCLUDED';
  }).length;

  const suppliedCount = lines.filter((l) => l.inclusionType === 'CUSTOMER_SUPPLIED').length;
  const unconfirmedCount = quoteTargetLines.filter((l) => l.status !== 'CONFIRMED' && l.inclusionType !== 'CUSTOMER_SUPPLIED').length;

  const filtered = lines.filter((l) => {
    const incType = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    if (filterType === 'ALL') {
      // 기본 ALL 뷰: 조립도, 견적제외, 체결구제외, 도면노이즈는 숨김 처리되어 진짜 부품만 깨끗하게 노출!
      return !l.isAssembly && incType !== 'EXCLUDED' && incType !== 'FASTENER_EXCLUDED' && incType !== 'ANNOTATION_NOISE';
    }
    if (filterType === 'NOISE') {
      // 🧹 도면 주석/노이즈 격리실 전용 뷰
      return incType === 'ANNOTATION_NOISE';
    }
    if (filterType === 'WITH_ASSEMBLY') return true;
    if (filterType === 'NEEDS_REVIEW') {
      return !l.isAssembly && incType === 'INCLUDED' && l.status === 'NEEDS_REVIEW';
    }
    if (filterType === 'UNCONFIRMED') {
      return !l.isAssembly && incType === 'INCLUDED' && l.status !== 'CONFIRMED';
    }
    if (filterType === 'SUPPLIED') {
      return incType === 'CUSTOMER_SUPPLIED';
    }
    if (filterType === 'EXCLUDED') {
      return l.isAssembly || incType === 'EXCLUDED' || incType === 'FASTENER_EXCLUDED';
    }
    if (['MACHINING', 'SHEET_METAL', 'CASTING', 'COMMERCIAL', 'ELECTRICAL'].includes(filterType)) {
      return l.partType === filterType && !l.isAssembly && incType !== 'EXCLUDED' && incType !== 'FASTENER_EXCLUDED' && incType !== 'ANNOTATION_NOISE';
    }
    return true;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selectedIds.includes(f.id));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden relative">
      {/* 1. 상단 컨트롤 바 */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">견적 행 목록</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
            unconfirmedCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            미확정 {unconfirmedCount}/{quoteTargetLines.length}
          </span>
          {suppliedCount > 0 && (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center gap-1">
              <Package className="w-3 h-3" /> 사급 {suppliedCount}건
            </span>
          )}
          {noiseCount > 0 && (
            <button
              onClick={() => onFilterChange('NOISE')}
              className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all cursor-pointer ${
                filterType === 'NOISE'
                  ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-300'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
              }`}
              title="도면 표제란(이경중, A3 등) 및 유니코드 깨짐 텍스트 격리실 열기"
            >
              🧹 노이즈 격리 {noiseCount}건
            </button>
          )}
          {excludedCount > 0 && (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-300">
              제외 {excludedCount}건
            </span>
          )}
        </div>

        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="ALL">견적 대상 전체 ({quoteTargetLines.length}건)</option>
          <option value="NEEDS_REVIEW">검토필요 항목</option>
          <option value="UNCONFIRMED">미확정 항목</option>
          <option value="SUPPLIED">고객 사급품 ({suppliedCount}건)</option>
          <option value="NOISE">🧹 도면 주석/노이즈 격리실 ({noiseCount}건)</option>
          <option value="MACHINING">가공품만</option>
          <option value="SHEET_METAL">판금/제관만</option>
          <option value="CASTING">주조품만</option>
          <option value="COMMERCIAL">규격철물만</option>
          <option value="ELECTRICAL">전장/공압만</option>
          <option value="EXCLUDED">견적 제외/조립도 ({excludedCount}건)</option>
          <option value="WITH_ASSEMBLY">전체 포함 ({lines.length}건)</option>
        </select>
      </div>

      {/* 2. 그리드 본문 */}
      <div className="flex-1 overflow-y-auto" onClick={() => setOpenDropdownId(null)}>
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200 z-10">
            <tr>
              {/* 다중 선택 헤더 체크박스 */}
              <th className="p-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                {onSelectAll && (
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                    title="현재 필터링된 전체 행 선택/해제"
                  />
                )}
              </th>
              <th className="p-2 w-8 text-center">No</th>
              <th className="p-2 w-20">풍선/도번</th>
              <th className="p-2">품명</th>
              <th className="p-2 w-20 text-center">유형</th>
              <th className="p-2 w-16">재질</th>
              <th className="p-2 w-12 text-center">수량</th>
              <th className="p-2 w-20 text-right">단위원가</th>
              <th className="p-2 w-24 text-right">공급단가</th>
              <th className="p-2 w-28 text-center">견적상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
            {filtered.map((row) => {
              const isSelected = lines.indexOf(row) === selectedIndex;
              const isChecked = selectedIds.includes(row.id);
              const incType: InclusionType = row.inclusionType || (row.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
              const isNoise = incType === 'ANNOTATION_NOISE';
              const isSupplied = incType === 'CUSTOMER_SUPPLIED';
              const isFastenerExcluded = incType === 'FASTENER_EXCLUDED';
              const isExcluded = incType === 'EXCLUDED' || row.isAssembly || isFastenerExcluded || isNoise;

              const isConfirmed = row.status === 'CONFIRMED';
              const isNeedsReview = row.status === 'NEEDS_REVIEW';

              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectIndex(lines.indexOf(row))}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/90 ring-1 ring-blue-500 font-semibold' : 'hover:bg-slate-50'
                  } ${isNoise ? 'bg-amber-50/40 text-slate-500 line-through-none' : isExcluded ? 'bg-slate-50/60 opacity-65' : ''} ${
                    isChecked ? 'bg-indigo-50/60' : ''
                  }`}
                >
                  {/* 행별 체크박스 */}
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {onToggleSelectId && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSelectId(row.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                      />
                    )}
                  </td>

                  <td className="p-2 text-center text-slate-400 font-mono">{row.itemNo}</td>
                  <td className="p-2">
                    <span className="inline-block px-1.5 py-0.2 text-[10px] rounded bg-slate-200 text-slate-700 mr-1 font-bold">
                      {row.balloonNo || row.itemNo}
                    </span>
                    <span className="font-mono text-slate-900">{row.partNo}</span>
                  </td>
                  <td className="p-2 truncate max-w-[140px]" title={row.partName}>
                    {row.partName}
                    {row.isAssembly && (
                      <span className="ml-1 px-1 py-0.2 text-[9px] rounded bg-purple-100 text-purple-700 font-bold">조립제외</span>
                    )}
                    {isNoise && (
                      <span className="ml-1 px-1 py-0.2 text-[9px] rounded bg-amber-100 text-amber-800 font-bold border border-amber-300">
                        🧹 도면주석
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      isNoise ? 'bg-slate-100 text-slate-500' :
                      row.partType === 'MACHINING' ? 'bg-blue-100 text-blue-800' :
                      row.partType === 'SHEET_METAL' ? 'bg-cyan-100 text-cyan-800' :
                      row.partType === 'CASTING' ? 'bg-orange-100 text-orange-800' :
                      row.partType === 'COMMERCIAL' ? 'bg-emerald-100 text-emerald-800' :
                      row.partType === 'ELECTRICAL' ? 'bg-purple-100 text-purple-800' :
                      row.partType === 'ASSEMBLY' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {isNoise ? '노이즈' :
                       row.partType === 'MACHINING' ? '가공' :
                       row.partType === 'SHEET_METAL' ? '판금' :
                       row.partType === 'CASTING' ? '주조' :
                       row.partType === 'COMMERCIAL' ? '철물' :
                       row.partType === 'ELECTRICAL' ? '전장' :
                       row.partType === 'ASSEMBLY' ? '조립' : '미분류'}
                    </span>
                  </td>
                  <td className="p-2 truncate">{row.material}</td>
                  <td className="p-2 text-center font-mono">{row.quantity}</td>
                  <td className="p-2 text-right font-mono text-slate-500">
                    {isNoise ? (
                      <span className="text-amber-700 font-medium text-[10px]">노이즈제외</span>
                    ) : isExcluded ? '-' : isSupplied ? (
                      <span className="text-cyan-700 font-medium text-[10px]">사급제공</span>
                    ) : (row.unitCost > 0 ? `₩${row.unitCost.toLocaleString()}` : <span className="text-slate-400">₩0</span>)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold whitespace-nowrap">
                    {isNoise ? (
                      <span className="text-amber-700 font-bold text-[10px] bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                        🧹 노이즈격리
                      </span>
                    ) : isExcluded ? (
                      <span className="text-slate-400">-</span>
                    ) : isSupplied ? (
                      <span className="text-cyan-700 font-bold text-[11px]">₩0 (사급품)</span>
                    ) : row.supplyPrice > 0 ? (
                      (() => {
                        const marginPct = (row.supplyPrice > 0 && row.unitCost > 0)
                          ? Math.round(((row.supplyPrice - row.unitCost) / row.supplyPrice) * 1000) / 10
                          : null;
                        const isNegativeMargin = marginPct !== null && marginPct < 0;
                        const isLowMargin = marginPct !== null && marginPct >= 0 && marginPct < 12;

                        return (
                          <div className="flex flex-col items-end whitespace-nowrap">
                            {row.priceSource === 'ENGINEERING_COST' ? (
                              <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap" title="원가 엔진 추정치 (담당자 검토 필요)">
                                <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-slate-100 text-slate-600 border border-slate-300 font-medium whitespace-nowrap shrink-0">
                                  참고
                                </span>
                                <span className="text-slate-600 font-mono whitespace-nowrap">₩{row.supplyPrice.toLocaleString()}</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
                                {row.priceSource === 'MARGIN_CALCULATED' ? (
                                  <span
                                    className="px-1.5 py-0.5 text-[9.5px] rounded bg-blue-50 text-blue-700 border border-blue-300 font-bold whitespace-nowrap shrink-0"
                                    title={`원가 기준 목표 마진율(${marginPct !== null ? marginPct : ''}%) 적용 산출 단가`}
                                  >
                                    ✏️ 원가마진
                                  </span>
                                ) : row.priceSource === 'MANUAL_PRICE' ? (
                                  <span
                                    className="px-1.5 py-0.5 text-[9.5px] rounded bg-purple-50 text-purple-700 border border-purple-300 font-bold whitespace-nowrap shrink-0"
                                    title="담당자 직접 수기 입력 단가"
                                  >
                                    ✏️ 수기입력
                                  </span>
                                ) : row.similarityBreakdown ? (
                                  <span
                                    className={`px-1.5 py-0.5 text-[9.5px] rounded border font-bold cursor-help transition-all shadow-2xs whitespace-nowrap shrink-0 ${
                                      row.similarityBreakdown.totalScore >= 90
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 ring-1 ring-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 ring-1 ring-amber-200'
                                    }`}
                                    title={`[마스터 대조 결과: ${row.similarityBreakdown.totalScore}% 일치]\n• 품명 (40%): ${row.similarityBreakdown.matchedMasterName || row.partName} (${row.similarityBreakdown.nameMatchPct}%)\n• 재질 (30%): ${row.material} (${row.similarityBreakdown.materialMatchPct}%)\n• 치수 (20%): ${row.specification || '-'} (${row.similarityBreakdown.specMatchPct}%)\n• 공정 (10%): (${row.similarityBreakdown.processMatchPct}%)\n• 마스터 단가: ₩${(row.similarityBreakdown.matchedUnitPrice || row.supplyPrice).toLocaleString()}`}
                                  >
                                    {row.similarityBreakdown.totalScore >= 90
                                      ? `⭐ ${row.similarityBreakdown.totalScore}% 일치`
                                      : `🟡 ${row.similarityBreakdown.totalScore}% 유사`}
                                  </span>
                                ) : ['CUSTOMER_PRICE', 'STANDARD_PRICE', 'MASTER_MATCH'].includes(row.priceSource || '') ? (
                                  <span
                                    className="px-1.5 py-0.5 text-[9.5px] rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold whitespace-nowrap shrink-0"
                                    title="사내 표준 마스터 단가 일치"
                                  >
                                    ⭐ 마스터
                                  </span>
                                ) : null}
                                <span className="text-blue-700 font-mono whitespace-nowrap">₩{row.supplyPrice.toLocaleString()}</span>
                              </div>
                            )}
                            {marginPct !== null && (
                              <span
                                className={`text-[9.5px] font-mono font-bold leading-none mt-0.5 ${
                                  isNegativeMargin
                                    ? 'text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200'
                                    : isLowMargin
                                    ? 'text-amber-700'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}
                              </span>
                            )}
                            {/* 마스터 프라이스 대조 서브텍스트 */}
                            {(() => {
                              const masterPrc = row.masterPrice || row.similarityBreakdown?.matchedUnitPrice;
                              const diffFromMaster = masterPrc ? row.supplyPrice - masterPrc : null;
                              const diffPctFromMaster = masterPrc && diffFromMaster !== null
                                ? Math.round((diffFromMaster / masterPrc) * 1000) / 10
                                : null;
                              const isExtremeDiff = diffPctFromMaster !== null && Math.abs(diffPctFromMaster) >= 30;

                              return (
                                <div className="flex items-center justify-end gap-1 mt-0.5 text-[9px] font-mono leading-none">
                                  {isExtremeDiff ? (
                                    <span
                                      className="text-rose-600 font-bold bg-rose-50 px-1 py-0.2 rounded border border-rose-200 animate-pulse"
                                      title={`마스터 기준단가(₩${masterPrc?.toLocaleString()}) 대비 ${diffPctFromMaster! > 0 ? `+${diffPctFromMaster}%` : `${diffPctFromMaster}%`} 과도 괴리 발생!`}
                                    >
                                      ⚠️ 마스터: ₩{masterPrc?.toLocaleString()} ({diffPctFromMaster! > 0 ? `+${diffPctFromMaster}%` : `${diffPctFromMaster}%`})
                                    </span>
                                  ) : masterPrc ? (
                                    <span
                                      className={`${row.supplyPrice === masterPrc ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}
                                      title={`사내 표준 마스터 기준단가: ₩${masterPrc.toLocaleString()}`}
                                    >
                                      마스터: ₩{masterPrc.toLocaleString()}{' '}
                                      {diffPctFromMaster !== null && diffPctFromMaster !== 0
                                        ? `(${diffPctFromMaster > 0 ? `▲+${diffPctFromMaster}%` : `▼${diffPctFromMaster}%`})`
                                        : '(일치)'}
                                    </span>
                                  ) : (
                                    <span className="text-purple-600 font-medium" title="사내 마스터 프라이스 미등록 품목">
                                      마스터: 미등록
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                        단가미확보(0원)
                      </span>
                    )}
                  </td>

                  {/* 견적 상태 열 */}
                  <td className="p-2 text-center relative" onClick={(e) => e.stopPropagation()}>
                    {row.isAssembly ? (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        조립제외
                      </span>
                    ) : isNoise ? (
                      /* 🧹 격리실 품목: 복원 버튼 및 블랙리스트 등록 버튼 */
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onUpdateLineInclusion && onUpdateLineInclusion(row.id, 'INCLUDED')}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 transition-colors"
                          title="진짜 부품인 경우 정상 견적 목록으로 복원"
                        >
                          ✓ 부품 복원
                        </button>
                        {onAddNoiseBlacklist && (
                          <button
                            onClick={() => onAddNoiseBlacklist(row.partName || row.partNo)}
                            className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-300 transition-colors"
                            title="사내 노이즈 블랙리스트에 영구 등록하여 다음 도면 파싱부터 자동 제외"
                          >
                            학습
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        {/* 견적 포함 유형 뱃지 & 간편 드롭다운 */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdownId(openDropdownId === row.id ? null : row.id)}
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold flex items-center gap-0.5 transition-all border ${
                              incType === 'CUSTOMER_SUPPLIED'
                                ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                                : incType === 'FASTENER_EXCLUDED'
                                ? 'bg-slate-100 text-slate-600 border-slate-300'
                                : incType === 'EXCLUDED'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="견적 포함/사급품/체결구/제외/노이즈 상태 변경"
                          >
                            <span>
                              {incType === 'CUSTOMER_SUPPLIED' ? '📦 사급' :
                               incType === 'FASTENER_EXCLUDED' ? '🔩 체결구' :
                               incType === 'EXCLUDED' ? '🚫 제외' : '포함'}
                            </span>
                            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                          </button>

                          {/* 인라인 변경 드롭다운 팝오버 */}
                          {openDropdownId === row.id && onUpdateLineInclusion && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-30 w-32 text-left text-xs font-semibold animate-in fade-in zoom-in-95">
                              <button
                                onClick={() => {
                                  onUpdateLineInclusion(row.id, 'INCLUDED');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-2.5 py-1 text-left hover:bg-slate-50 flex items-center gap-1.5 text-slate-800"
                              >
                                <Check className="w-3 h-3 text-emerald-600" /> 견적 포함
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateLineInclusion(row.id, 'CUSTOMER_SUPPLIED');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-2.5 py-1 text-left hover:bg-cyan-50 flex items-center gap-1.5 text-cyan-800"
                              >
                                <Package className="w-3 h-3 text-cyan-600" /> 고객 사급품
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateLineInclusion(row.id, 'FASTENER_EXCLUDED');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-2.5 py-1 text-left hover:bg-slate-100 flex items-center gap-1.5 text-slate-700"
                              >
                                <Wrench className="w-3 h-3 text-slate-500" /> 체결구 제외
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateLineInclusion(row.id, 'ANNOTATION_NOISE');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-2.5 py-1 text-left hover:bg-amber-50 flex items-center gap-1.5 text-amber-800"
                              >
                                <Sparkles className="w-3 h-3 text-amber-600" /> 🧹 노이즈 격리
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateLineInclusion(row.id, 'EXCLUDED');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-2.5 py-1 text-left hover:bg-rose-50 flex items-center gap-1.5 text-rose-700"
                              >
                                <Ban className="w-3 h-3 text-rose-500" /> 견적 제외
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 확정 버튼: 사급/제외품이 아닐 때만 확정 제어 */}
                        {incType === 'INCLUDED' ? (
                          <button
                            onClick={() => onToggleConfirm(row.id)}
                            disabled={row.partType === 'UNCLASSIFIED'}
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all ${
                              isConfirmed ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' :
                              row.supplyPrice <= 0 ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 animate-pulse' :
                              isNeedsReview ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' :
                              'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isConfirmed ? '확정' : row.supplyPrice <= 0 ? '0원' : isNeedsReview ? '검토' : '미확정'}
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-400 font-medium">정상</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. 플로팅 다중 선택 일괄 작업 바 (선택된 행이 1개 이상일 때 하단에 플로팅) */}
      {selectedIds.length > 0 && onBatchUpdateInclusion && (
        <div className="absolute bottom-3 left-4 right-4 bg-slate-900/95 backdrop-blur-sm text-white rounded-xl px-4 py-2.5 shadow-2xl border border-slate-700 flex items-center justify-between z-40 animate-in slide-in-from-bottom-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-[11px]">
              {selectedIds.length}
            </span>
            <span className="font-semibold">개 품목 선택됨</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => onBatchUpdateInclusion(selectedIds, 'ANNOTATION_NOISE')}
              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="선택된 모든 품목을 도면 주석 노이즈로 격리합니다."
            >
              🧹 노이즈 격리
            </button>
            <button
              onClick={() => onBatchUpdateInclusion(selectedIds, 'CUSTOMER_SUPPLIED')}
              className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="선택된 모든 품목을 고객 사급품(단가 0원 정상)으로 지정합니다."
            >
              <Package className="w-3 h-3" /> 사급품 지정
            </button>
            <button
              onClick={() => onBatchUpdateInclusion(selectedIds, 'FASTENER_EXCLUDED')}
              className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="선택된 모든 품목을 표준 체결구 제외 처리합니다."
            >
              <Wrench className="w-3 h-3" /> 체결구 제외
            </button>
            <button
              onClick={() => onBatchUpdateInclusion(selectedIds, 'EXCLUDED')}
              className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="선택된 모든 품목을 견적 대상에서 제외합니다."
            >
              <Ban className="w-3 h-3" /> 견적 제외
            </button>
            <button
              onClick={() => onBatchUpdateInclusion(selectedIds, 'INCLUDED')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium flex items-center gap-1 transition-all cursor-pointer border border-slate-600"
              title="견적 포함 대상으로 복원합니다."
            >
              <Check className="w-3 h-3" /> 포함으로 복원
            </button>
            <button
              onClick={() => onSelectAll && onSelectAll(false)}
              className="ml-2 px-2 py-1 text-slate-400 hover:text-white text-[11px] cursor-pointer"
            >
              선택 해제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
