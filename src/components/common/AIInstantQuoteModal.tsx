'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  Zap,
  UploadCloud,
  FileCode2,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  ArrowRight,
  Loader2,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Layers
} from 'lucide-react';
import CustomerSelectCombobox, { CustomerSelectionValue, AUTO_DETECT_CUSTOMER } from '@/components/common/CustomerSelectCombobox';

interface AIInstantQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (caseId: string) => void;
}

interface QuickQuoteResult {
  caseId: string;
  caseNo: string;
  caseName: string;
  companyName: string;
  quoteId: string;
  totalAmount: number;
  drawingsCount: number;
  bomCount: number;
  matchedRate: number;
  items: Array<{
    item_no: number;
    drawing_no: string;
    part_name: string;
    material: string;
    quantity: number;
    unit_price: number;
    amount: number;
    remark?: string;
  }>;
}

export default function AIInstantQuoteModal({
  isOpen,
  onClose,
  onSuccess
}: AIInstantQuoteModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [customer, setCustomer] = useState<CustomerSelectionValue>(AUTO_DETECT_CUSTOMER);
  const [companies, setCompanies] = useState<any[]>([]);
  const [customCaseName, setCustomCaseName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      apiFetch('/api/companies')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.companies) {
            setCompanies(data.companies);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(1);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<QuickQuoteResult | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const resetState = () => {
    setFile(null);
    setCustomer(AUTO_DETECT_CUSTOMER);
    setCustomCaseName('');
    setIsProcessing(false);
    setProcessStep(1);
    setProgressPercent(0);
    setErrorMessage('');
    setResult(null);
  };

  const handleClose = () => {
    if (isProcessing) return;
    resetState();
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    const ext = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();
    if (!['.dwg', '.dxf'].includes(ext)) {
      setErrorMessage('CAD 도면 파일(.dwg 또는 .dxf)만 업로드 가능합니다.');
      return;
    }
    setFile(selectedFile);
    setErrorMessage('');
    if (!customCaseName) {
      const clean = selectedFile.name.replace(/\.[^/.]+$/, '');
      setCustomCaseName(`[${clean}] AI 즉시 견적`);
    }
  };

  const handleStartInstantQuote = async () => {
    if (!file) {
      setErrorMessage('분석할 CAD 도면 파일을 선택해주세요.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setProcessStep(1);
    setProgressPercent(10);

    let currentProgress = 10;
    const progressTimer = setInterval(() => {
      setProgressPercent((prev) => {
        let next = prev;
        if (prev < 25) {
          next = prev + 5;
          setProcessStep(1);
        } else if (prev < 55) {
          next = prev + 3;
          setProcessStep(2);
        } else if (prev < 82) {
          next = prev + 2;
          setProcessStep(3);
        } else if (prev < 95) {
          next = prev + 1;
          setProcessStep(4);
        }
        currentProgress = next;
        return next;
      });
    }, 400);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (customer?.companyId && customer.companyId !== 'comp_unassigned') {
        formData.append('companyId', customer.companyId);
      }
      if (customCaseName.trim()) {
        formData.append('caseName', customCaseName.trim());
      }

      const res = await fetch('/api/quotation-cases/quick-estimate', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressTimer);

      if (res.status === 401) {
        alert('로그인이 필요합니다.');
        window.location.href = '/login';
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI 즉시 견적 생성에 실패했습니다.');
      }

      // 성공 시 100% 도달 애니메이션 후 결과 표시
      setProcessStep(4);
      setProgressPercent(100);
      setTimeout(() => {
        setResult(data);
        if (onSuccess) onSuccess(data.caseId);
      }, 450);
    } catch (err: any) {
      clearInterval(progressTimer);
      setErrorMessage(err.message || '처리 중 오류가 발생했습니다.');
      setIsProcessing(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!result?.quoteId) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/quotes/${result.quoteId}/export-excel`);
      if (!res.ok) throw new Error('엑셀 견적서 다운로드 실패');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `견적서_${result.caseNo || result.caseId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || '엑셀 다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 shadow-xs">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold tracking-tight">AI 즉시 견적 (Instant AI Quote)</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E9E9E9] text-slate-800 border border-slate-300 shadow-2xs">
                  원스톱 10초 완성
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                도면만 올리면 AI가 도번·BOM 추출부터 사내 실적 단가 매칭까지 초안 견적서를 즉시 산출합니다.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && !result && (
            <div className="py-8 px-4 text-center space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="w-20 h-20 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-amber-500 animate-bounce" />
                </div>
              </div>

              <div>
                <h3 className="text-base font-black text-slate-900">AI가 견적서를 자동 산출하고 있습니다</h3>
                <p className="text-xs text-slate-500 mt-1">도면 분석, BOM 전개, 실적 단가 매칭을 동시에 수행합니다.</p>
              </div>

              {/* Step indicator */}
              <div className="max-w-md mx-auto space-y-2 text-left bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs shadow-2xs">
                <div className={`flex items-center space-x-2.5 ${processStep >= 1 ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                  {processStep > 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                  <span>1단계: 신규 견적 프로젝트 생성 및 도면 무결성 검증</span>
                </div>
                <div className={`flex items-center space-x-2.5 ${processStep >= 2 ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                  {processStep > 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : processStep === 2 ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <div className="w-4 h-4" />}
                  <span>2단계: CAD 도면 AI 파싱 및 표제란·BOM 품목 자동 검출</span>
                </div>
                <div className={`flex items-center space-x-2.5 ${processStep >= 3 ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                  {processStep > 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : processStep === 3 ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <div className="w-4 h-4" />}
                  <span>3단계: 사내 실적 단가 풀(Self-Learning) & 재질별 표준 단가 자동 매칭</span>
                </div>
                <div className={`flex items-center space-x-2.5 ${processStep >= 4 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                  {processStep >= 4 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <div className="w-4 h-4" />}
                  <span>4단계: 초안 견적서(Quotes & Items) 즉시 발행 및 스냅샷 확정</span>
                </div>
              </div>

              {/* 💡 4단계 진행 막대 그래프 (Progress Bar & Segment Gauge) */}
              <div className="max-w-md mx-auto space-y-2 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 p-3.5 rounded-lg border border-indigo-200/80 shadow-xs">
                {/* 진행 상태 헤더 & 퍼센트 */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 font-extrabold text-indigo-900">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                    <span>
                      {processStep === 1 && '1/4단계: 프로젝트 생성 및 도면 검증 중'}
                      {processStep === 2 && '2/4단계: CAD AI 도면 및 표제란·BOM 파싱 중'}
                      {processStep === 3 && '3/4단계: 사내 실적 단가 풀 매칭 및 원가 계산 중'}
                      {processStep >= 4 && '4/4단계: 초안 견적서 발행 및 스냅샷 확정 중'}
                    </span>
                  </div>
                  <span className="font-mono font-black text-indigo-700 text-sm tracking-tight">
                    {progressPercent}%
                  </span>
                </div>

                {/* 1. 상단 일체형 유연한 진행 막대 */}
                <div className="w-full bg-slate-200/90 rounded-full h-2.5 overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-500 transition-all duration-300 ease-out shadow-xs"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* 2. 하단 4분할 세그먼트 막대 블록 */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[
                    { step: 1, label: '1. 도면검증', short: '도면 검증' },
                    { step: 2, label: '2. BOM추출', short: 'BOM 파싱' },
                    { step: 3, label: '3. 단가매칭', short: '단가 매칭' },
                    { step: 4, label: '4. 견적발행', short: '견적 산출' }
                  ].map((s) => {
                    const isDone = processStep > s.step || progressPercent >= s.step * 25;
                    const isCurrent = processStep === s.step && progressPercent < 100;
                    return (
                      <div key={s.step} className="space-y-1 text-center">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isDone
                              ? 'bg-emerald-500'
                              : isCurrent
                              ? 'bg-indigo-600 animate-pulse'
                              : 'bg-slate-200'
                          }`}
                        />
                        <span
                          className={`text-[10px] font-bold block whitespace-nowrap ${
                            isDone
                              ? 'text-emerald-700'
                              : isCurrent
                              ? 'text-indigo-800 font-black'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Result State */}
          {result && (
            <div className="space-y-5 animate-in fade-in">
              {/* Price Banner */}
              <div className="p-5 rounded-lg bg-gradient-to-br from-emerald-50 via-emerald-100/60 to-teal-50 border border-emerald-300 text-center space-y-1.5 shadow-xs">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>AI 즉시 견적 산출 완료 (초안)</span>
                </div>
                <div className="text-xs text-slate-600 font-medium">
                  {result.caseName} ({result.companyName})
                </div>
                <div className="text-3xl font-black font-mono text-emerald-700 tracking-tight">
                  ₩ {result.totalAmount.toLocaleString()}
                  <span className="text-sm font-semibold text-emerald-900 ml-1">원 (VAT 별도)</span>
                </div>
              </div>

              {/* 3 Metrics */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-500">분석 도면</div>
                  <div className="text-base font-black text-slate-900 mt-0.5">{result.drawingsCount}장</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-500">BOM 가공품</div>
                  <div className="text-base font-black text-blue-700 mt-0.5">{result.bomCount}개</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-500">실적 단가 매칭률</div>
                  <div className="text-base font-black text-purple-700 mt-0.5">{result.matchedRate}%</div>
                </div>
              </div>

              {/* Items Preview */}
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                <div className="px-3.5 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>산출 품목 미리보기 (상위 {result.items?.length || 0}건)</span>
                  <span className="text-[11px] text-slate-500">관리번호: {result.caseNo}</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {result.items?.map((it, idx) => (
                    <div key={idx} className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-slate-900 truncate">{it.part_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {it.drawing_no} | {it.material} | 수량: {it.quantity}EA
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-slate-900">₩{it.amount.toLocaleString()}</div>
                        <div className="text-[10px] text-emerald-600 font-medium">{it.remark}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  disabled={isDownloading}
                  className="w-full sm:flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  <span>즉시 엑셀 견적서 다운로드</span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/cases/${result.caseId}`)}
                  className="w-full sm:flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
                >
                  <span>정밀 워크벤치에서 세부 검토</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Form State (Initial) */}
          {!isProcessing && !result && (
            <div className="space-y-4">
              {/* Drag & Drop Target */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileSelect(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`py-8 px-4 rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center text-center space-y-3 cursor-pointer ${
                  isDragging
                    ? 'border-indigo-600 bg-indigo-50/80 scale-[1.01]'
                    : file
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/30'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".dwg,.dxf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className={`w-14 h-14 rounded-lg flex items-center justify-center shadow-xs ${
                  file ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                }`}>
                  {file ? <FileCode2 className="w-7 h-7" /> : <UploadCloud className="w-7 h-7" />}
                </div>

                <div>
                  {file ? (
                    <>
                      <p className="text-sm font-black text-emerald-800">{file.name}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • 클릭하여 다른 도면으로 변경
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-extrabold text-slate-800">
                        CAD 도면 파일을 여기에 끌어다 놓으세요
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        또는 <span className="text-indigo-600 font-bold underline">내 컴퓨터에서 파일 선택</span> (.dwg, .dxf)
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  고객사 선택 (선택 사항)
                </label>
                <CustomerSelectCombobox
                  companies={companies}
                  value={customer}
                  onChange={(val) => setCustomer(val)}
                  placeholder="고객사를 선택하거나 자동 감지(기본)"
                />
              </div>

              {/* Case Name Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  견적 프로젝트 건명
                </label>
                <input
                  type="text"
                  value={customCaseName}
                  onChange={(e) => setCustomCaseName(e.target.value)}
                  placeholder="도면 업로드 시 파일명 기반으로 자동 생성됩니다."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleStartInstantQuote}
                  disabled={!file}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>10초 AI 즉시 견적 산출 시작</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
