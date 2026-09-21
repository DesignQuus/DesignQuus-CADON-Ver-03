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
    }, 120);
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

      {/* 2. 스마트 툴팁 팝오버: 백색 바탕, 먹 70% 가는 라인(#4A4A4A), 5px 라운드, 텍스트 없이 아이콘만 배치 */}
      {isHovered && text && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 bottom-full mb-2 z-50 min-w-[180px] max-w-[380px] px-2.5 py-2 rounded-[5px] bg-white text-neutral-900 shadow-lg border border-neutral-700 animate-in fade-in zoom-in-95 duration-100 flex items-center justify-between gap-2.5"
        >
          {/* 전체 텍스트 본문 (중복 라벨 완전 제거, 가독성 높은 텍스트) */}
          <span className="text-[12px] font-medium text-neutral-900 select-all break-all leading-snug whitespace-normal">
            {text}
          </span>

          {/* 복사 아이콘만 배치 (텍스트 설명 제외, 클릭 시 체크 아이콘 전환) */}
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

          {/* 말풍선 아래쪽 화살표 꼬리표 (먹 70% 라인 및 백색 바탕과 일치) */}
          <div className="absolute left-4 top-full -mt-[4px] w-2 h-2 bg-white border-r border-b border-neutral-700 rotate-45" />
        </div>
      )}
    </div>
  );
}
