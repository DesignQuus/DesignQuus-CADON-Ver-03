'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, Eye } from 'lucide-react';

export interface CadMiniDockProps {
  drawings: any[];
  currentFocusIdx: number | null;
  onSelectDrawing: (index: number) => void;
  onOpenSidebar: () => void;
}

export default function CadMiniDock({
  drawings,
  currentFocusIdx,
  onSelectDrawing,
  onOpenSidebar
}: CadMiniDockProps) {
  // 필터 모드: 'ALL' (전체) | 'PARTS' (가공 견적 대상만)
  const [filterMode, setFilterMode] = useState<'ALL' | 'PARTS'>('ALL');
  // 마우스 호버 중인 항목 인덱스 (스마트 툴팁용)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // 검토 완료(클릭하여 본 도면) 집합
  const [viewedSet, setViewedSet] = useState<Set<number>>(new Set());

  // 현재 활성화된 시트 버튼으로 자동 스크롤
  const btnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (currentFocusIdx !== null && currentFocusIdx >= 0) {
      const targetBtn = btnRefs.current.get(currentFocusIdx);
      if (targetBtn) {
        targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentFocusIdx]);

  if (!drawings || drawings.length === 0) return null;

  const totalCount = drawings.length;
  const isAssembly = (d: any) => {
    const t = String(d?.drawing_type || '').toUpperCase();
    return t.includes('ASSEMBLY') || d?.is_quote_included === 0;
  };

  const partsCount = drawings.filter(d => !isAssembly(d)).length;

  const filteredDrawings = drawings
    .map((d, originalIdx) => ({ d, originalIdx }))
    .filter(({ d }) => (filterMode === 'ALL' ? true : !isAssembly(d)));

  const handleItemClick = (originalIdx: number) => {
    setViewedSet(prev => new Set(prev).add(originalIdx));
    onSelectDrawing(originalIdx);
  };

  return (
    <aside
      aria-label="도면 시트 퀵 내비게이션 미니독"
      className="w-14 shrink-0 bg-slate-900/95 text-slate-200 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md flex flex-col items-center py-2.5 px-1.5 z-20 select-none animate-in fade-in slide-in-from-left-2 duration-150 self-stretch max-h-[780px]"
    >
      {/* 1. 상단 컨트롤: 패널 확장 & 필터 토글 */}
      <div className="w-full flex flex-col items-center pb-2 border-b border-slate-800 space-y-1.5 shrink-0">
        {/* 전체 패널 열기 (책갈피 확장) */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="w-10 h-8 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs group"
          title="도면 파일 업로드 및 전체 패널 열기"
        >
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* 필터 토글 (ALL vs 가공품만) */}
        <button
          type="button"
          onClick={() => setFilterMode(m => (m === 'ALL' ? 'PARTS' : 'ALL'))}
          className={`w-10 py-1 rounded-md text-[10px] font-bold flex flex-col items-center transition-all cursor-pointer ${
            filterMode === 'PARTS'
              ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400'
              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
          }`}
          title={filterMode === 'ALL' ? '클릭 시 가공품(견적대상)만 필터링합니다' : '클릭 시 전체 도면을 표시합니다'}
        >
          <span className="font-mono leading-none">
            {filterMode === 'ALL' ? totalCount : partsCount}
          </span>
          <span className="text-[8px] tracking-tighter opacity-80 mt-0.5">
            {filterMode === 'ALL' ? '전체' : '가공품'}
          </span>
        </button>
      </div>

      {/* 2. 시트 목록 세로 레일 (가상 스냅 & 0초 점프) */}
      <div className="flex-1 w-full overflow-y-auto space-y-1.5 py-2 pr-0.5 scrollbar-thin scrollbar-thumb-slate-700">
        {filteredDrawings.map(({ d, originalIdx }) => {
          const isActive = currentFocusIdx === originalIdx;
          const isAssy = isAssembly(d);
          const isViewed = viewedSet.has(originalIdx);
          const dwgNo = d.drawing_no_normalized || d.drawing_no_raw || '-';
          const dwgName = d.drawing_name_normalized || d.drawing_name_raw || d.name_raw || dwgNo;
          const numStr = String(originalIdx + 1).padStart(2, '0');

          return (
            <div
              key={d.id || originalIdx}
              className="relative w-full flex justify-center"
              onMouseEnter={() => setHoveredIdx(originalIdx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <button
                ref={(el) => {
                  if (el) btnRefs.current.set(originalIdx, el);
                  else btnRefs.current.delete(originalIdx);
                }}
                type="button"
                onClick={() => handleItemClick(originalIdx)}
                className={`w-10 h-9 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400 scale-105'
                    : 'bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
                title={`${numStr}. ${dwgName}`}
              >
                {/* 시트 번호 (모노스페이스 표준) */}
                <span className={`text-[11px] font-mono font-bold leading-none ${isActive ? 'text-white' : 'text-slate-300'}`}>
                  {numStr}
                </span>

                {/* 상태 인디케이터 도트 (파란점=조립도, 초록점=가공품) */}
                <div className="flex items-center space-x-0.5 mt-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isAssy ? 'bg-sky-400' : 'bg-emerald-400'
                    } ${isActive ? 'ring-1 ring-white' : ''}`}
                  />
                  {isViewed && (
                    <span className="text-[8px] text-emerald-400 font-bold leading-none">✓</span>
                  )}
                </div>
              </button>

              {/* 3. 스마트 툴팁 (프로젝트 SmartTruncateTooltip 표준 원칙: bg-white, border-neutral-700, rounded-[5px], inline overlay) */}
              {hoveredIdx === originalIdx && (
                <div className="absolute left-13 top-1/2 -translate-y-1/2 z-50 pointer-events-none whitespace-nowrap bg-white text-slate-900 border border-neutral-700 rounded-[5px] shadow-2xl p-2.5 text-xs animate-in fade-in zoom-in-95 duration-75 min-w-[220px]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1.5">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded text-[10px]">
                      시트 #{numStr}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${
                        isAssy
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isAssy ? '조립도 (가공제외)' : '가공품 (견적대상)'}
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 text-xs truncate max-w-[260px]">
                    {dwgName}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                    도번: {dwgNo}
                  </div>
                  {d.material && d.material !== 'UNKNOWN' && (
                    <div className="text-[10px] text-slate-600 mt-1 flex items-center space-x-1">
                      <span className="font-semibold text-slate-400">재질:</span>
                      <span className="font-bold text-slate-800">{d.material}</span>
                    </div>
                  )}
                  <div className="text-[9px] text-blue-600 font-semibold mt-1.5 flex items-center space-x-1">
                    <Eye className="w-3 h-3" />
                    <span>클릭 시 해당 도면으로 0.1초 줌 포커스</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. 하단 범례 & 전체 뷰 복귀 버튼 */}
      <div className="w-full pt-2 border-t border-slate-800 flex flex-col items-center space-y-1 shrink-0">
        <button
          type="button"
          onClick={() => onSelectDrawing(-1)}
          className="w-10 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer text-[10px] font-bold"
          title="전체 도면 조망 (오버뷰) 복귀"
        >
          전체
        </button>
        <div className="flex items-center space-x-1 text-[8px] text-slate-400 pt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="조립도" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="가공품" />
        </div>
      </div>
    </aside>
  );
}
