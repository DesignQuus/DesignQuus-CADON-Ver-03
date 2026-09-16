'use client';

import React from 'react';
import { GitCompare, Copy, ArrowRight, CheckCircle2 } from 'lucide-react';

interface DiffSummaryBannerProps {
  baseCaseNo: string;
  baseRevision: string;
  currentCaseNo: string;
  currentRevision: string;
  stats: {
    added: number;
    modified: number;
    deleted: number;
    identical: number;
  };
  onInheritIdentical: () => void;
  inheriting?: boolean;
}

export default function DiffSummaryBanner({
  baseCaseNo,
  baseRevision,
  currentCaseNo,
  currentRevision,
  stats,
  onInheritIdentical,
  inheriting
}: DiffSummaryBannerProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-900 text-sm">
            리비전 대조: {baseCaseNo} (Rev.{baseRevision}) vs {currentCaseNo} (Rev.{currentRevision})
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
            추가 {stats.added}건
          </span>
          <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
            변경 {stats.modified}건
          </span>
          <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
            삭제 {stats.deleted}건
          </span>
          <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
            동일 {stats.identical}건
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onInheritIdentical}
          disabled={stats.identical === 0 || inheriting}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all ${
            stats.identical === 0 || inheriting
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
          }`}
        >
          <Copy className="w-4 h-4" />
          <span>{inheriting ? '단가 계승 처리 중...' : `동일 행 단가 일괄 계승 (${stats.identical}건)`}</span>
        </button>
      </div>
    </div>
  );
}
