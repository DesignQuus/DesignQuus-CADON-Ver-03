'use client';

import React, { useState, useRef } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface SmartTruncateTooltipProps {
  text: string;
  className?: string;
  maxWidthClass?: string;
  showCopy?: boolean;
  subtext?: string;
  asLink?: boolean;
  href?: string;
  children?: React.ReactNode;
}

export default function SmartTruncateTooltip({
  text,
  className = 'font-bold text-slate-900 text-[13.5px]',
  maxWidthClass = 'max-w-[230px]',
  showCopy = true,
  subtext,
  asLink = false,
  href,
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
      setTimeout(() => setCopied(false), 1800);
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

      {/* 2. 스마트 툴팁 팝오버 (호버 시 표시) */}
      {isHovered && text && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 bottom-full mb-2 z-50 min-w-[220px] max-w-[420px] p-2.5 rounded-lg bg-slate-900 text-white shadow-2xl border border-slate-700/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150"
          style={{ filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))' }}
        >
          {/* 헤더 & 복사 버튼 */}
          <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-700/60 mb-1.5">
            <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>전체 명칭</span>
              {subtext && <span className="text-slate-500 font-normal">· {subtext}</span>}
            </div>

            {showCopy && (
              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/60'
                }`}
                title="클립보드로 복사"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400">복사 완료!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span className="text-[10px]">1-클릭 복사</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* 전체 텍스트 본문 (줄바꿈 허용, 선택 가능) */}
          <div className="text-xs font-mono font-medium text-slate-100 select-all break-all leading-relaxed whitespace-normal bg-slate-950/60 p-1.5 rounded border border-slate-800">
            {text}
          </div>

          {/* 말풍선 아래쪽 화살표 */}
          <div className="absolute left-4 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-slate-900" />
        </div>
      )}
    </div>
  );
}
