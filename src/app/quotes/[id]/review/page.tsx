'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, CheckCircle2, RefreshCw, FileText, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, Sparkles, Layers
} from 'lucide-react';
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
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);

  // 실제 사내 마스터 DB 및 과거 수주 지식풀 추천 목록
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(false);
  const [submittingQuote, setSubmittingQuote] = useState<boolean>(false);

  // 케이스 데이터 로드 (실데이터 우선 바인딩 & 자동 확정 승계)
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          setCaseInfo(json.case);

          // 1. 실제 견적서 품목(quoteItems)이 이미 생성되어 있는 경우
          if (Array.isArray(json.quoteItems) && json.quoteItems.length > 0) {
            setLines(
              json.quoteItems.map((qi: any, idx: number) => {
                const hasPrice = Number(qi.unit_price) > 0;
                const isConfirmed = hasPrice && qi.is_included !== 0;
                const specLower = (qi.specification || '').toLowerCase();
                const matLower = (qi.material || '').toLowerCase();
                const partType = specLower.includes('bolt') || specLower.includes('nut') || specLower.includes('washer') ? 'COMMERCIAL' :
                                 matLower.includes('scs') || matLower.includes('cast') || matLower.includes('gcd') ? 'CASTING' : 'MACHINING';
                const supplyPrice = Number(qi.unit_price) || 0;
                const unitCost = Math.round(supplyPrice * 0.82);

                return {
                  id: qi.id,
                  itemNo: qi.item_no || idx + 1,
                  partNo: qi.drawing_no || qi.master_code || `PART-${idx + 1}`,
                  partName: qi.item_name || 'BOM 부품',
                  partType: partType,
                  material: qi.material || 'SS400',
                  quantity: Number(qi.quantity) || 1,
                  unitCost: unitCost,
                  supplyPrice: supplyPrice,
                  status: isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW',
                  balloonNo: String(qi.item_no || idx + 1),
                  memo: qi.remark || ''
                };
              })
            );
          } else if (Array.isArray(json.normalizedItems) && json.normalizedItems.length > 0) {
            // 2. 견적서 생성 전 정규화 BOM 항목(normalizedItems)이 있는 경우
            const isCaseReady = json.case?.quote_readiness === 'READY_FOR_QUOTE';
            setLines(
              json.normalizedItems.map((it: any, idx: number) => {
                const isApproved = isCaseReady || it.approval_status === 'APPROVED' || it.is_quote_included !== 0;
                const specLower = (it.spec_candidate || '').toLowerCase();
                const matLower = (it.material_candidate || '').toLowerCase();
                const partType = specLower.includes('bolt') || specLower.includes('nut') ? 'COMMERCIAL' :
                                 matLower.includes('scs') || matLower.includes('cast') ? 'CASTING' : 'MACHINING';
                const unitCost = partType === 'CASTING' ? 345000 : partType === 'MACHINING' ? 34500 : 420;
                const supplyPrice = Math.ceil(unitCost * 1.18 / 100) * 100;

                return {
                  id: it.id,
                  itemNo: idx + 1,
                  partNo: it.spec_candidate || `BOM-${idx + 1}`,
                  partName: it.normalized_name || it.raw_name || 'BOM 부품',
                  partType: partType,
                  material: it.material_candidate || 'SS400',
                  quantity: Number(it.quantity) || 1,
                  unitCost,
                  supplyPrice,
                  status: isApproved ? 'CONFIRMED' : 'NEEDS_REVIEW',
                  balloonNo: String(idx + 1)
                };
              })
            );
          } else {
            setLines([]);
          }
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

  // 💎 2단계: 실제 Master DB & 수기 단가 지식풀(manual_price_pool) 실시간 추천 조회
  useEffect(() => {
    if (!selectedLine) {
      setRecommendations([]);
      return;
    }
    const qName = selectedLine.partName || selectedLine.partNo;
    if (!qName) return;

    let active = true;
    setLoadingRecs(true);

    apiFetch(`/api/manual-prices?name=${encodeURIComponent(qName)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const recs: RecommendationItem[] = [];

        // 1. 사내 기준 단가 마스터 (price_masters + product_masters)
        if (Array.isArray(json.priceMasters)) {
          for (const pm of json.priceMasters) {
            recs.push({
              id: `pm_${pm.price_master_id || pm.master_id}`,
              sourceCompany: '기준 단가 마스터',
              partNo: pm.master_code || pm.standard_name,
              revision: 'STD',
              unitPrice: Number(pm.unit_price || 0),
              confirmedDate: '사내 표준',
              isOrdered: true,
              matchReason: pm.master_code === selectedLine.partNo ? 'REVISION_MATCH' : 'SPEC_SIMILAR',
              specDesc: `${pm.material || ''} ${pm.specification || ''}`.trim() || '기준 규격 마스터'
            });
            if (recs.length >= 3) break;
          }
        }

        // 2. 수기 단가 지식 풀 (과거 실제 견적 승인/도면 검수 이력)
        if (Array.isArray(json.manualPrices)) {
          for (const mp of json.manualPrices) {
            if (recs.some((r) => r.unitPrice === mp.unit_price)) continue;
            recs.push({
              id: `mp_${mp.id}`,
              sourceCompany: mp.company_name || '과거 수주 이력',
              partNo: mp.item_name,
              revision: 'A',
              unitPrice: Number(mp.unit_price || 0),
              confirmedDate: mp.last_used_at?.slice(0, 7) || '수주 완료',
              isOrdered: (mp.approval_count || 0) > 0,
              matchReason: 'NAME_SIMILAR',
              specDesc: `${mp.material || ''} ${mp.specification || ''}`.trim() || '실제 수주 채택 단가'
            });
            if (recs.length >= 3) break;
          }
        }

        setRecommendations(recs);
      })
      .catch(() => {
        if (active) setRecommendations([]);
      })
      .finally(() => {
        if (active) setLoadingRecs(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLine?.id, selectedLine?.partName, selectedLine?.partNo]);

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

  const unconfirmedCount = lines.filter((l) => l.status !== 'CONFIRMED').length;
  const totalCost = lines.reduce((acc, l) => acc + l.unitCost * l.quantity, 0);
  const totalSupply = lines.reduce((acc, l) => acc + l.supplyPrice * l.quantity, 0);
  const avgMargin = totalSupply > 0 ? Math.round(((totalSupply - totalCost) / totalSupply) * 1000) / 10 : 0;

  const handleSubmitQuote = async () => {
    if (unconfirmedCount > 0) {
      alert(`미확정 항목이 ${unconfirmedCount}건 남아있습니다. 전 항목 단가를 확정한 후 결재 상신해주세요.`);
      return;
    }
    setSubmittingQuote(true);
    try {
      // 1. 견적서 생성 API 시도
      try {
        await apiFetch(`/api/quotation-cases/${caseId}/create-quote`, {
          method: 'POST'
        });
      } catch (err) {
        console.warn('create-quote attempt:', err);
      }

      // 2. 3단계 공식 견적서 및 결재/출력 화면으로 라우팅
      router.push(`/quotes/${caseId}/publish`);
    } catch (e: any) {
      alert('결재 상신 처리 중 오류가 발생했습니다: ' + (e.message || ''));
    } finally {
      setSubmittingQuote(false);
    }
  };

  // 단축키 이벤트 리스너 (F2, F4, Space, ↑/↓, Ctrl+Enter)
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
      } else if (e.key === 'F2') {
        e.preventDefault();
        setIsBottomCollapsed((prev) => !prev);
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (recommendations.length > 0 && selectedLine) {
          handleUpdateSelected({ supplyPrice: recommendations[0].unitPrice });
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmitQuote();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lines, selectedIndex, selectedLine, recommendations, unconfirmedCount]);

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
            onClick={handleSubmitQuote}
            disabled={unconfirmedCount > 0 || submittingQuote}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors ${
              unconfirmedCount > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : submittingQuote
                ? 'bg-emerald-700 text-white cursor-wait opacity-80'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
            }`}
          >
            {submittingQuote ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submittingQuote
              ? '견적서 생성 및 이동 중...'
              : unconfirmedCount > 0
              ? `결재 상신 (${unconfirmedCount}행 미확정)`
              : '결재 상신'}
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

      {/* 하단 패널 접기/펼치기 토글 바 */}
      <div className="bg-slate-200 border-t border-b border-slate-300 px-4 py-1 flex items-center justify-between text-xs text-slate-600 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[11px] text-slate-600">
            {isBottomCollapsed ? '하단 원가·마스터 패널이 접혀 있습니다 (F2로 펼치기)' : '원가 상세 분해 & 사내 마스터 TOP-3 추천 비교'}
          </span>
        </div>
        <button
          onClick={() => setIsBottomCollapsed(!isBottomCollapsed)}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-medium transition-colors shadow-2xs cursor-pointer"
        >
          {isBottomCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
              <span>원가·마스터 패널 펼치기 (F2)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              <span>패널 접기 (F2)</span>
            </>
          )}
        </button>
      </div>

      {/* 3. 하단 패널 (원가 상세 내역 50% + MASTER Top-3 추천 카드 50%) */}
      {!isBottomCollapsed && (
        <div className="h-[264px] bg-slate-100 px-3 pb-3 pt-1.5 flex gap-3 shrink-0">
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
      )}

      {/* 4. 최하단 단축키 가이드 바 (가독성 향상) */}
      <footer className="bg-slate-900 border-t border-slate-700 text-slate-100 text-xs px-6 py-2 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-6 font-medium">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">Space</kbd>
            <span className="text-slate-200">확정 / 취소</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">F2</kbd>
            <span className="text-slate-200">하단패널 접기/펼치기</span>
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
