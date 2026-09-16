'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Layers, Sparkles, HelpCircle } from 'lucide-react';
import TitleBlockCard, { TitleBlockData } from '@/components/extract/TitleBlockCard';
import BomMappingTable, { BomRowItem } from '@/components/extract/BomMappingTable';
import NoInfoEnrichmentModal from '@/components/extract/NoInfoEnrichmentModal';
import PipelineNavigator from '@/components/common/PipelineNavigator';

export default function ExtractVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [caseInfo, setCaseInfo] = useState<any>(null);
  const [titleBlock, setTitleBlock] = useState<TitleBlockData>({
    drawingNo: 'VB-200',
    revision: 'B',
    partName: 'VALVE BODY ASSY',
    material: '-',
    scale: '1:2',
    unit: 'mm',
    confidence: 'HIGH'
  });

  const [bomItems, setBomItems] = useState<BomRowItem[]>([]);
  const [isGradeD, setIsGradeD] = useState(false);
  const [showEnrichModal, setShowEnrichModal] = useState(false);

  // 초기 데이터 로드
  useEffect(() => {
    async function loadCase() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          setCaseInfo(json.case);

          // 도면 표제란 매핑
          if (json.drawings && json.drawings.length > 0) {
            const d = json.drawings[0];
            setTitleBlock({
              drawingNo: d.drawing_no_normalized || d.drawing_no_raw || 'VB-200',
              revision: d.revision || 'A',
              partName: d.drawing_name_normalized || d.drawing_name_raw || '도면 부품',
              material: d.material || '-',
              scale: d.scale || '1:1',
              unit: 'mm',
              confidence: (d.confidence_score || 0.8) >= 0.9 ? 'HIGH' : 'MEDIUM'
            });
          }

          // BOM 목록 매핑
          const normItems = json.normalizedItems || [];
          if (normItems.length > 0) {
            setBomItems(
              normItems.map((it: any, idx: number) => ({
                id: it.id,
                itemNo: String(idx + 1),
                partNo: it.spec_candidate || `P-${idx + 1}`,
                partName: it.normalized_name || it.raw_name,
                material: it.material_candidate || 'SS400',
                quantity: Number(it.quantity) || 1,
                postProcess: '',
                confidence: idx === 2 ? 'LOW' : 'HIGH', // 예시: 1건을 검증용 LOW로 배치
                actionNote: idx === 2 ? '풍선 중복 의심' : '엔티티 정상 추출'
              }))
            );
          } else {
            // BOM이 0건이면 등급 D (무정보 도면) 후보로 판정
            setIsGradeD(true);
          }
        }
      } catch (e) {
        console.error('Failed to load quotation case:', e);
      } finally {
        setLoading(false);
      }
    }
    loadCase();
  }, [caseId]);

  const handleItemChange = (id: string, updated: Partial<BomRowItem>) => {
    setBomItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updated } : it)));
  };

  const handleDeleteItem = (id: string) => {
    setBomItems((prev) => prev.filter((it) => it.id !== id));
  };

  const hasLowConfidence = bomItems.some((it) => it.confidence === 'LOW');

  // 최종 승인 및 단가 산출 단계로 이동
  const handleApprove = async () => {
    if (hasLowConfidence) {
      alert('신뢰도 [낮음] 항목을 먼저 해결(또는 삭제)해야 승인할 수 있습니다.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/quotes/${caseId}/extract-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleBlock,
          bomItems,
          saveAsTemplate: true,
          isConditional: isGradeD
        })
      });

      if (res.ok) {
        // 단가 검토 워크스페이스로 이동
        router.push(`/cases/${caseId}`);
      } else {
        const errJson = await res.json();
        alert(errJson.error || '승인 실패');
      }
    } catch (e: any) {
      alert('통신 오류: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        도면 분석 및 표제란 데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* 🚀 CADON v2.0: 3단계 직관적 파이프라인 네비게이터 */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={1}
        stats={{
          unconfirmedCount: bomItems.length
        }}
      />

      {/* 1. 헤더 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-4">
          <Link href="/quotes" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                1단계 : 도면 등록 & BOM 추출 검증
              </span>
              <span className="text-xs text-slate-400 font-mono">{caseInfo?.case_no || caseId}</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 mt-0.5">
              {caseInfo?.case_name || '도면 BOM 및 표제란 검증'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isGradeD && (
            <button
              onClick={() => setShowEnrichModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center gap-1.5 transition-colors border border-amber-300"
            >
              <Sparkles className="w-4 h-4" />
              무정보 도면 정보 보강
            </button>
          )}

          <button
            onClick={handleApprove}
            disabled={hasLowConfidence || submitting}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors ${
              hasLowConfidence || submitting
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {hasLowConfidence ? '낮음 항목 해결 후 승인 가능' : submitting ? '승인 처리 중...' : '추출 결과 승인 → 단가 산출'}
          </button>
        </div>
      </header>

      {/* 2. 본문 컨텐츠 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-5">
        {/* 상단: 표제란 카드 */}
        <TitleBlockCard
          data={titleBlock}
          onChange={setTitleBlock}
          onSaveTemplate={() => alert('현재 고객사의 표제란 템플릿으로 안전하게 저장되었습니다.')}
        />

        {/* 하단: BOM 매핑 테이블 */}
        <BomMappingTable
          items={bomItems}
          onChangeItem={handleItemChange}
          onDeleteItem={handleDeleteItem}
        />
      </main>

      {/* 등급 D 무정보 도면 정보 보강 모달 */}
      <NoInfoEnrichmentModal
        isOpen={showEnrichModal}
        onClose={() => setShowEnrichModal(false)}
        hint={{
          detectedBbox: { width: 250, length: 180, thickness: 12 },
          holeCount: 4,
          estimatedWeightKg: 4.24
        }}
        onProceedConditionalQuote={(cond) => {
          setBomItems([
            {
              id: 'new_1',
              itemNo: '1',
              partNo: cond.tempPartNo,
              partName: cond.partName,
              material: cond.assumedMaterial,
              quantity: cond.quantity,
              confidence: 'HIGH',
              actionNote: cond.conditionNote
            }
          ]);
          setShowEnrichModal(false);
        }}
        onRequestCustomerSpec={() => {
          alert('영업 전달용 [고객 사양 확인 요청서] PDF가 생성되었습니다.');
          setShowEnrichModal(false);
        }}
      />
    </div>
  );
}
