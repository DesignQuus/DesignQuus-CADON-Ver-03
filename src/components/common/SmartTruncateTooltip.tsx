'use client';

import React, { useState, useRef } from 'react';
import { Copy, Check } from 'lucide-react';

interface SmartTruncateTooltipProps {
  text: string;
  className?: string;
  maxWidthClass?: string;
  showCopy?: boolean;
  children?: React.ReactNode;
}

export default function SmartTruncateTooltip({
  text,
  className = 'font-bold text-slate-900 text-[13.5px]',
  maxWidthClass = 'max-w-[240px]',
  showCopy = true,
  children
}: SmartTruncateTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div
      className="relative inline-flex items-center max-w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 1. 기본 표시 텍스트 (말줄임) */}
      <span
        className={`truncate ${maxWidthClass} ${className} cursor-pointer select-none`}
        title=""
      >
        {children || text}
      </span>

      {/* 2. 인라인 텍스트 오버레이 팝오버:
          - 텍스트 위치를 바로 덮음 (위아래 다른 행/헤더 침범 최소화)
          - 삼각형 꼬리표 돌출부 완전 제거
          - 백색 바탕, 먹 70% 가는 라인(#4A4A4A), 5px 라운드, 복사 아이콘만 우측 배치 */}
      {isHovered && text && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute -left-2 top-1/2 -translate-y-1/2 z-50 min-w-full w-max max-w-[420px] px-2.5 py-1.5 rounded-[5px] bg-white text-neutral-900 shadow-md border border-neutral-700 animate-in fade-in zoom-in-95 duration-75 flex items-center justify-between gap-2.5"
        >
          {/* 전체 텍스트 본문 (1줄 유지 또는 자연스러운 줄바꿈) */}
          <span className="text-[13px] font-bold text-neutral-900 select-all break-all leading-snug whitespace-normal">
            {text}
          </span>

          {/* 복사 아이콘 버튼 (텍스트 설명 없음, 클릭 시 체크로 전환) */}
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className={`shrink-0 p-1 rounded-[3px] transition-colors border ${
                copied
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border-transparent hover:border-neutral-300'
              }`}
              title={copied ? '복사 완료' : '텍스트 복사'}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
