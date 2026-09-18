'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
  const [showBalloonNotice, setShowBalloonNotice] = useState(true);

  // 로컬 저장소에서 사용자 선호 알림 풍선 노출 설정 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cadon_balloon_notice_enabled');
      if (saved !== null) {
        setShowBalloonNotice(saved === 'true');
      }
    } catch {}
  }, []);

  const toggleBalloonNotice = () => {
    setShowBalloonNotice((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cadon_balloon_notice_enabled', String(next));
      } catch {}
    });
  };

  // 단축키 Alt+B 로 풍선 알림 즉시 토글
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement).tagName.toLowerCase())) return;
      if (e.altKey && (e.key === 'b' || e.key === 'B' || e.key === 'ㅠ')) {
        e.preventDefault();
        toggleBalloonNotice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-sm flex flex-col p-2.5">
      {/* 2단계 견적 검토 통합 CAD 뷰어 (상단 1줄 전문가 툴바 내장) */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
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
          isReviewMode={true}
          showBalloonNotice={showBalloonNotice}
          onToggleBalloonNotice={toggleBalloonNotice}
          selectedBalloonNo={selectedBalloonNo}
          selectedPartNo={selectedPartNo}
        />

        {/* 선택된 풍선 하이라이트 오버레이 (시각화 힌트 - 풍선알림 ON 시에만 노출) */}
        {showBalloonNotice && selectedBalloonNo && (
          <div className="absolute bottom-4 left-4 z-10 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>선택 행 풍선 [{selectedBalloonNo}] {externalFocusIdx !== null ? '도면 영역 줌 포커스 완료' : '동기화 중'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
