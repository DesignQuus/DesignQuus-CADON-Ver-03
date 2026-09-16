'use client';

import React, { useState, use } from 'react';
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
  Send 
} from 'lucide-react';
import PipelineNavigator from '@/components/common/PipelineNavigator';

export default function QuotePublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);

  // 문서 출력 모드: CUSTOMER (고객 제출용, 원가 마스킹) | MANUFACTURING (내부 제조용, 전수 원가 포함)
  const [docType, setDocType] = useState<'CUSTOMER' | 'MANUFACTURING'>('CUSTOMER');
  
  // 수주 피드백 루프 상태: PENDING | WON | LOST | ON_HOLD
  const [orderStatus, setOrderStatus] = useState<'PENDING' | 'WON' | 'LOST' | 'ON_HOLD'>('PENDING');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  // 모의 견적 요약 데이터 (스토리보드 시나리오)
  const quoteData = {
    caseNo: 'Q-2026-0316-01',
    customerName: '대한플랜트(주)',
    projectName: '보령 화력 3호기 밸브 개보수',
    quoteDate: '2026-03-16',
    validUntil: '2026-04-15',
    totalCost: 1845000,
    totalSupply: 2150000,
    marginRate: 14.2, // 12% 이상 통과
    items: [
      { no: 1, name: 'VALVE BODY (SCS13)', qty: 20, cost: 41200, price: 48000, materialCost: 20000, processCost: 18000, treatCost: 3200 },
      { no: 2, name: 'BONNET (SCS13)', qty: 20, cost: 18800, price: 22000, materialCost: 9000, processCost: 8200, treatCost: 1600 },
      { no: 3, name: 'STEM SHAFT (SUS316)', qty: 20, cost: 32250, price: 37500, materialCost: 15000, processCost: 14500, treatCost: 2750 }
    ]
  };

  const isLowMargin = quoteData.marginRate < 12.0;

  const handleSaveFeedback = async () => {
    setSavingFeedback(true);
    try {
      // 피드백 저장 API 모의 호출
      await new Promise((r) => setTimeout(r, 600));
      alert(`[성공] 수주 상태가 '${orderStatus}'(으)로 등록되었습니다. 마스터 단가 지식풀에 성공률이 학습됩니다.`);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 🚀 CADON v2.0 3단계 파이프라인 네비게이터 */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={3}
        stats={{
          marginWarning: isLowMargin
        }}
      />

      {/* 상단 컨트롤 바 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setDocType('CUSTOMER')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                docType === 'CUSTOMER' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5 text-blue-600" />
              <span>고객 제출용 견적서 (원가 비공개)</span>
            </button>
            <button
              onClick={() => setDocType('MANUFACTURING')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
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
            className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            인쇄 / PDF 저장
          </button>
          <button
            onClick={() => alert('엑셀 표준 견적서(.XLSX) 다운로드가 완료되었습니다.')}
            className="px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            엑셀 내보내기
          </button>
        </div>
      </header>

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
              {quoteData.items.map((item) => (
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
              ))}
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
