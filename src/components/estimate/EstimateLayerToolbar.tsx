'use client';

import React from 'react';
import { 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Search, 
  Ghost, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  MinusCircle,
  HelpCircle
} from 'lucide-react';

export interface EstimateLayerToolbarProps {
  totalCount: number;
  reviewedCount: number;
  inProgressCount: number;
  excludedCount: number;
  unreviewedCount: number;
  isXRayMode: boolean;
  onToggleXRay: () => void;
  hideMode: 'GHOST' | 'HIDE';
  onToggleHideMode: () => void;
  cascadeStamp: boolean;
  onToggleCascadeStamp: () => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  onOpenPreflight: () => void;
}

export default function EstimateLayerToolbar({
  totalCount = 0,
  reviewedCount = 0,
  inProgressCount = 0,
  excludedCount = 0,
  unreviewedCount = 0,
  isXRayMode,
  onToggleXRay,
  hideMode,
  onToggleHideMode,
  cascadeStamp,
  onToggleCascadeStamp,
  isPanelOpen,
  onTogglePanel,
  onOpenPreflight
}: EstimateLayerToolbarProps) {
  const percent = totalCount > 0 ? Math.round(((reviewedCount + excludedCount) / totalCount) * 100) : 0;

  return (
    <div className="w-full bg-slate-950/95 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-md select-none">
      {/* 1. Left: Progress & Stats */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-white whitespace-nowrap text-[11px] flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span>견적 검토 진척도</span>
          </span>
          <div className="w-28 sm:w-36 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60 shrink-0">
            <div 
              className={`h-full transition-all duration-300 ${
                percent === 100 
                  ? 'bg-emerald-500' 
                  : percent > 60 
                  ? 'bg-teal-500' 
                  : 'bg-amber-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="font-mono font-bold text-teal-300 text-xs whitespace-nowrap">
            {percent}% <span className="text-[10px] text-slate-400 font-normal">({reviewedCount + excludedCount}/{totalCount})</span>
          </span>
        </div>

        {/* Traffic Light Status Badges */}
        <div className="hidden lg:flex items-center space-x-1.5 pl-2 border-l border-slate-800 text-[10.5px]">
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60" title="아직 검토되지 않은 부품">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>미검토 {unreviewedCount}</span>
          </span>
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" title="견적 산출 및 확인 완료 부품">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>완료 {reviewedCount}</span>
          </span>
          {inProgressCount > 0 && (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60" title="단가 문의/외주 대기">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>진행 {inProgressCount}</span>
            </span>
          )}
          {excludedCount > 0 && (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700" title="사급/가공제외">
              <span>제외 {excludedCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Right: Action Tools & Controls (DWG FastView / AutoCAD 표준 다크 툴바) */}
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {/* 🔍 X-Ray Missing Items Detector */}
        <button
          type="button"
          onClick={onToggleXRay}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs ${
            isXRayMode
              ? 'bg-blue-600 border-blue-500 text-white ring-1 ring-blue-400/40'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
          }`}
          title="미검토 부품만 형광색으로 단독 표시하여 누락을 즉시 찾아냅니다 (단축키: X)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>{isXRayMode ? 'X-Ray 탐색 중 (ON)' : '누락 부품 X-Ray'}</span>
          {unreviewedCount > 0 && (
            <span className="px-1 py-0.2 rounded-full text-[9px] font-mono bg-slate-800 text-slate-200 border border-slate-600">
              {unreviewedCount}
            </span>
          )}
        </button>

        {/* 👻 Ghost Dim vs Complete Hide Switcher */}
        <button
          type="button"
          onClick={onToggleHideMode}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
            hideMode === 'GHOST'
              ? 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
          }`}
          title={hideMode === 'GHOST' ? '완료 부품을 15% 반투명 고스트로 표시 중 (클릭 시 완전 숨김 전환)' : '완료 부품을 화면에서 완전히 숨김 중 (클릭 시 고스트 모드 전환)'}
        >
          {hideMode === 'GHOST' ? <Ghost className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
          <span>{hideMode === 'GHOST' ? '고스트 15%' : '완전 숨김'}</span>
        </button>

        {/* ⚡ Cascade Stamp Toggle */}
        <button
          type="button"
          onClick={onToggleCascadeStamp}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
            cascadeStamp
              ? 'bg-blue-600/90 border-blue-500 text-white'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="활성화 시 동일 블록/부품에 대해 1클릭으로 도면 전체 일괄 검토 완료 적용"
        >
          <Sparkles className={`w-3.5 h-3.5 ${cascadeStamp ? 'text-amber-300' : 'text-slate-400'}`} />
          <span>연쇄 스탬프 {cascadeStamp ? 'ON' : 'OFF'}</span>
        </button>

        {/* 🛡️ Pre-flight Inspection Guard */}
        <button
          type="button"
          onClick={onOpenPreflight}
          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          title="견적서 제출 전 미검토 누락 부품 사전 검사"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>사전 검사</span>
        </button>

        {/* 🏷️ Estimate Layers & Groups Side Drawer Toggle */}
        <button
          type="button"
          onClick={onTogglePanel}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            isPanelOpen
              ? 'bg-blue-600 text-white border-blue-500 shadow-md'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
          }`}
          title="견적 레이어 및 어셈블리 그룹 패널 열기/닫기"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>견적 레이어</span>
        </button>
      </div>
    </div>
  );
}
