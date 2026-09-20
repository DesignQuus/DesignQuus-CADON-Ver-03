'use client';

import React from 'react';
import { CheckCircle2, Clock, HelpCircle, ShieldAlert, AlertCircle } from 'lucide-react';

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
}

interface QuoteLineGridProps {
  lines: QuoteReviewLine[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onToggleConfirm: (id: string) => void;
  filterType: string;
  onFilterChange: (f: string) => void;
}

export default function QuoteLineGrid({
  lines,
  selectedIndex,
  onSelectIndex,
  onToggleConfirm,
  filterType,
  onFilterChange
}: QuoteLineGridProps) {
  // 견적 대상 부품 (조립도 및 명시적 제외 품목 제외)
  const quoteTargetLines = lines.filter((l) => !l.isAssembly && l.isIncluded !== false);
  const assemblyCount = lines.filter((l) => l.isAssembly || l.isIncluded === false).length;
  const unconfirmedCount = quoteTargetLines.filter((l) => l.status !== 'CONFIRMED').length;

  const filtered = lines.filter((l) => {
    // 기본 ALL 뷰: 조립도는 견적 리스트에서 자동 제외/해제 처리됨!
    if (filterType === 'ALL') return !l.isAssembly && l.isIncluded !== false;
    if (filterType === 'WITH_ASSEMBLY') return true;
    if (filterType === 'NEEDS_REVIEW') return (!l.isAssembly && l.isIncluded !== false) && l.status === 'NEEDS_REVIEW';
    if (filterType === 'UNCONFIRMED') return (!l.isAssembly && l.isIncluded !== false) && l.status !== 'CONFIRMED';
    if (filterType === 'ASSEMBLY') return l.isAssembly || l.isIncluded === false;
    if (['MACHINING', 'SHEET_METAL', 'CASTING', 'COMMERCIAL', 'ELECTRICAL'].includes(filterType)) {
      return l.partType === filterType && !l.isAssembly && l.isIncluded !== false;
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* 1. 상단 컨트롤 바 */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">견적 행 목록</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
            unconfirmedCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            미확정 {unconfirmedCount}/{quoteTargetLines.length}
          </span>
          {assemblyCount > 0 && (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200">
              조립도 {assemblyCount}건 자동제외
            </span>
          )}
        </div>

        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">견적 대상 전체 ({quoteTargetLines.length}건)</option>
          <option value="NEEDS_REVIEW">검토필요 항목</option>
          <option value="UNCONFIRMED">미확정 항목</option>
          <option value="MACHINING">가공품만</option>
          <option value="SHEET_METAL">판금/제관만</option>
          <option value="CASTING">주조품만</option>
          <option value="COMMERCIAL">규격철물만</option>
          <option value="ELECTRICAL">전장/공압만</option>
          <option value="ASSEMBLY">조립도(견적제외, {assemblyCount}건)</option>
          <option value="WITH_ASSEMBLY">조립도 포함 전체 ({lines.length}건)</option>
        </select>
      </div>

      {/* 2. 그리드 본문 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200 z-10">
            <tr>
              <th className="p-2 w-10 text-center">No</th>
              <th className="p-2 w-20">풍선/도번</th>
              <th className="p-2">품명</th>
              <th className="p-2 w-20 text-center">유형</th>
              <th className="p-2 w-16">재질</th>
              <th className="p-2 w-12 text-center">수량</th>
              <th className="p-2 w-20 text-right">단위원가</th>
              <th className="p-2 w-20 text-right">공급단가</th>
              <th className="p-2 w-16 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
            {filtered.map((row, idx) => {
              const isSelected = lines.indexOf(row) === selectedIndex;
              const isConfirmed = row.status === 'CONFIRMED';
              const isNeedsReview = row.status === 'NEEDS_REVIEW';

              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectIndex(lines.indexOf(row))}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/90 ring-1 ring-blue-500 font-semibold' : 'hover:bg-slate-50'
                  } ${row.isAssembly ? 'bg-slate-50/70 opacity-75' : ''}`}
                >
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
                  </td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      row.partType === 'MACHINING' ? 'bg-blue-100 text-blue-800' :
                      row.partType === 'SHEET_METAL' ? 'bg-cyan-100 text-cyan-800' :
                      row.partType === 'CASTING' ? 'bg-orange-100 text-orange-800' :
                      row.partType === 'COMMERCIAL' ? 'bg-emerald-100 text-emerald-800' :
                      row.partType === 'ELECTRICAL' ? 'bg-purple-100 text-purple-800' :
                      row.partType === 'ASSEMBLY' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {row.partType === 'MACHINING' ? '가공' :
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
                    {row.isAssembly ? '-' : (row.unitCost > 0 ? `₩${row.unitCost.toLocaleString()}` : <span className="text-slate-400">₩0</span>)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold">
                    {row.isAssembly ? (
                      <span className="text-slate-400">-</span>
                    ) : row.supplyPrice > 0 ? (
                      row.priceSource === 'ENGINEERING_COST' ? (
                        <div className="inline-flex items-center justify-end gap-1.5" title="원가 엔진 추정치 (담당자 검토 필요)">
                          <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-slate-100 text-slate-600 border border-slate-300 font-medium">
                            참고
                          </span>
                          <span className="text-slate-600 font-mono">₩{row.supplyPrice.toLocaleString()}</span>
                          <span className="text-slate-400 hover:text-slate-600 cursor-help text-[11px]" title="원가 엔진 자동산출값 (작업자 검토 및 확정 필요)">
                            ⓘ
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {['CUSTOMER_PRICE', 'STANDARD_PRICE'].includes(row.priceSource || '') && (
                            <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium" title="사내 표준 마스터 단가">
                              마스터
                            </span>
                          )}
                          {row.priceSource === 'VERIFIED_HISTORY' && (
                            <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium" title="과거 견적 시 실무자 직접 검토/확정 이력 단가">
                              실무 확정
                            </span>
                          )}
                          {row.priceSource === 'MANUAL_PRICE' && (
                            <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium" title="수기 단가 지식 풀">
                              수기 풀
                            </span>
                          )}
                          <span className="text-blue-700 font-mono">₩{row.supplyPrice.toLocaleString()}</span>
                        </div>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                        단가미확보(0원)
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {row.isAssembly ? (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        조립제외
                      </span>
                    ) : (
                      <button
                        onClick={() => onToggleConfirm(row.id)}
                        disabled={row.partType === 'UNCLASSIFIED'}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          isConfirmed ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' :
                          row.supplyPrice <= 0 ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 animate-pulse' :
                          isNeedsReview ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' :
                          'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isConfirmed ? '확정' : row.supplyPrice <= 0 ? '단가미확보' : isNeedsReview ? '검토' : '미확정'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
