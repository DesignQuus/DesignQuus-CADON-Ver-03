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
  AlertCircle,
  Scan,
  FileSpreadsheet,
  Coins
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
  currentStep: 1 | 2 | 3 | 4 | 5;
  onStepChange?: (step: 1 | 2 | 3 | 4 | 5) => void;
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
  onStepChange,
  stats = {},
  caseInfo,
  showHomeLink = false,
  className = ''
}: PipelineNavigatorProps) {
  const steps = [
    {
      step: 1 as const,
      name: '1. 도면 접수',
      desc: 'DWG/DXF 파일 접수·등록',
      href: `/cases/${caseId}?step=1`,
      icon: FileCheck2
    },
    {
      step: 2 as const,
      name: '2. AI 도면 파싱',
      desc: '2D CAD 벡터 (60FPS WebGL)',
      href: `/cases/${caseId}?step=2`,
      icon: Scan
    },
    {
      step: 3 as const,
      name: '3. 가상 BOM 추출',
      desc: '표제란·계층구조 판독 검증',
      href: `/cases/${caseId}?step=3`,
      icon: FileSpreadsheet
    },
    {
      step: 4 as const,
      name: '4. 마스터 단가 매칭',
      desc: '도면 + BOM + 가공단가 원스톱',
      href: `/quotes/${caseId}/review`,
      icon: Coins,
      badge: stats.unconfirmedCount && stats.unconfirmedCount > 0 ? `${stats.unconfirmedCount}행 미확정` : undefined
    },
    {
      step: 5 as const,
      name: '5. 공식 견적서 발행',
      desc: '단가 일괄 계승 및 2종 견적서 출력',
      href: stats.hasRevisionDiff ? `/quotes/${caseId}/diff` : `/quotes/${caseId}/publish`,
      icon: Send,
      warning: stats.marginWarning
    }
  ];

  return (
    <nav 
      aria-label="5단계 스마트 견적 파이프라인" 
      className={`no-print bg-white border-b border-slate-200 px-3 sm:px-6 py-2 flex items-center justify-between shadow-2xs gap-2 flex-wrap ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-wrap">
        {steps.map((item, idx) => {
          const Icon = item.icon;
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step;

          const buttonContent = (
            <>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                isActive
                  ? 'bg-white/20 text-white'
                  : isDone
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.step}
              </div>

              <div className="text-left hidden lg:block">
                <div className="flex items-center gap-1 leading-tight">
                  <span className="text-xs">{item.name}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 text-[9px] rounded bg-amber-500 text-white font-bold">
                      {item.badge}
                    </span>
                  )}
                  {item.warning && (
                    <span className="px-1.5 py-0.2 text-[9px] rounded bg-rose-500 text-white font-bold flex items-center gap-0.5">
                      <AlertCircle className="w-2.5 h-2.5" /> 마진주의
                    </span>
                  )}
                </div>
                <span className={`text-[10px] block truncate max-w-[130px] ${isActive ? 'text-blue-100 font-normal' : 'text-slate-400'}`}>
                  {item.desc}
                </span>
              </div>
            </>
          );

          const classNameStr = `flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            isActive
              ? 'bg-blue-600 text-white font-bold shadow-xs'
              : isDone
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`;

          return (
            <React.Fragment key={item.step}>
              {idx > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.2 hidden sm:block" />
              )}
              {onStepChange && (item.step === 1 || item.step === 2 || item.step === 3) ? (
                <button
                  type="button"
                  onClick={() => onStepChange(item.step)}
                  className={classNameStr}
                  title={`${item.name} 화면으로 즉시 전환 (무랙)`}
                >
                  {buttonContent}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={classNameStr}
                  title={item.name}
                >
                  {buttonContent}
                </Link>
              )}
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
