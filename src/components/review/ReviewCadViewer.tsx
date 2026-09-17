'use client';

import React, { useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Ruler, Layers } from 'lucide-react';
import CadViewer from '@/components/CadViewer';

interface ReviewCadViewerProps {
  caseId: string;
  selectedBalloonNo?: string;
}

export default function ReviewCadViewer({ caseId, selectedBalloonNo }: ReviewCadViewerProps) {
  const [measureMode, setMeasureMode] = useState(false);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-sm flex flex-col">
      {/* 1. 상단 툴바 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-800/90 backdrop-blur-xs p-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs shadow-md">
        <span className="font-bold text-slate-100 px-2 py-0.5 bg-blue-600 rounded text-[11px]">
          도면 뷰어
        </span>

        {selectedBalloonNo && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[11px] border border-amber-500/30">
            풍선 포커스: {selectedBalloonNo}번
          </span>
        )}

        <div className="h-4 w-px bg-slate-700 mx-1" />

        <button
          onClick={() => setMeasureMode(!measureMode)}
          className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
            measureMode ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'
          }`}
          title="치수 측정 모드"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>측정</span>
        </button>
      </div>

      {/* 2. 도면 캔버스 (CadViewer 연동) */}
      <div className="flex-1 w-full h-full relative">
        <CadViewer
          caseId={caseId}
          cadObjects={[]}
          drawings={[]}
        />

        {/* 선택된 풍선 하이라이트 오버레이 (시각화 힌트) */}
        {selectedBalloonNo && (
          <div className="absolute bottom-4 left-4 z-10 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>선택 행 풍선 [{selectedBalloonNo}] 하이라이트 동기화 중</span>
          </div>
        )}
      </div>
    </div>
  );
}
