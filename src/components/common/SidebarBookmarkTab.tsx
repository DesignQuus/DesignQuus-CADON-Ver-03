'use client';

import React from 'react';
import { LucideIcon, ChevronRight, ChevronLeft } from 'lucide-react';

export interface SidebarBookmarkTabProps {
  /** 
   * 'expand': 사이드바가 닫혔을 때 좌측 벽면에 표시 (펼치기용)
   * 'collapse': 사이드바가 열렸을 때 사이드바 우측 테두리에 표시 (접기용)
   */
  mode: 'expand' | 'collapse';
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 세로 표출 텍스트 (예: '관제탑', '파이프라인', '도면등록', '접기') */
  label: string;
  /** 아이콘 (펼치기 모드 시 상단 표출) */
  icon?: LucideIcon;
  /** 툴팁 타이틀 */
  title?: string;
  /** 추가 클래스 */
  className?: string;
  /** 화면 절대 위치 강제 (기본: expand는 fixed, collapse는 absolute) */
  positionOverride?: 'fixed' | 'absolute';
}

/**
 * 🔖 CADON 표준 버티컬 북마크(책갈피) 견출 탭 컴포넌트
 * - 평상시: 시야를 방해하지 않는 11px 블루 인디케이터 핸들
 * - 마우스 호버 시: 120ms 즉각 반응으로 36px 돌출되며 수직 텍스트 & 아이콘 표출
 * - 수직 위치: 모든 화면에서 'top-1/2 -translate-y-1/2' (수직 정중앙)으로 통일되어 상하 UI 간섭 원천 방지
 */
export default function SidebarBookmarkTab({
  mode,
  onClick,
  label,
  icon: Icon,
  title,
  className = '',
  positionOverride
}: SidebarBookmarkTabProps) {
  if (mode === 'expand') {
    const posClass = positionOverride === 'absolute' 
      ? 'absolute left-0 top-1/2 -translate-y-1/2 z-30'
      : 'fixed left-0 top-1/2 -translate-y-1/2 z-40';

    return (
      <button
        type="button"
        onClick={onClick}
        className={`${posClass} group cursor-pointer w-9 text-left select-none focus:outline-hidden ${className}`}
        title={title || `${label} 펼치기 (사이드바 열기)`}
      >
        {/* 시각적 손잡이 & 돌출 본체 (평상시 11px 노출 -> 호버 시 36px 완전 돌출, 120ms 초고속 반응) */}
        <div className="flex flex-col items-center justify-center bg-white group-hover:bg-blue-50/90 text-slate-800 group-hover:text-blue-600 border-y border-r border-l-0 border-slate-300 group-hover:border-blue-400 rounded-r-xl shadow-md group-hover:shadow-2xl transition-all duration-[120ms] ease-out py-3.5 w-[11px] group-hover:w-9 overflow-hidden relative">
          {/* 평상시 살짝 보이는 라운드 엣지의 블루 핸들 인디케이터 바 */}
          <div className="absolute right-[3px] top-1/2 -translate-y-1/2 w-[3px] h-8 bg-blue-500 rounded-full group-hover:opacity-0 transition-opacity duration-[100ms]" />

          {/* 호버 시 우측으로 돌출되며 온전하게 표출되는 견출지 콘텐츠 */}
          <div className="flex flex-col items-center justify-center space-y-2 w-9 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
            {Icon && <Icon className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />}
            <div className="flex flex-col items-center justify-center text-[10.5px] font-extrabold text-slate-800 group-hover:text-blue-600 leading-[1.2] tracking-tight">
              {label.split('').map((char, idx) => (
                <span key={idx}>{char}</span>
              ))}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
        </div>
      </button>
    );
  }

  // mode === 'collapse'
  const posClass = positionOverride === 'fixed'
    ? 'fixed left-80 top-1/2 -translate-y-1/2 z-40'
    : 'hidden lg:block absolute left-full top-1/2 -translate-y-1/2 z-30';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${posClass} group cursor-pointer w-9 text-left select-none focus:outline-hidden ${className}`}
      title={title || `${label} 접기 (도면/테이블 넓게 보기)`}
    >
      <div className="flex flex-col items-center justify-center bg-white group-hover:bg-blue-50/90 text-slate-800 group-hover:text-blue-600 border-y border-r border-l-0 border-slate-300 group-hover:border-blue-400 rounded-r-xl shadow-md group-hover:shadow-2xl transition-all duration-[120ms] ease-out py-3 w-[11px] group-hover:w-9 overflow-hidden relative">
        {/* 평상시 살짝 보이는 라운드 엣지의 블루 핸들 인디케이터 바 */}
        <div className="absolute right-[3px] top-1/2 -translate-y-1/2 w-[3px] h-7 bg-blue-500 rounded-full group-hover:opacity-0 transition-opacity duration-[100ms]" />

        {/* 호버 시 우측으로 돌출되며 온전하게 표출되는 견출지 콘텐츠 */}
        <div className="flex flex-col items-center justify-center space-y-1.5 w-9 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
          <ChevronLeft className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
          <div className="flex flex-col items-center justify-center text-[10px] font-extrabold text-slate-800 group-hover:text-blue-600 leading-[1.15] tracking-tight">
            {label.split('').map((char, idx) => (
              <span key={idx}>{char}</span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
