'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';
import DiffSummaryBanner from '@/components/diff/DiffSummaryBanner';
import RevisionDiffTable, { DiffRowItem } from '@/components/diff/RevisionDiffTable';
import PipelineNavigator from '@/components/common/PipelineNavigator';

export default function RevisionDiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [inheriting, setInheriting] = useState(false);
  const [caseInfo, setCaseInfo] = useState<any>(null);

  // 모의 리비전 Diff 데이터셋 (스토리보드 시나리오 B: Rev.A vs Rev.B)
  const [diffItems, setDiffItems] = useState<DiffRowItem[]>([
    {
      id: 'diff_1',
      changeType: 'MODIFIED',
      partNo: 'VB-203',
      changeField: '규격(치수)',
      oldValue: 'SUS316 Ø25×180',
      newValue: 'SUS316 Ø25×190',
      oldPrice: 37000,
      suggestedPrice: 38500,
      priceNote: '길이 10mm 연장에 따른 재계산',
      status: 'PENDING'
    },
    {
      id: 'diff_2',
      changeType: 'MODIFIED',
      partNo: 'VB-205',
      changeField: '두께(T)',
      oldValue: 'SS400 20T',
      newValue: 'SS400 25T',
      oldPrice: 45000,
      suggestedPrice: 51000,
      priceNote: '소재 중량 25% 증가',
      status: 'PENDING'
    },
    {
      id: 'diff_3',
      changeType: 'MODIFIED',
      partNo: 'VB-207',
      changeField: '후처리',
      oldValue: '무처리',
      newValue: '원통연마',
      oldPrice: 18000,
      suggestedPrice: 22000,
      priceNote: '연마 공정비 가산',
      status: 'PENDING'
    },
    {
      id: 'diff_4',
      changeType: 'ADDED',
      partNo: 'VB-210',
      changeField: '신규 부품',
      oldValue: '-',
      newValue: 'SUS304 PIN Ø8×40',
      oldPrice: undefined,
      suggestedPrice: 6500,
      priceNote: '자동 산출 견적',
      status: 'PENDING'
    },
    {
      id: 'diff_5',
      changeType: 'ADDED',
      partNo: 'VB-211',
      changeField: '신규 부품',
      oldValue: '-',
      newValue: 'NBR O-RING P-24',
      oldPrice: undefined,
      suggestedPrice: 850,
      priceNote: '카탈로그 구매품',
      status: 'PENDING'
    },
    {
      id: 'diff_6',
      changeType: 'DELETED',
      partNo: 'VB-208',
      changeField: '부품 삭제',
      oldValue: 'SPRING (SUS304)',
      newValue: '-',
      oldPrice: 9000,
      suggestedPrice: undefined,
      status: 'EXCLUDED'
    },
    {
      id: 'diff_7',
      changeType: 'IDENTICAL',
      partNo: 'VB-201',
      changeField: '동일 (변경없음)',
      oldValue: 'SCS13 12kg BODY',
      newValue: 'SCS13 12kg BODY',
      oldPrice: 412000,
      suggestedPrice: 412000,
      priceNote: '시세 기준 2개월 경과 (+2.1%)',
      status: 'PENDING'
    },
    {
      id: 'diff_8',
      changeType: 'IDENTICAL',
      partNo: 'VB-202',
      changeField: '동일 (변경없음)',
      oldValue: 'SCS13 BONNET',
      newValue: 'SCS13 BONNET',
      oldPrice: 188000,
      suggestedPrice: 188000,
      status: 'PENDING'
    }
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          setCaseInfo(json.case);
        }
      } catch (e) {
        console.error('Failed to load case info:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [caseId]);

  const stats = {
    added: diffItems.filter((it) => it.changeType === 'ADDED').length,
    modified: diffItems.filter((it) => it.changeType === 'MODIFIED').length,
    deleted: diffItems.filter((it) => it.changeType === 'DELETED').length,
    identical: diffItems.filter((it) => it.changeType === 'IDENTICAL').length
  };

  // 동일 행 일괄 계승
  const handleInheritIdentical = async () => {
    const identicalIds = diffItems
      .filter((it) => it.changeType === 'IDENTICAL')
      .map((it) => it.id);

    if (identicalIds.length === 0) return;

    setInheriting(true);
    try {
      const res = await fetch(`/api/quotes/${caseId}/inherit-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identicalItemIds: identicalIds })
      });

      if (res.ok) {
        setDiffItems((prev) =>
          prev.map((it) =>
            it.changeType === 'IDENTICAL' ? { ...it, status: 'ACCEPTED' } : it
          )
        );
        alert(`동일 행 ${identicalIds.length}건의 이전 확정 단가가 일괄 계승되었습니다.`);
      }
    } catch (e: any) {
      alert('단가 계승 통신 오류: ' + e.message);
    } finally {
      setInheriting(false);
    }
  };

  // 개별 행 검토 채택
  const handleAcceptRow = (id: string) => {
    setDiffItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'ACCEPTED' } : it))
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        리비전 대조 데이터 분석 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* 🚀 CADON v2.0: 3단계 직관적 파이프라인 네비게이터 */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={3}
        stats={{
          hasRevisionDiff: true
        }}
      />

      {/* 1. 상단 헤더 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-4">
          <Link href={`/quotes/${caseId}/review`} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                3단계 : 리비전 Diff 비교 & 단가 계승
              </span>
              <span className="text-xs text-slate-400 font-mono">{caseInfo?.case_no || caseId}</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 mt-0.5">
              {caseInfo?.case_name || '밸브 바디 (Rev.A vs Rev.B)'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/quotes/${caseId}/review`}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <span>단가 검토 워크스페이스로 이동</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* 2. 본문 컨텐츠 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-5">
        {/* 상단 요약 배너 및 일괄 계승 버튼 */}
        <DiffSummaryBanner
          baseCaseNo="QT-202607-0031"
          baseRevision="A"
          currentCaseNo={caseInfo?.case_no || "QT-202609-0082"}
          currentRevision="B"
          stats={stats}
          onInheritIdentical={handleInheritIdentical}
          inheriting={inheriting}
        />

        {/* 하단 리비전 대조 테이블 */}
        <RevisionDiffTable
          items={diffItems}
          onAcceptRow={handleAcceptRow}
        />
      </main>
    </div>
  );
}
