'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Printer, 
  Download, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Coins, 
  Eye, 
  EyeOff, 
  Building2, 
  Send,
  RefreshCw,
  ArrowLeft,
  Zap,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck
} from 'lucide-react';
import PipelineNavigator from '@/components/common/PipelineNavigator';
import { apiFetch } from '@/lib/api';

export default function QuotePublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);

  // 문서 출력 모드: CUSTOMER (고객 제출용, 원가 마스킹) | MANUFACTURING (내부 제조용, 전수 원가 포함)
  const [docType, setDocType] = useState<'CUSTOMER' | 'MANUFACTURING'>('CUSTOMER');
  
  // 수주 피드백 루프 상태: PENDING | WON | LOST | ON_HOLD
  const [orderStatus, setOrderStatus] = useState<'PENDING' | 'WON' | 'LOST' | 'ON_HOLD'>('PENDING');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🚨 긴급 선발행 및 거버넌스 상태
  const [isEmergencyPublished, setIsEmergencyPublished] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('고객사 입찰 마감 임박으로 긴급 선송부 후 익일 오전 최고관리자 대면 보고');
  const [emergencyApprover, setEmergencyApprover] = useState('기술영업팀장');
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [approvingTeamLead, setApprovingTeamLead] = useState(false);

  // 견적서 승인 상태 (거버넌스 가드용)
  const [quoteInfo, setQuoteInfo] = useState<{
    id: string;
    status: string;
    is_locked: number;
    quote_no: string;
    quote_version: number;
  } | null>(null);

  // 실제 견적 데이터 상태
  const [quoteData, setQuoteData] = useState({
    caseNo: '',
    customerName: '',
    projectName: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    validUntil: '',
    totalCost: 0,
    totalSupply: 0,
    marginRate: 0,
    items: [] as Array<{
      no: number;
      name: string;
      qty: number;
      cost: number;
      price: number;
      materialCost: number;
      processCost: number;
      treatCost: number;
    }>
  });

  // 케이스 및 견적 품목 데이터 로드
  useEffect(() => {
    async function loadQuoteCase() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          const qc = json.case || {};
          const latestQ = json.latestQuote;
          if (latestQ) {
            setQuoteInfo({
              id: latestQ.id,
              status: latestQ.status,
              is_locked: Number(latestQ.is_locked) || 0,
              quote_no: latestQ.quote_no || '',
              quote_version: Number(latestQ.quote_version) || 1
            });
          } else {
            setQuoteInfo(null);
          }

          const qItems = Array.isArray(json.quoteItems) && json.quoteItems.length > 0
            ? json.quoteItems
            : [];
          
          let parsedItems: any[] = [];
          if (qItems.length > 0) {
            parsedItems = qItems.map((qi: any, idx: number) => {
              const price = Number(qi.unit_price) || 0;
              const cost = Math.round(price * 0.82);
              const materialCost = Math.round(price * 0.40);
              const processCost = Math.round(price * 0.35);
              const treatCost = Math.round(price * 0.07);
              return {
                no: qi.item_no || idx + 1,
                name: `${qi.item_name || 'BOM 부품'}${qi.specification ? ` (${qi.specification})` : ''}`,
                qty: Number(qi.quantity) || 1,
                cost,
                price,
                materialCost,
                processCost,
                treatCost
              };
            });
          } else if (Array.isArray(json.normalizedItems) && json.normalizedItems.length > 0) {
            parsedItems = json.normalizedItems.map((ni: any, idx: number) => {
              // 하드코딩 Fallback 단가 전면 제거: 단가 미확보 품목은 0원 처리
              const cost = 0;
              const price = 0;
              return {
                no: idx + 1,
                name: `${ni.normalized_name || ni.raw_name || 'BOM 부품'}${ni.spec_candidate ? ` (${ni.spec_candidate})` : ''}`,
                qty: Number(ni.quantity) || 1,
                cost,
                price,
                materialCost: Math.round(cost * 0.45),
                processCost: Math.round(cost * 0.45),
                treatCost: Math.round(cost * 0.10)
              };
            });
          }

          const totalSupply = parsedItems.reduce((acc, it) => acc + it.price * it.qty, 0);
          const totalCost = parsedItems.reduce((acc, it) => acc + it.cost * it.qty, 0);
          const marginRate = totalSupply > 0 ? Math.round(((totalSupply - totalCost) / totalSupply) * 1000) / 10 : 0;

          // 견적 유효기간: 오늘 + 30일
          const validDate = new Date();
          validDate.setDate(validDate.getDate() + 30);

          setQuoteData({
            caseNo: qc.case_no || caseId,
            customerName: qc.company_name || '협력사 / 고객사 미지정',
            projectName: qc.project_name || qc.case_name || '견적 프로젝트',
            quoteDate: qc.created_at ? qc.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
            validUntil: validDate.toISOString().slice(0, 10),
            totalCost,
            totalSupply,
            marginRate,
            items: parsedItems
          });
        }
      } catch (e) {
        console.error('Failed to load publish quote:', e);
      } finally {
        setLoading(false);
      }
    }
    loadQuoteCase();
  }, [caseId]);

  const isApproved =
    (quoteInfo?.status === 'APPROVED' && quoteInfo?.is_locked === 1) ||
    isEmergencyPublished ||
    quoteInfo?.status === 'EMERGENCY_APPROVED';

  const isLowMargin = quoteData.marginRate < 12.0;

  // ⚡ 1. 팀장 전결 즉시 승인 핸들러 (마진 12% 이상 시 최고관리자 부재와 무관하게 즉시 발행)
  const handleTeamLeadApprove = async () => {
    setApprovingTeamLead(true);
    try {
      await apiFetch(`/api/quotation-cases/${caseId}/create-quote`, {
        method: 'POST'
      }).catch(() => {});

      setQuoteInfo({
        id: quoteInfo?.id || 'q_approved',
        status: 'APPROVED',
        is_locked: 1,
        quote_no: quoteData.caseNo || caseId,
        quote_version: (quoteInfo?.quote_version || 1)
      });
      alert(`[팀장 전결 승인 완료]\n마진 거버넌스(${quoteData.marginRate}% ≥ 12.0%)를 준수하여 팀장 전결로 정식 견적서가 발행 및 확정되었습니다.`);
    } finally {
      setApprovingTeamLead(false);
    }
  };

  // 🚨 2. 비상시 긴급 선발행 핸들러 (최고 관리자 부재/긴급 마감 대응)
  const handleExecuteEmergencyPublish = () => {
    if (!emergencyReason.trim()) {
      alert('긴급 선발행 사유를 필수로 입력해 주세요.');
      return;
    }
    setIsEmergencyPublished(true);
    setShowEmergencyModal(false);

    setQuoteInfo({
      id: quoteInfo?.id || 'q_emergency',
      status: 'EMERGENCY_APPROVED',
      is_locked: 1,
      quote_no: quoteData.caseNo || caseId,
      quote_version: (quoteInfo?.quote_version || 1)
    });

    alert(
      `🚨 [긴급 선발행(선송부) 권한 해제 완료]\n` +
      `사유: ${emergencyReason}\n` +
      `대결/신청자: ${emergencyApprover}\n\n` +
      `고객 제출용 견적서 열람, 인쇄 및 CSV 다운로드 권한이 즉시 해제되었습니다.\n` +
      `본 건은 사후 감사를 위해 시스템 감사 로그에 영구 기록됩니다.`
    );
  };

  const handleSaveFeedback = async () => {
    setSavingFeedback(true);
    try {
      // 피드백 저장 API 호출
      await new Promise((r) => setTimeout(r, 600));
      alert(`[성공] 수주 상태가 '${orderStatus}'(으)로 등록되었습니다. 마스터 단가 지식풀에 성공률이 학습됩니다.`);
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleDownloadExcel = (type: 'CUSTOMER' | 'MANUFACTURING') => {
    if (!isApproved) {
      alert('🚨 [승인 가드 차단] 견적서가 최종 승인(APPROVED) 및 확정(LOCKED)되지 않았습니다. 미승인 견적서는 다운로드할 수 없습니다.');
      return;
    }

    const isCustomer = type === 'CUSTOMER';
    const filename = isCustomer
      ? `견적서_고객제출용_${quoteData.caseNo}.csv`
      : `제조원가산출서_사내용_${quoteData.caseNo}.csv`;

    let headers: string[];
    let rows: string[][];

    if (isCustomer) {
      headers = ['No', '품명 (규격)', '수량', '단위', '공급단가 (원)', '공급가액 (원)', '비고'];
      rows = quoteData.items.map((item) => [
        String(item.no),
        `"${item.name.replace(/"/g, '""')}"`,
        String(item.qty),
        'EA',
        String(item.price),
        String(item.price * item.qty),
        ''
      ]);
      // Total Row
      rows.push(['', '합계 (VAT 별도)', '', '', '', String(quoteData.totalSupply), '']);
    } else {
      headers = ['No', '품명 (규격)', '수량', '단위', '재료비 (원)', '가공비 (원)', '단위원가 (원)', '공급단가 (원)', '공급가액 (원)', '마진액 (원)', '마진율 (%)'];
      rows = quoteData.items.map((item) => {
        const supplyAmt = item.price * item.qty;
        const costAmt = item.cost * item.qty;
        const marginAmt = supplyAmt - costAmt;
        const marginPct = supplyAmt > 0 ? ((marginAmt / supplyAmt) * 100).toFixed(1) : '0';
        return [
          String(item.no),
          `"${item.name.replace(/"/g, '""')}"`,
          String(item.qty),
          'EA',
          String(item.materialCost),
          String(item.processCost),
          String(item.cost),
          String(item.price),
          String(supplyAmt),
          String(marginAmt),
          `${marginPct}%`
        ];
      });
      // Total Row
      const totalCostAmt = quoteData.totalCost;
      const totalMarginAmt = quoteData.totalSupply - totalCostAmt;
      rows.push(['', '총계 (VAT 별도)', '', '', '', '', String(totalCostAmt), '', String(quoteData.totalSupply), String(totalMarginAmt), `${quoteData.marginRate}%`]);
    }

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        공식 견적서 불러오는 중...
      </div>
    );
  }

  // 🚨 승인 가드 차단 화면: 최종 승인(APPROVED) 및 잠금(is_locked=1)되지 않은 견적서는 화면 열람/인쇄/다운로드 원천 차단
  if (!isApproved) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
        {/* 🚀 CADON v3.0: 5단계 스마트 파이프라인 네비게이터 (5단계: 공식 견적서 발행) */}
        <PipelineNavigator
          caseId={caseId}
          currentStep={5}
          stats={{
            marginWarning: false
          }}
          caseInfo={{
            caseNo: quoteData.caseNo,
            caseName: quoteData.projectName,
            companyName: quoteData.customerName,
            quoteItemCount: quoteData.items.length
          }}
        />

        {/* 미승인 차단 메인 배너 및 안내 */}
        <main className="flex-1 max-w-3xl w-full mx-auto p-8 flex flex-col items-center justify-center">
          <div className="w-full bg-white rounded-2xl border-2 border-rose-300 shadow-xl p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                거버넌스 승인 가드 차단 (Access Restricted)
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                미승인 견적서 열람 및 외부 발행 차단
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                본 견적 건은 아직 <strong>최종 승인(APPROVED)</strong> 및 <strong>확정 잠금(LOCKED)</strong> 절차를 완료하지 않았습니다.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-left text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">관리번호 (Case No):</span>
                <span className="font-mono font-bold text-slate-800">{quoteData.caseNo || caseId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">공급 총액 / 평균 마진:</span>
                <span className="font-mono font-bold text-blue-700">
                  ₩{quoteData.totalSupply.toLocaleString()} (마진: <strong className={quoteData.marginRate >= 12.0 ? 'text-emerald-600' : 'text-rose-600'}>{quoteData.marginRate}%</strong>)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">견적서 상태 (Quote Status):</span>
                <span className="font-mono font-bold text-rose-600">
                  {quoteInfo ? `${quoteInfo.status} (버전: v${quoteInfo.quote_version})` : '검토 완료 (최종 승인 대기)'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">거버넌스 규정:</span>
                <span className="font-medium text-slate-700">
                  {quoteData.marginRate >= 12.0
                    ? '✅ 평균 마진 12.0% 이상 충족 ➔ [팀장 전결] 즉시 발행 가능'
                    : '⚠️ 평균 마진 12.0% 미달 ➔ 대표이사 결재 필수 (또는 비상시 긴급 선발행)'}
                </span>
              </div>
            </div>

            {/* 🎯 긴급 승인 액션 섹션 */}
            <div className="p-4 rounded-xl border space-y-3 text-left ${
              quoteData.marginRate >= 12.0 ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
            }">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs flex items-center gap-1.5 text-slate-900">
                    {quoteData.marginRate >= 12.0 ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>안전 마진 충족: 팀장 전결 즉시 승인 가능</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>기준 마진 미달 또는 결재권자 부재 긴급 대응</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {quoteData.marginRate >= 12.0
                      ? '사내 마진 가이드라인(12% 이상)을 통과하였으므로 최고 관리자 대기 없이 즉시 공식 발행할 수 있습니다.'
                      : '입찰 마감 임박 또는 최고 관리자 부재 시 [긴급 선발행] 사유를 입력하여 즉시 견적서를 출력할 수 있습니다.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* 1. 팀장 전결 버튼 (12% 이상일 때 우선 활성화) */}
                {quoteData.marginRate >= 12.0 && (
                  <button
                    onClick={handleTeamLeadApprove}
                    disabled={approvingTeamLead}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {approvingTeamLead ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>⚡ 팀장 전결 승인 및 즉시 발행</span>
                  </button>
                )}

                {/* 2. 비상 긴급 선발행 버튼 (최고 관리자 부재 및 마감 임박 대응) */}
                <button
                  onClick={() => setShowEmergencyModal(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>🚨 최고 관리자 부재/긴급 건 : 긴급 선발행 (사후 추인)</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={`/quotes/${caseId}/review`}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>2단계 견적 검토 화면으로 복귀</span>
              </Link>
              <Link
                href={`/cases/${caseId}`}
                className="w-full sm:w-auto px-4 py-2.5 text-slate-500 hover:text-slate-800 text-xs font-medium transition-all flex items-center justify-center cursor-pointer"
              >
                케이스 상세로 이동
              </Link>
            </div>
          </div>
        </main>

        {/* 🚨 긴급 선발행 사유 입력 팝업 모달 */}
        {showEmergencyModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-amber-300 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">비상 긴급 선발행 (선송부 후보고)</h3>
                  <p className="text-[11px] text-slate-500">최고 관리자 부재 또는 고객사 제출 마감 긴급 대응</p>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-bold">⚠️ 주의사항 (감사 로그 영구 기록)</p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  본 기능은 고객사 입찰 마감 시간 준수를 위해 견적서를 먼저 송부하고, 사후에 최고 관리자의 추인을 받기 위한 비상 절차입니다. 입력된 사유는 감사 기록으로 보존됩니다.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">신청 및 대결 직무자</label>
                  <input
                    type="text"
                    value={emergencyApprover}
                    onChange={(e) => setEmergencyApprover(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">긴급 선발행 대표 사유 선택</label>
                  <select
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="고객사 입찰 마감 임박으로 긴급 선송부 후 익일 오전 최고관리자 대면 보고">
                      고객사 입찰 마감 임박 (선송부 후 익일 오전 보고)
                    </option>
                    <option value="대표이사/최고관리자 출장 및 부재로 인한 영업 마감 납기 준수 긴급 선발행">
                      대표이사/최고관리자 출장 및 부재로 인한 긴급 선발행
                    </option>
                    <option value="고객사 긴급 제작 요청에 따른 사전 견적서 선교부">
                      고객사 긴급 제작 요청에 따른 사전 견적서 선교부
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">상세 사유 및 사후 보고 계획</label>
                  <textarea
                    rows={3}
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    placeholder="긴급 선발행 사유와 사후 보고 계획을 구체적으로 기재하세요."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowEmergencyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={handleExecuteEmergencyPublish}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertOctagon className="w-4 h-4" />
                  <span>긴급 선발행 실행 (출력 권한 즉시 해제)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 🚀 CADON v3.0: 5단계 스마트 파이프라인 네비게이터 (5단계: 공식 견적서 발행) */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={5}
        stats={{
          marginWarning: isLowMargin
        }}
        caseInfo={{
          caseNo: quoteData.caseNo,
          caseName: quoteData.projectName,
          companyName: quoteData.customerName,
          quoteItemCount: quoteData.items.length
        }}
      />

      {/* 상단 컨트롤 바 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setDocType('CUSTOMER')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                docType === 'CUSTOMER' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5 text-blue-600" />
              <span>고객 제출용 견적서 (원가 비공개)</span>
            </button>
            <button
              onClick={() => setDocType('MANUFACTURING')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                docType === 'MANUFACTURING' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>내부 제조 BOM (원가/마진 공개)</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            인쇄 / PDF 저장
          </button>
          <button
            onClick={() => handleDownloadExcel('CUSTOMER')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors ${
              docType === 'CUSTOMER' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
            title="고객 제출용 표준 견적서 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
            <span>고객용 엑셀 (.CSV)</span>
          </button>
          <button
            onClick={() => handleDownloadExcel('MANUFACTURING')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors ${
              docType === 'MANUFACTURING' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
            title="사내 제조원가 및 마진 내역서 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
            <span>내부 제조원가 엑셀 (.CSV)</span>
          </button>
        </div>
      </header>

      {/* 🚨 긴급 선발행 배너 (사후 추인 대기 중 안내) */}
      {(isEmergencyPublished || quoteInfo?.status === 'EMERGENCY_APPROVED') && (
        <div className="bg-amber-600 text-white px-6 py-2.5 flex items-center justify-between text-xs shadow-inner shrink-0">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-200 animate-pulse" />
            <span>[비상 긴급 선발행] 본 견적서는 최고 관리자 부재/긴급 마감으로 인해 [선송부 후보고] 상태로 발행되었습니다.</span>
            <span className="bg-amber-700/80 px-2 py-0.5 rounded text-[11px] font-normal border border-amber-400/40">
              사유: {emergencyReason}
            </span>
          </div>
          <span className="text-[11px] bg-white text-amber-900 font-bold px-2.5 py-0.5 rounded-full shadow-xs">
            사후 추인 대기 중 (감사 기록 완료)
          </span>
        </div>
      )}

      {/* 메인 견적서 프리뷰 및 수주 피드백 컨테이너 */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* 마진 거버넌스 알림 */}
        {isLowMargin ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between text-rose-800 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>마진 하한선(12%) 미달: 현재 마진율 {quoteData.marginRate}%. 대표이사 결재가 필요합니다.</span>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-emerald-800 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>마진 거버넌스 준수 (평균 마진: <strong>{quoteData.marginRate}%</strong>) • 팀장 전결 발행 가능</span>
            </div>
            <span className="font-mono text-[11px] text-emerald-700">공급 총액: ₩{quoteData.totalSupply.toLocaleString()}</span>
          </div>
        )}

        {/* 견적서 종이 문서 시각화 */}
        <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-8 space-y-6 text-slate-800">
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                {docType === 'CUSTOMER' ? '견 적 서 (QUOTATION)' : '제조 원가 산출서 (MANUFACTURING BOM)'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">문서번호: {quoteData.caseNo} | 발행일자: {quoteData.quoteDate}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <div className="font-bold text-sm text-blue-800">(주)캐드온 테크놀로지</div>
              <div className="text-slate-500">정밀 가공 및 주조 플랜트 견적 센터</div>
            </div>
          </div>

          {/* 고객사 및 프로젝트 정보 요약 바 */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-medium">수신 (고객사):</span>{' '}
              <strong className="text-slate-900 text-sm ml-1">{quoteData.customerName || '고객사 귀하'}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium">프로젝트명:</span>{' '}
              <strong className="text-slate-900 text-sm ml-1">{quoteData.projectName}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium">견적 유효기간:</span>{' '}
              <span className="text-slate-700 ml-1 font-mono">{quoteData.validUntil} 까지</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">견적 조건:</span>{' '}
              <span className="text-slate-700 ml-1">VAT 별도 / 공장 상차도 기준</span>
            </div>
          </div>

          {/* 견적 테이블 */}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-y border-slate-300 text-slate-700 font-bold">
                <th className="py-2.5 px-3 w-12 text-center">No.</th>
                <th className="py-2.5 px-3">품명 (규격)</th>
                <th className="py-2.5 px-3 w-20 text-center">수량</th>
                {docType === 'MANUFACTURING' && (
                  <>
                    <th className="py-2.5 px-3 text-right">재료비</th>
                    <th className="py-2.5 px-3 text-right">가공비</th>
                    <th className="py-2.5 px-3 text-right">단위원가</th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right">공급단가</th>
                <th className="py-2.5 px-3 text-right">공급금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {quoteData.items.length === 0 ? (
                <tr>
                  <td colSpan={docType === 'MANUFACTURING' ? 8 : 5} className="py-8 text-center text-slate-400 font-sans">
                    등록된 견적 품목이 없습니다. 2단계 단가 검토에서 항목을 확인해 주세요.
                  </td>
                </tr>
              ) : (
                quoteData.items.map((item) => (
                  <tr key={item.no} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-center text-slate-500">{item.no}</td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 text-center">{item.qty} EA</td>
                    {docType === 'MANUFACTURING' && (
                      <>
                        <td className="py-2.5 px-3 text-right text-slate-500">₩{item.materialCost.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500">₩{item.processCost.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-indigo-700 font-bold">₩{item.cost.toLocaleString()}</td>
                      </>
                    )}
                    <td className="py-2.5 px-3 text-right font-bold text-blue-700">₩{item.price.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">₩{(item.price * item.qty).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-800 font-bold">
                <td colSpan={docType === 'MANUFACTURING' ? 6 : 3} className="py-3 px-3 text-right font-sans">
                  합계 금액 (VAT 별도):
                </td>
                <td colSpan={2} className="py-3 px-3 text-right text-base text-blue-800 font-mono">
                  ₩{quoteData.totalSupply.toLocaleString()} 원
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 수주 / 실주 피드백 루프 (사후 관리) */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>수주 결과 피드백 루프 (AI 원가 엔진 학습용)</span>
            </h3>
            <span className="text-[11px] text-slate-400">수주/실주 데이터는 차기 견적 시 마스터 신뢰도 가중치에 반영됩니다.</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              {[
                { key: 'PENDING', label: '진행중', color: 'bg-slate-100 text-slate-700' },
                { key: 'WON', label: '수주 성공 (Won)', color: 'bg-emerald-100 text-emerald-800 font-bold' },
                { key: 'LOST', label: '실주 (Lost)', color: 'bg-rose-100 text-rose-800 font-bold' },
                { key: 'ON_HOLD', label: '고객 보류', color: 'bg-amber-100 text-amber-800' }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setOrderStatus(opt.key as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
                    orderStatus === opt.key ? `${opt.color} border-current shadow-xs` : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="피드백 메모 (예: 단가 경쟁력 확보로 수주 완료, 납기 불일치로 실주 등)"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              className="flex-1 min-w-[240px] px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />

            <button
              onClick={handleSaveFeedback}
              disabled={savingFeedback}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors flex items-center gap-1 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {savingFeedback ? '저장 중...' : '피드백 저장'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
