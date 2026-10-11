'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  History, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Building2, 
  FileText, 
  User, 
  Edit3, 
  Check, 
  RefreshCw,
  ExternalLink,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface LearnedPriceHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    item_name: string;
    standard_name?: string | null;
    specification?: string | null;
    material?: string | null;
    unit_price: number;
    approval_count?: number;
    company_name?: string | null;
    company_id?: string | null;
    source?: string | null;
    created_at?: string;
  } | null;
  onPriceUpdated?: () => void;
}

interface HistoryRecord {
  id: string;
  pool_id: string;
  revision_seq: number;
  unit_price: number;
  previous_price: number | null;
  price_diff: number | null;
  change_type: string;
  quotation_case_id: string | null;
  company_id: string | null;
  company_name: string | null;
  remark: string | null;
  created_by_user_id: string | null;
  user_name?: string | null;
  created_at: string;
}

export default function LearnedPriceHistoryDrawer({
  isOpen,
  onClose,
  item,
  onPriceUpdated
}: LearnedPriceHistoryDrawerProps) {
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [newPrice, setNewPrice] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchHistory = useCallback(async (poolId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/manual-prices?mode=HISTORY&id=${encodeURIComponent(poolId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.list && Array.isArray(data.list)) {
          setHistoryList(data.list);
        }
      }
    } catch (err) {
      console.warn('단가 이력 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && item?.id) {
      fetchHistory(item.id);
      setIsAdjusting(false);
      setNewPrice(item.unit_price ? String(item.unit_price) : '');
      setAdjustReason('');
      setSaveSuccess(false);
    } else {
      setHistoryList([]);
    }
  }, [isOpen, item?.id, fetchHistory, item?.unit_price]);

  if (!isOpen || !item) return null;

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(newPrice.replace(/,/g, ''));
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('유효한 단가를 입력해 주세요.');
      return;
    }

    setSavingAdjust(true);
    try {
      const res = await apiFetch('/api/manual-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: item.id,
          unit_price: priceNum,
          remark: adjustReason.trim() || '관리자 수기 단가 조정',
          specification: item.specification,
          material: item.material,
          standard_name: item.standard_name
        })
      });

      if (res.ok) {
        setSaveSuccess(true);
        setIsAdjusting(false);
        setAdjustReason('');
        await fetchHistory(item.id);
        if (onPriceUpdated) onPriceUpdated();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const errData = await res.json();
        alert(errData.error || '단가 수정 저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('단가 수정 오류:', err);
      alert('저장 중 네트워크 오류가 발생했습니다.');
    } finally {
      setSavingAdjust(false);
    }
  };

  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `₩${Math.round(val).toLocaleString()}`;
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end transition-opacity animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Slide-over Drawer Container */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10 border-l border-slate-200 animate-in slide-in-from-right duration-300">
        
        {/* 1. Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-purple-100 text-purple-700 rounded-lg shadow-xs">
              <History className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-black text-slate-900 leading-tight">
                단가 수정 및 승인 이력 타임라인
              </h2>
              <p className="text-[12.5px] text-slate-500 font-medium mt-0.5">
                실무 적용 단가의 시계열 변천사와 승인 근거를 추적합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Target Item Summary Card (고정) */}
        <div className="p-4 bg-purple-50/50 border-b border-purple-100 shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-[15px] font-black text-slate-900">
                  {item.item_name}
                </span>
                {item.standard_name && item.standard_name !== item.item_name && (
                  <span className="text-[12px] font-bold text-purple-700 bg-purple-100/80 px-1.5 py-0.5 rounded border border-purple-200">
                    표준: {item.standard_name}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-[13px] text-slate-600 font-mono">
                <span>규격: {item.specification || '-'}</span>
                <span>•</span>
                <span>재질: {item.material || 'SS400'}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">현재 적용 단가</div>
              <div className="text-lg font-black font-mono text-purple-900 tabular-nums">
                {formatPrice(item.unit_price)}
              </div>
              <div className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[11px] font-bold mt-0.5">
                <Check className="w-3 h-3 text-purple-600" />
                <span>누적 {item.approval_count || 1}회 승인</span>
              </div>
            </div>
          </div>
        </div>

        {/* Success Alert Banner */}
        {saveSuccess && (
          <div className="mx-4 mt-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-bold flex items-center space-x-2 shadow-xs animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>새로운 단가와 수정 사유가 이력 대장에 안전하게 기록되었습니다.</span>
          </div>
        )}

        {/* 3. Timeline Body (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[13px] font-bold text-slate-700 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>시계열 변천사 ({historyList.length}건)</span>
            </span>

            <button
              type="button"
              onClick={() => fetchHistory(item.id)}
              disabled={loading}
              className="text-xs text-slate-500 hover:text-purple-700 flex items-center space-x-1 cursor-pointer disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600" />
              <p className="text-xs font-medium">단가 변경 이력을 불러오는 중입니다...</p>
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">등록된 변경 이력이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">도면 검수 승인 또는 수기 단가 입력 시 자동으로 누적됩니다.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {historyList.map((hist, idx) => {
                const isLatest = idx === 0;
                const isInitial = hist.change_type === 'INITIAL' || hist.revision_seq === 1;
                const diff = hist.price_diff ?? 0;
                const isUp = diff > 0;
                const isDown = diff < 0;

                const percentDiff = hist.previous_price && hist.previous_price > 0 && diff !== 0
                  ? ((Math.abs(diff) / hist.previous_price) * 100).toFixed(1)
                  : null;

                return (
                  <div key={hist.id} className="relative group">
                    {/* Node Dot on Timeline */}
                    <div className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                      isLatest 
                        ? 'bg-purple-600 border-white ring-4 ring-purple-100 shadow-xs' 
                        : isInitial
                        ? 'bg-slate-400 border-white ring-2 ring-slate-100'
                        : 'bg-indigo-500 border-white ring-2 ring-indigo-100'
                    }`}>
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>

                    {/* History Card */}
                    <div className={`p-3.5 rounded-xl border transition-all ${
                      isLatest 
                        ? 'bg-white border-purple-200 shadow-sm ring-1 ring-purple-100' 
                        : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                    }`}>
                      
                      {/* Top Header of Card */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-black ${
                            isLatest
                              ? 'bg-purple-600 text-white'
                              : isInitial
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {hist.revision_seq}차 {isLatest ? '(최신)' : isInitial ? '(최초)' : ''}
                          </span>

                          <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                            hist.change_type === 'MANUAL_EDIT'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : hist.change_type === 'RE_APPROVAL'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {hist.change_type === 'MANUAL_EDIT' ? '수기 직접 조정' : hist.change_type === 'RE_APPROVAL' ? '견적 재승인 갱신' : '신규 자동 학습'}
                          </span>

                          {/* 👤 견적 담당자 뱃지 */}
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200/80 text-[10.5px] font-bold" title="해당 단가를 입력/승인한 견적 담당자">
                            <User className="w-2.5 h-2.5 text-purple-600" />
                            <span>{hist.user_name || (hist.created_by_user_id === 'usr_admin' ? '최고관리자' : '견적담당자')}</span>
                          </span>
                        </div>

                        <span className="text-[11.5px] font-mono text-slate-400 shrink-0">
                          {formatDate(hist.created_at)}
                        </span>
                      </div>

                      {/* Price & Delta Row */}
                      <div className="flex items-baseline justify-between py-1 border-y border-slate-100 my-2">
                        <div className="flex items-baseline space-x-2">
                          <span className="text-[16.5px] font-black font-mono text-slate-900 tabular-nums">
                            {formatPrice(hist.unit_price)}
                          </span>

                          {hist.previous_price && hist.previous_price !== hist.unit_price && (
                            <span className="text-xs font-mono text-slate-400 line-through">
                              {formatPrice(hist.previous_price)}
                            </span>
                          )}
                        </div>

                        {/* Delta Badge */}
                        {!isInitial && diff !== 0 ? (
                          <span className={`inline-flex items-center space-x-0.5 text-xs font-bold px-2 py-0.5 rounded-full border ${
                            isUp 
                              ? 'bg-rose-50 text-rose-700 border-rose-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {isUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                            <span>{isUp ? '+' : ''}{diff.toLocaleString()}원</span>
                            {percentDiff && <span className="text-[10px] opacity-80">({isUp ? '▲' : '▼'}{percentDiff}%)</span>}
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            <Minus className="w-3 h-3 mr-0.5" />
                            <span>변동 없음</span>
                          </span>
                        )}
                      </div>

                      {/* Metadata Row: Company & Estimator & Quotation Case & Remark */}
                      <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                        <div className="flex items-center justify-between text-[12px] flex-wrap gap-1">
                          <span className="flex items-center space-x-1 font-medium text-slate-700">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>고객사: <strong className="font-semibold text-slate-800">{hist.company_name || '사내 표준/기본'}</strong></span>
                          </span>

                          <span className="flex items-center space-x-1 text-[11.5px] text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200">
                            <User className="w-3 h-3 text-purple-600" />
                            <span>견적 담당자: <strong className="text-slate-900 font-bold">{hist.user_name || (hist.created_by_user_id === 'usr_admin' ? '최고관리자' : '견적담당자')}</strong></span>
                          </span>
                        </div>

                        {hist.quotation_case_id && (
                          <div className="flex items-center justify-between text-[11.5px] pt-0.5">
                            <span className="text-slate-400 font-mono text-[11px]">
                              프로젝트 번호: {hist.quotation_case_id}
                            </span>
                            <a
                              href={`/cases/${hist.quotation_case_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11.5px] font-mono text-purple-600 hover:text-purple-800 flex items-center space-x-0.5 group"
                              title="해당 견적 건으로 이동"
                            >
                              <FileText className="w-3 h-3 text-slate-400 group-hover:text-purple-600" />
                              <span className="underline underline-offset-2">견적 건 바로가기</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}

                        {hist.remark && (
                          <div className="bg-white/80 p-2 rounded border border-slate-200/60 text-[11.5px] text-slate-600 font-medium">
                            💬 {hist.remark}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Footer: Quick Adjustment Drawer Panel (수기 직접 수정) */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
          {!isAdjusting ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                단가 변동이나 사유 수정이 필요하신가요?
              </div>
              <button
                type="button"
                onClick={() => setIsAdjusting(true)}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>단가 수기 조정 및 사유 등록</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveAdjustment} className="space-y-3 bg-white p-3.5 rounded-xl border border-purple-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>단가 수정 및 신규 이력 추가</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdjusting(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  취소
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    변경할 단가 (원) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="예: 42000"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    수정 사유 / 비고
                  </label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="예: 원자재 시세 상승분 반영"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdjusting(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer font-bold"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={savingAdjust}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  {savingAdjust ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>단가 수정 저장</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
