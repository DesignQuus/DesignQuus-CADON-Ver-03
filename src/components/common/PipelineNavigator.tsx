'use client';

import React from 'react';
import Link from 'next/link';
import { 
  FileCheck2, 
  Layers, 
  Send, 
  ArrowLeft, 
  ChevronRight, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export interface PipelineCaseInfo {
  caseNo?: string;
  caseName?: string;
  companyName?: string;
  drawingsCount?: number;
  bomCount?: number;
  quoteItemCount?: number;
}

export interface PipelineNavigatorProps {
  caseId: string;
  currentStep: 1 | 2 | 3;
  stats?: {
    unconfirmedCount?: number;
    hasRevisionDiff?: boolean;
    marginWarning?: boolean;
  };
  caseInfo?: PipelineCaseInfo;
  showHomeLink?: boolean;
  className?: string;
}

export default function PipelineNavigator({
  caseId,
  currentStep,
  stats = {},
  caseInfo,
  showHomeLink = false,
  className = ''
}: PipelineNavigatorProps) {
  const steps = [
    {
      step: 1,
      name: '도면 등록 & BOM 검증',
      desc: '표제란·계층구조 판독 및 보강',
      href: `/cases/${caseId}`,
      icon: FileCheck2
    },
    {
      step: 2,
      name: '3분할 통합 단가 검토',
      desc: '도면 + BOM + 마스터 단가 원스톱',
      href: `/quotes/${caseId}/review`,
      icon: Layers,
      badge: stats.unconfirmedCount && stats.unconfirmedCount > 0 ? `${stats.unconfirmedCount}행 미확정` : undefined
    },
    {
      step: 3,
      name: '리비전 Diff & 견적 발행',
      desc: '단가 일괄 계승 및 2종 견적서 출력',
      href: stats.hasRevisionDiff ? `/quotes/${caseId}/diff` : `/quotes/${caseId}/publish`,
      icon: Send,
      warning: stats.marginWarning
    }
  ];

  return (
    <nav 
      aria-label="3단계 견적 파이프라인" 
      className={`no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs gap-3 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {steps.map((item, idx) => {
          const Icon = item.icon;
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step;

          return (
            <React.Fragment key={item.step}>
              {idx > 0 && (
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mx-0.5" />
              )}
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : isDone
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : item.step}
                </div>

                <div className="text-left hidden md:block">
                  <div className="flex items-center gap-1.5 leading-tight">
                    <span>{item.name}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-500 text-white font-bold">
                        {item.badge}
                      </span>
                    )}
                    {item.warning && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded bg-rose-500 text-white font-bold flex items-center gap-0.5">
                        <AlertCircle className="w-3 h-3" /> 마진주의
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {item.desc}
                  </span>
                </div>
              </Link>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {/* 🌟 우측 케이스 요약 미니 HUD (개선안 1) */}
        {caseInfo && (caseInfo.caseNo || caseInfo.caseName || caseInfo.companyName) && (
          <div className="hidden lg:flex items-center space-x-2 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-xl shadow-2xs text-xs">
            {caseInfo.caseNo && (
              <span className="font-mono font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                {caseInfo.caseNo}
              </span>
            )}
            <span 
              className="text-slate-800 font-bold truncate max-w-[200px]" 
              title={`${caseInfo.caseName || ''}${caseInfo.companyName ? ` (${caseInfo.companyName})` : ''}`}
            >
              {caseInfo.caseName || ''}
              {caseInfo.companyName ? ` (${caseInfo.companyName})` : ''}
            </span>
            {(caseInfo.drawingsCount !== undefined || caseInfo.bomCount !== undefined || caseInfo.quoteItemCount !== undefined) && (
              <>
                <span className="text-slate-300">|</span>
                <div className="flex items-center space-x-1.5 text-[11px]">
                  {caseInfo.drawingsCount !== undefined && (
                    <span className="text-slate-500">
                      도면 <strong className="text-blue-600 font-bold">{caseInfo.drawingsCount}장</strong>
                    </span>
                  )}
                  {caseInfo.bomCount !== undefined && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">
                        BOM <strong className="text-emerald-600 font-bold">{caseInfo.bomCount}개</strong>
                      </span>
                    </>
                  )}
                  {caseInfo.quoteItemCount !== undefined && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">
                        견적대상 <strong className="text-purple-600 font-bold">{caseInfo.quoteItemCount}종</strong>
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {showHomeLink && (
          <Link
            href="/cases"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 font-bold text-xs transition-colors shadow-2xs"
            title="견적의뢰 목록으로 돌아가기"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">견적의뢰 목록</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
