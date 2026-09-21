'use client';

import React from 'react';
import { Sparkles, Check, Clock, TrendingUp, ExternalLink } from 'lucide-react';

export interface RecommendationItem {
  id: string;
  sourceCompany: string;
  partNo: string;
  revision: string;
  unitPrice: number;
  confirmedDate: string;
  isOrdered: boolean;
  matchReason: 'REVISION_MATCH' | 'SPEC_SIMILAR' | 'NAME_SIMILAR';
  specDesc: string;
}

interface MasterRecommendationCardProps {
  recommendations: RecommendationItem[];
  selectedLineCost?: number;
  currentSupplyPrice?: number;
  onApplyPrice: (price: number) => void;
  onOpenMasterDrawer?: () => void;
}

export default function MasterRecommendationCard({
  recommendations,
  selectedLineCost,
  currentSupplyPrice,
  onApplyPrice,
  onOpenMasterDrawer
}: MasterRecommendationCardProps) {
  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full flex flex-col justify-between text-xs text-slate-400">
        <div>
          <div className="flex items-center justify-between font-bold text-slate-700 mb-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>MASTER DB 추천 단가</span>
            </div>
            {onOpenMasterDrawer && (
              <button
                onClick={onOpenMasterDrawer}
                className="px-2 py-0.5 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>단가표 전체보기</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="mt-2 text-slate-500">
            직접 일치하는 과거 이력이 없습니다. 사내 마스터 단가표를 열어 표준 품목, 원자재 시세 및 공정 임률을 직접 확인하실 수 있습니다.
          </p>
        </div>
        {onOpenMasterDrawer && (
          <button
            onClick={onOpenMasterDrawer}
            className="w-full py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>📋 사내 마스터 단가표 열기 (F7)</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm h-full flex flex-col justify-between text-xs overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-slate-800">MASTER 추천 단가 Top-{recommendations.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">[F4: 1순위 적용]</span>
          {onOpenMasterDrawer && (
            <button
              onClick={onOpenMasterDrawer}
              className="px-2 py-0.5 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="사내 표준 마스터 단가표 드로어 열기 (단축키 F7)"
            >
              <span>단가표 전체보기</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 py-1 pr-1">
        {recommendations.map((rec, idx) => {
          const isRevMatch = rec.matchReason === 'REVISION_MATCH';
          const marginPct = selectedLineCost && selectedLineCost > 0 && rec.unitPrice > 0
            ? Math.round(((rec.unitPrice - selectedLineCost) / rec.unitPrice) * 1000) / 10
            : null;
          const isNegative = marginPct !== null && marginPct < 0;
          const isLow = marginPct !== null && marginPct >= 0 && marginPct < 12;
          const priceDiff = currentSupplyPrice && currentSupplyPrice > 0 ? rec.unitPrice - currentSupplyPrice : null;

          return (
            <div
              key={rec.id}
              onClick={() => onApplyPrice(rec.unitPrice)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="space-y-0.5 min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 truncate">{idx + 1}. {rec.partNo} (Rev.{rec.revision})</span>
                  {isRevMatch ? (
                    <span className="px-1.5 py-0.2 text-[10px] bg-indigo-100 text-indigo-700 rounded font-bold shrink-0">
                      ★리비전일치
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 text-[10px] bg-slate-100 text-slate-600 rounded font-medium shrink-0">
                      규격유사
                    </span>
                  )}
                  {rec.isOrdered && (
                    <span className="px-1.5 py-0.2 text-[10px] bg-emerald-100 text-emerald-700 rounded font-bold shrink-0">
                      수주완료
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 leading-normal truncate">
                  {rec.sourceCompany} | {rec.confirmedDate} 확정 | {rec.specDesc}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-blue-700 text-sm leading-tight">
                  ₩{rec.unitPrice.toLocaleString()}
                </div>
                {marginPct !== null && (
                  <div className={`text-[9.5px] font-mono font-bold leading-tight ${
                    isNegative ? 'text-rose-600' : isLow ? 'text-amber-700' : 'text-emerald-600'
                  }`}>
                    {isNegative ? '⚠️ 역마진 위험' : `예상 마진 ${marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}`}
                  </div>
                )}
                {priceDiff !== null && priceDiff !== 0 && (
                  <div className="text-[9px] text-slate-400 font-mono">
                    {priceDiff > 0 ? `현재보다 +₩${priceDiff.toLocaleString()}` : `현재보다 -₩${Math.abs(priceDiff).toLocaleString()}`}
                  </div>
                )}
                <span className="text-[9.5px] text-slate-400 block">클릭 시 적용</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
