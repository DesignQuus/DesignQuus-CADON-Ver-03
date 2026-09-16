'use client';

import React from 'react';
import { Coins, AlertTriangle, Layers, Calculator } from 'lucide-react';
import { QuoteReviewLine } from './QuoteLineGrid';

interface CostBreakdownPanelProps {
  line: QuoteReviewLine | null;
  onUpdateLine: (updated: Partial<QuoteReviewLine>) => void;
}

export default function CostBreakdownPanel({ line, onUpdateLine }: CostBreakdownPanelProps) {
  if (!line) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
        상단 목록에서 행을 선택하면 상세 원가 산출 내역이 표시됩니다.
      </div>
    );
  }

  const marginRate = line.supplyPrice > 0 && line.unitCost > 0
    ? Math.round(((line.supplyPrice - line.unitCost) / line.supplyPrice) * 1000) / 10
    : 0;

  const isMarginWarning = marginRate < 12.0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm h-full flex flex-col justify-between text-xs space-y-2.5">
      {/* 1. 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-slate-800">
            [선택: No.{line.itemNo} {line.partName}] 원가 산출 상세
          </span>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
          수량 {line.quantity} EA (구간: {line.quantity <= 9 ? '1~9' : line.quantity <= 99 ? '10~99' : '100~'})
        </span>
      </div>

      {/* 2. 항목별 내역 (주조/가공별) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
        <div>
          <span className="block text-[11px] text-slate-400">재료비</span>
          <span className="font-mono font-bold text-slate-800">
            ₩{Math.round(line.unitCost * 0.42).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="block text-[11px] text-slate-400">가공/공정비</span>
          <span className="font-mono font-bold text-slate-800">
            ₩{Math.round(line.unitCost * 0.48).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="block text-[11px] text-slate-400">열처리/후처리비</span>
          <span className="font-mono font-bold text-slate-800">
            ₩{Math.round(line.unitCost * 0.10).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="block text-[11px] text-slate-400">단위원가 소계</span>
          <span className="font-mono font-bold text-blue-700">
            ₩{line.unitCost.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 3. 공급단가 및 마진율 */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">공급단가:</span>
          <input
            type="number"
            value={line.supplyPrice}
            onChange={(e) => onUpdateLine({ supplyPrice: Number(e.target.value) || 0 })}
            className="w-28 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-blue-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-slate-400">원</span>

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] ${
            isMarginWarning ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {isMarginWarning && <AlertTriangle className="w-3 h-3" />}
            마진율 {marginRate}% {isMarginWarning && '(하한 12% 미달)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="단가 사유/메모"
            value={line.memo || ''}
            onChange={(e) => onUpdateLine({ memo: e.target.value })}
            className="w-48 px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
