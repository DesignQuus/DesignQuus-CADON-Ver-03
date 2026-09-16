'use client';

import React from 'react';
import { CheckCircle2, Clock, HelpCircle, ShieldAlert } from 'lucide-react';

export interface QuoteReviewLine {
  id: string;
  itemNo: number;
  partNo: string;
  partName: string;
  partType: 'CASTING' | 'MACHINING' | 'COMMERCIAL' | 'UNCLASSIFIED';
  material: string;
  quantity: number;
  unitCost: number;
  supplyPrice: number;
  status: 'CONFIRMED' | 'NEEDS_REVIEW' | 'AUTO';
  balloonNo?: string;
  memo?: string;
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
  const filtered = lines.filter((l) => {
    if (filterType === 'NEEDS_REVIEW') return l.status === 'NEEDS_REVIEW';
    if (filterType === 'UNCONFIRMED') return l.status !== 'CONFIRMED';
    if (['CASTING', 'MACHINING', 'COMMERCIAL'].includes(filterType)) return l.partType === filterType;
    return true;
  });

  const unconfirmedCount = lines.filter((l) => l.status !== 'CONFIRMED').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* 1. 상단 컨트롤 바 */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">견적 행 목록</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
            unconfirmedCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            미확정 {unconfirmedCount}/{lines.length}
          </span>
        </div>

        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">전체 보기</option>
          <option value="NEEDS_REVIEW">검토필요 항목</option>
          <option value="UNCONFIRMED">미확정 항목</option>
          <option value="CASTING">주조품만</option>
          <option value="MACHINING">가공품만</option>
          <option value="COMMERCIAL">구매품만</option>
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
              <th className="p-2 w-16 text-center">유형</th>
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
                  }`}
                >
                  <td className="p-2 text-center text-slate-400 font-mono">{row.itemNo}</td>
                  <td className="p-2">
                    <span className="inline-block px-1.5 py-0.2 text-[10px] rounded bg-slate-200 text-slate-700 mr-1 font-bold">
                      {row.balloonNo || row.itemNo}
                    </span>
                    <span className="font-mono text-slate-900">{row.partNo}</span>
                  </td>
                  <td className="p-2 truncate max-w-[140px]" title={row.partName}>{row.partName}</td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      row.partType === 'CASTING' ? 'bg-orange-100 text-orange-800' :
                      row.partType === 'MACHINING' ? 'bg-blue-100 text-blue-800' :
                      row.partType === 'COMMERCIAL' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {row.partType === 'CASTING' ? '주조' :
                       row.partType === 'MACHINING' ? '가공' :
                       row.partType === 'COMMERCIAL' ? '구매' : '미분류'}
                    </span>
                  </td>
                  <td className="p-2 truncate">{row.material}</td>
                  <td className="p-2 text-center font-mono">{row.quantity}</td>
                  <td className="p-2 text-right font-mono text-slate-500">
                    {row.unitCost > 0 ? `₩${row.unitCost.toLocaleString()}` : '-'}
                  </td>
                  <td className="p-2 text-right font-mono text-blue-700 font-bold">
                    {row.supplyPrice > 0 ? `₩${row.supplyPrice.toLocaleString()}` : '-'}
                  </td>
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleConfirm(row.id)}
                      disabled={row.partType === 'UNCLASSIFIED'}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                        isConfirmed ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' :
                        isNeedsReview ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' :
                        'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isConfirmed ? '확정' : isNeedsReview ? '검토필요' : '자동'}
                    </button>
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
