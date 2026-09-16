'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, CheckCircle2, RefreshCw, FileText, AlertTriangle, ExternalLink } from 'lucide-react';
import QuoteLineGrid, { QuoteReviewLine } from '@/components/review/QuoteLineGrid';
import CostBreakdownPanel from '@/components/review/CostBreakdownPanel';
import MasterRecommendationCard, { RecommendationItem } from '@/components/review/MasterRecommendationCard';
import ReviewCadViewer from '@/components/review/ReviewCadViewer';
import PipelineNavigator from '@/components/common/PipelineNavigator';

export default function QuoteReviewWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [caseInfo, setCaseInfo] = useState<any>(null);
  const [lines, setLines] = useState<QuoteReviewLine[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>('ALL');

  // 모의 MASTER DB 추천 목록 (스토리보드 시나리오 Top-3)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([
    {
      id: 'rec_1',
      sourceCompany: '협력A',
      partNo: 'VB-203',
      revision: 'A',
      unitPrice: 37000,
      confirmedDate: '2026-07',
      isOrdered: true,
      matchReason: 'REVISION_MATCH',
      specDesc: 'SUS316 Ø25×180'
    },
    {
      id: 'rec_2',
      sourceCompany: '협력B',
      partNo: 'PS-11',
      revision: '0',
      unitPrice: 34000,
      confirmedDate: '2026-05',
      isOrdered: false,
      matchReason: 'SPEC_SIMILAR',
      specDesc: 'SUS316 Ø25×200'
    },
    {
      id: 'rec_3',
      sourceCompany: '이관데이터',
      partNo: 'STEM-25',
      revision: '-',
      unitPrice: 36000,
      confirmedDate: '2024',
      isOrdered: false,
      matchReason: 'SPEC_SIMILAR',
      specDesc: 'SUS316 Ø25'
    }
  ]);

  // 케이스 데이터 로드
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          setCaseInfo(json.case);

          const norm = json.normalizedItems || [];
          if (norm.length > 0) {
            setLines(
              norm.map((it: any, idx: number) => {
                const partType = (it.spec_candidate || '').includes('BOLT') ? 'COMMERCIAL' :
                                 (it.material_candidate || '').includes('SCS') ? 'CASTING' : 'MACHINING';
                const unitCost = partType === 'CASTING' ? 345000 : partType === 'MACHINING' ? 34500 : 420;
                const supplyPrice = Math.ceil(unitCost * 1.18 / 100) * 100;

                return {
                  id: it.id,
                  itemNo: idx + 1,
                  partNo: it.spec_candidate || `VB-20${idx + 1}`,
                  partName: it.normalized_name || it.raw_name,
                  partType: idx === 4 ? 'UNCLASSIFIED' : partType,
                  material: it.material_candidate || 'SS400',
                  quantity: Number(it.quantity) || 20,
                  unitCost,
                  supplyPrice,
                  status: idx < 2 ? 'CONFIRMED' : idx === 2 ? 'NEEDS_REVIEW' : 'AUTO',
                  balloonNo: String(idx + 1)
                };
              })
            );
          } else {
            // 샘플 또는 신규 건일 경우 스토리보드 표준 샘플 데이터 5건 자동 장착
            setLines([
              { id: 'sample_1', itemNo: 1, partNo: 'VB-201', partName: 'VALVE BODY', partType: 'CASTING', material: 'SCS13', quantity: 20, unitCost: 345000, supplyPrice: 412000, status: 'CONFIRMED', balloonNo: '1' },
              { id: 'sample_2', itemNo: 2, partNo: 'VB-202', partName: 'BONNET', partType: 'CASTING', material: 'SCS13', quantity: 20, unitCost: 155000, supplyPrice: 188000, status: 'CONFIRMED', balloonNo: '2' },
              { id: 'sample_3', itemNo: 3, partNo: 'VB-203', partName: 'STEM SHAFT', partType: 'MACHINING', material: 'SUS316', quantity: 20, unitCost: 34500, supplyPrice: 38500, status: 'NEEDS_REVIEW', balloonNo: '3', memo: '길이 180->190 변경' },
              { id: 'sample_4', itemNo: 4, partNo: 'B-M12', partName: 'HEX BOLT M12', partType: 'COMMERCIAL', material: 'SUS304', quantity: 160, unitCost: 350, supplyPrice: 420, status: 'AUTO', balloonNo: '4' },
              { id: 'sample_5', itemNo: 5, partNo: 'VB-209', partName: 'SEALING GASKET', partType: 'UNCLASSIFIED', material: 'PTFE', quantity: 20, unitCost: 0, supplyPrice: 0, status: 'AUTO', balloonNo: '9' }
            ]);
          }
        } else {
          // 케이스를 찾을 수 없는 경우에도 샘플 데이터 제공
          setLines([
            { id: 'sample_1', itemNo: 1, partNo: 'VB-201', partName: 'VALVE BODY', partType: 'CASTING', material: 'SCS13', quantity: 20, unitCost: 345000, supplyPrice: 412000, status: 'CONFIRMED', balloonNo: '1' },
            { id: 'sample_2', itemNo: 2, partNo: 'VB-202', partName: 'BONNET', partType: 'CASTING', material: 'SCS13', quantity: 20, unitCost: 155000, supplyPrice: 188000, status: 'CONFIRMED', balloonNo: '2' },
            { id: 'sample_3', itemNo: 3, partNo: 'VB-203', partName: 'STEM SHAFT', partType: 'MACHINING', material: 'SUS316', quantity: 20, unitCost: 34500, supplyPrice: 38500, status: 'NEEDS_REVIEW', balloonNo: '3', memo: '길이 180->190 변경' },
            { id: 'sample_4', itemNo: 4, partNo: 'B-M12', partName: 'HEX BOLT M12', partType: 'COMMERCIAL', material: 'SUS304', quantity: 160, unitCost: 350, supplyPrice: 420, status: 'AUTO', balloonNo: '4' },
            { id: 'sample_5', itemNo: 5, partNo: 'VB-209', partName: 'SEALING GASKET', partType: 'UNCLASSIFIED', material: 'PTFE', quantity: 20, unitCost: 0, supplyPrice: 0, status: 'AUTO', balloonNo: '9' }
          ]);
        }
      } catch (e) {
        console.error('Failed to load review case:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [caseId]);

  const selectedLine = lines[selectedIndex] || null;

  // 단가 확정 토글
  const handleToggleConfirm = async (lineId: string) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;

    if (target.partType === 'UNCLASSIFIED') {
      alert('부품 유형이 [미분류]인 항목은 확정할 수 없습니다. 유형을 지정해 주세요.');
      return;
    }

    const nextStatus = target.status === 'CONFIRMED' ? 'NEEDS_REVIEW' : 'CONFIRMED';
    const isNowConfirmed = nextStatus === 'CONFIRMED';

    // 로컬 상태 즉각 반영
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, status: nextStatus } : l))
    );

    // API 호출 (백그라운드 동기화 및 DB 축적)
    try {
      await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: target.id,
          partKey: `PARTNER_A:${target.partNo}:B`,
          isConfirmed: isNowConfirmed,
          unitPrice: target.supplyPrice,
          unitCost: target.unitCost,
          qtyTier: target.quantity <= 9 ? '1~9' : target.quantity <= 99 ? '10~99' : '100~',
          lotQuantity: target.quantity
        })
      });
    } catch (e) {
      console.error('Confirm toggle error:', e);
    }
  };

  // 선택 행 업데이트
  const handleUpdateSelected = (updated: Partial<QuoteReviewLine>) => {
    if (!selectedLine) return;
    setLines((prev) =>
      prev.map((l) => (l.id === selectedLine.id ? { ...l, ...updated } : l))
    );
  };

  // 단축키 이벤트 리스너 (F4, Space, ↑/↓)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, lines.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (selectedLine) handleToggleConfirm(selectedLine.id);
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (recommendations.length > 0 && selectedLine) {
          handleUpdateSelected({ supplyPrice: recommendations[0].unitPrice });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lines, selectedIndex, selectedLine, recommendations]);

  const unconfirmedCount = lines.filter((l) => l.status !== 'CONFIRMED').length;
  const totalCost = lines.reduce((acc, l) => acc + l.unitCost * l.quantity, 0);
  const totalSupply = lines.reduce((acc, l) => acc + l.supplyPrice * l.quantity, 0);
  const avgMargin = totalSupply > 0 ? Math.round(((totalSupply - totalCost) / totalSupply) * 1000) / 10 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        단가 검토 워크스페이스 로딩 중...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      {/* 🚀 CADON v2.0: 3단계 직관적 파이프라인 네비게이터 */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={2}
        stats={{
          unconfirmedCount,
          marginWarning: avgMargin < 12.0
        }}
      />

      {/* 1. 상단 워크스페이스 헤더 */}
      <header className="bg-white border-b border-slate-200 px-5 py-2 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/quotes" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                2단계 : 3분할 통합 단가 검토
              </span>
              <span className="text-xs text-slate-400 font-mono">{caseInfo?.case_no || caseId}</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 mt-0.5">
              {caseInfo?.case_name || '밸브 바디 20세트 (협력A)'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="hidden md:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span>원가 합계: <strong className="font-mono text-slate-700">₩{totalCost.toLocaleString()}</strong></span>
            <span className="text-slate-300">|</span>
            <span>공급 합계: <strong className="font-mono text-blue-700 font-bold">₩{totalSupply.toLocaleString()}</strong></span>
            <span className="text-slate-300">|</span>
            <span>평균 마진: <strong className="font-mono text-emerald-700 font-bold">{avgMargin}%</strong></span>
          </div>

          <button
            onClick={() => {
              if (unconfirmedCount > 0) {
                alert(`미확정 행이 ${unconfirmedCount}건 남아있어 결재 상신할 수 없습니다.`);
                return;
              }
              alert('전 행 확정 완료! 팀장/대표 결재 상신이 완료되었습니다.');
            }}
            disabled={unconfirmedCount > 0}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors ${
              unconfirmedCount > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            {unconfirmedCount > 0 ? `결재 상신 (${unconfirmedCount}행 미확정)` : '결재 상신'}
          </button>
        </div>
      </header>

      {/* 2. 상단 2열 (좌: 도면 뷰어 45%, 우: BOM 그리드 55%) */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* 좌측 45%: Three.js 도면 뷰어 */}
        <div className="w-[45%] h-full">
          <ReviewCadViewer
            caseId={caseId}
            selectedBalloonNo={selectedLine?.balloonNo}
          />
        </div>

        {/* 우측 55%: BOM & 단가 그리드 */}
        <div className="w-[55%] h-full">
          <QuoteLineGrid
            lines={lines}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onToggleConfirm={handleToggleConfirm}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        </div>
      </div>

      {/* 3. 하단 패널 (원가 상세 내역 50% + MASTER Top-3 추천 카드 50%) */}
      <div className="h-[264px] bg-slate-100 border-t border-slate-200 px-3 pb-3 pt-1.5 flex gap-3 shrink-0">
        <div className="w-1/2 h-full">
          <CostBreakdownPanel
            line={selectedLine}
            onUpdateLine={handleUpdateSelected}
          />
        </div>
        <div className="w-1/2 h-full">
          <MasterRecommendationCard
            recommendations={recommendations}
            onApplyPrice={(prc) => handleUpdateSelected({ supplyPrice: prc })}
          />
        </div>
      </div>

      {/* 4. 최하단 단축키 가이드 바 (가독성 향상) */}
      <footer className="bg-slate-900 border-t border-slate-700 text-slate-100 text-xs px-6 py-2.5 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-6 font-medium">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">Space</kbd>
            <span className="text-slate-200">확정 / 취소</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">F4</kbd>
            <span className="text-slate-200">추천단가 즉시채택</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">↑ / ↓</kbd>
            <span className="text-slate-200">행 간 이동</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">Ctrl + Enter</kbd>
            <span className="text-slate-200">결재 상신</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400 font-semibold text-[11px]">CADON v2.0 Workspace Ready</span>
        </div>
      </footer>
    </div>
  );
}
