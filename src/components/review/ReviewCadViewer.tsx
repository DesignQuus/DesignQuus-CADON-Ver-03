'use client';

import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Ruler, Layers } from 'lucide-react';
import CadViewer from '@/components/CadViewer';

interface ReviewCadViewerProps {
  caseId: string;
  cadObjects?: any[];
  drawings?: any[];
  relationships?: any[];
  bomAreas?: any[];
  rawBomItems?: any[];
  allFiles?: any[];
  selectedBalloonNo?: string;
  selectedPartNo?: string;
}

export default function ReviewCadViewer({
  caseId,
  cadObjects = [],
  drawings = [],
  relationships = [],
  bomAreas = [],
  rawBomItems = [],
  allFiles = [],
  selectedBalloonNo,
  selectedPartNo
}: ReviewCadViewerProps) {
  const [measureMode, setMeasureMode] = useState(false);

  // 선택된 BOM 행과 매칭되는 도면 인덱스 자동 추적 및 줌인 포커스
  const externalFocusIdx = useMemo(() => {
    if (!drawings || drawings.length === 0) return null;
    if (!selectedPartNo && !selectedBalloonNo) return null;

    // 1. 도면 번호 또는 품번 일치 검색
    if (selectedPartNo) {
      const idx = drawings.findIndex((d: any) =>
        (d.drawing_no_raw && d.drawing_no_raw.trim().toLowerCase() === selectedPartNo.trim().toLowerCase()) ||
        (d.drawing_no_normalized && d.drawing_no_normalized.trim().toLowerCase() === selectedPartNo.trim().toLowerCase()) ||
        (d.drawing_name_raw && d.drawing_name_raw.trim().toLowerCase() === selectedPartNo.trim().toLowerCase())
      );
      if (idx >= 0) return idx;
    }

    // 2. 풍선 번호 또는 도면 인덱스 일치 검색
    if (selectedBalloonNo) {
      const bNum = parseInt(selectedBalloonNo, 10);
      const idx = drawings.findIndex((d: any, i: number) =>
        d.balloon_no === selectedBalloonNo ||
        d.drawing_index === bNum - 1 ||
        String(i + 1) === selectedBalloonNo
      );
      if (idx >= 0) return idx;
    }

    return null;
  }, [drawings, selectedPartNo, selectedBalloonNo]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-sm flex flex-col">
      {/* 1. 상단 툴바 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-800/90 backdrop-blur-xs p-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs shadow-md">
        <span className="font-bold text-slate-100 px-2 py-0.5 bg-blue-600 rounded text-[11px]">
          도면 뷰어
        </span>

        {selectedBalloonNo && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[11px] border border-amber-500/30">
            풍선 포커스: {selectedBalloonNo}번 {selectedPartNo ? `(${selectedPartNo})` : ''}
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

      {/* 2. 도면 캔버스 (실제 CAD 벡터 뷰어) */}
      <div className="flex-1 w-full h-full relative">
        <CadViewer
          caseId={caseId}
          cadObjects={cadObjects}
          drawings={drawings}
          relationships={relationships}
          bomAreas={bomAreas}
          rawBomItems={rawBomItems}
          allFiles={allFiles}
          selectedFile={allFiles.length > 0 ? allFiles[0] : null}
          externalFocusIdx={externalFocusIdx}
          isSidebarOpen={false}
        />

        {/* 선택된 풍선 하이라이트 오버레이 (시각화 힌트) */}
        {selectedBalloonNo && (
          <div className="absolute bottom-4 left-4 z-10 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>선택 행 풍선 [{selectedBalloonNo}] {externalFocusIdx !== null ? '도면 영역 줌 포커스 완료' : '동기화 중'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
