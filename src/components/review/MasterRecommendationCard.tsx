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
  onApplyPrice: (price: number) => void;
}

export default function MasterRecommendationCard({
  recommendations,
  onApplyPrice
}: MasterRecommendationCardProps) {
  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full flex flex-col justify-center text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>MASTER DB 추천 단가</span>
        </div>
        유사 부품 이력이 없습니다. 신규 단가로 산출 및 등록됩니다.
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
        <span className="text-[10px] text-slate-400 font-medium">[F4 키: 1순위 즉시적용]</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 py-1 pr-1">
        {recommendations.map((rec, idx) => {
          const isRevMatch = rec.matchReason === 'REVISION_MATCH';

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
                <span className="text-[10px] text-slate-400">클릭 시 적용</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
