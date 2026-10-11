'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ExternalLink,
  DollarSign,
  Layers,
  ArrowRight,
  User,
  Clock,
  Sparkles,
  Info,
  ShieldCheck
} from 'lucide-react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';

export interface PriceAdjustmentItem {
  id: string;
  item_no: number;
  item_name: string;
  master_code: string;
  specification: string;
  material: string;
  quantity: number;
  unit: string;
  before_unit_price: number;
  after_unit_price: number;
  diff_unit_price: number;
  diff_rate: number;
  total_diff_amount: number;
  after_amount: number;
  price_source: string;
  price_source_label: string;
  remark: string;
  modified_by: string;
  modified_at: string;
}

interface PriceAdjustmentModalProps {
  quoteId: string;
  quoteNo: string;
  caseName: string;
  caseNo: string;
  quotationCaseId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PriceAdjustmentModal({
  quoteId,
  quoteNo,
  caseName,
  caseNo,
  quotationCaseId,
  isOpen,
  onClose
}: PriceAdjustmentModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    quote: any;
    summary: {
      total_items_count: number;
      master_match_count?: number;
      modified_count: number;
      original_subtotal: number;
      modified_subtotal: number;
      net_diff_amount: number;
      increased_count: number;
      decreased_count: number;
    };
    adjustments: PriceAdjustmentItem[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MASTER' | 'MANUAL' | 'INCREASED' | 'DECREASED'>('ALL');

  useEffect(() => {
    if (!isOpen || !quoteId) return;

    let isMounted = true;
    setLoading(true);
    setError('');

    fetch(`/api/quotes/${quoteId}/price-adjustments`)
      .then((res) => {
        if (!res.ok) throw new Error('단가 변동 내역을 불러오지 못했습니다.');
        return res.json();
      })
      .then((result) => {
        if (isMounted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || '데이터 통신 오류');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, quoteId]);

  // 필터링 및 검색 적용
  const filteredAdjustments = useMemo(() => {
    if (!data?.adjustments) return [];
    return data.adjustments.filter((item) => {
      // 1. 단가 출처 / 변동 방향 필터
      if (filterType === 'MASTER' && item.price_source !== 'MASTER_MATCH') return false;
      if (filterType === 'MANUAL' && (item.price_source === 'MASTER_MATCH' || item.diff_unit_price === 0)) return false;
      if (filterType === 'INCREASED' && item.diff_unit_price <= 0) return false;
      if (filterType === 'DECREASED' && item.diff_unit_price >= 0) return false;

      // 2. 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.item_name?.toLowerCase().includes(q);
        const matchCode = item.master_code?.toLowerCase().includes(q);
        const matchRemark = item.remark?.toLowerCase().includes(q);
        const matchModifier = item.modified_by?.toLowerCase().includes(q);
        const matchMaterial = item.material?.toLowerCase().includes(q);
        return matchName || matchCode || matchRemark || matchModifier || matchMaterial;
      }

      return true;
    });
  }, [data, filterType, searchQuery]);

  if (!isOpen) return null;

  const targetCaseId = data?.quote?.quotation_case_id || quotationCaseId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 shadow-2xs">
              <ShieldCheck className="w-5 h-5 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  품목별 단가 출처 및 변동 내역서
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                  {quoteNo}
                </span>
                <span className="text-xs text-slate-400 font-mono">({caseNo})</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                원가 기준 관리 센터(표준 품목 및 단가 대장)의 사내 기준단가 연동 내역과 수기 직접 조정 내역을 종합 확인합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {targetCaseId && (
              <Link
                href={`/quotes/${targetCaseId}/review?filter=modified`}
                className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center space-x-1.5 shadow-2xs"
                title="3분할 단가검토 워크스페이스에서 해당 품목 수정/확인"
              >
                <span>단가검토 바로가기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="닫기 (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 상단 4대 KPI 요약 카드 */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          {/* KPI 1. 사내 기준단가 연동 */}
          <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                사내 기준단가 연동
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5 font-mono">
                <span className="text-xl font-black text-blue-900">
                  {data?.summary?.master_match_count ?? 0}
                </span>
                <span className="text-xs text-blue-600 font-medium font-sans">
                  / 전체 {data?.summary?.total_items_count ?? 0}품목
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          {/* KPI 2. 수기 단가 조정 */}
          <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                담당자 수기 조정
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5 font-mono">
                <span className="text-xl font-black text-amber-900">
                  {data?.summary?.modified_count ?? 0}
                </span>
                <span className="text-xs text-amber-600 font-medium font-sans">
                  / 전체 {data?.summary?.total_items_count ?? 0}품목
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          {/* KPI 3. 순 변동 총액 (Net Difference) */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                공급가액 변동 영향
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5 font-mono">
                <span
                  className={`text-xl font-black ${
                    (data?.summary?.net_diff_amount ?? 0) > 0
                      ? 'text-rose-600'
                      : (data?.summary?.net_diff_amount ?? 0) < 0
                      ? 'text-blue-600'
                      : 'text-slate-700'
                  }`}
                >
                  {(data?.summary?.net_diff_amount ?? 0) > 0 ? '+' : ''}
                  ₩{Number(data?.summary?.net_diff_amount ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                (data?.summary?.net_diff_amount ?? 0) > 0
                  ? 'bg-rose-100 text-rose-700'
                  : (data?.summary?.net_diff_amount ?? 0) < 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {(data?.summary?.net_diff_amount ?? 0) > 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (data?.summary?.net_diff_amount ?? 0) < 0 ? (
                <TrendingDown className="w-4 h-4" />
              ) : (
                <Minus className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* KPI 4. 단가 변동 분포 */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                단가 변동 분포
              </span>
              <div className="flex items-center space-x-3 mt-1 text-xs font-bold font-mono">
                <span className="text-rose-600 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> +{data?.summary?.increased_count ?? 0}건
                </span>
                <span className="text-blue-600 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> -{data?.summary?.decreased_count ?? 0}건
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 검색 및 필터 툴바 */}
        <div className="px-6 py-2.5 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              전체 ({data?.summary?.total_items_count ?? 0})
            </button>
            <button
              onClick={() => setFilterType('MASTER')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                filterType === 'MASTER'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>사내 기준 연동 ({data?.summary?.master_match_count ?? 0})</span>
            </button>
            <button
              onClick={() => setFilterType('MANUAL')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                filterType === 'MANUAL'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>수기 직접 조정 ({data?.summary?.modified_count ?? 0})</span>
            </button>
            {(data?.summary?.increased_count ?? 0) > 0 && (
              <button
                onClick={() => setFilterType('INCREASED')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                  filterType === 'INCREASED'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                <span>인상 ({data?.summary?.increased_count ?? 0})</span>
              </button>
            )}
            {(data?.summary?.decreased_count ?? 0) > 0 && (
              <button
                onClick={() => setFilterType('DECREASED')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                  filterType === 'DECREASED'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                <span>인하 ({data?.summary?.decreased_count ?? 0})</span>
              </button>
            )}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="품번, 품명, 비고, 담당자 검색..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 테이블 본문 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium text-slate-500">단가 연동 및 수정 품목 이력을 분석 중입니다...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600 text-xs font-bold">
              {error}
            </div>
          ) : filteredAdjustments.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              {searchQuery || filterType !== 'ALL'
                ? '조건에 일치하는 품목이 없습니다.'
                : '이 견적건의 품목 내역이 없습니다.'}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10 backdrop-blur-xs select-none">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12 font-mono">No.</th>
                  <th className="py-2.5 px-3 text-center w-28">출처/유형</th>
                  <th className="py-2.5 px-3 w-40">품번(도번)</th>
                  <th className="py-2.5 px-4 min-w-[150px]">품명</th>
                  <th className="py-2.5 px-3 w-28">재질 / 규격</th>
                  <th className="py-2.5 px-3 text-center w-16">수량</th>
                  <th className="py-2.5 px-3 text-right w-28">기준/산출단가</th>
                  <th className="py-2.5 px-3 text-right w-28">확정단가</th>
                  <th className="py-2.5 px-3 text-center w-28">변동액 (변동률)</th>
                  <th className="py-2.5 px-3 text-right w-32 font-bold">총 공급가액</th>
                  <th className="py-2.5 px-3 w-44">출처 / 사유 / 비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdjustments.map((item, idx) => {
                  const isMaster = item.price_source === 'MASTER_MATCH';
                  const isUp = item.diff_unit_price > 0;
                  const isDown = item.diff_unit_price < 0;
                  const hasDiff = item.diff_unit_price !== 0;

                  return (
                    <tr
                      key={item.id || idx}
                      className={`transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      } ${
                        isMaster
                          ? 'hover:bg-blue-50/40'
                          : hasDiff
                          ? 'hover:bg-amber-50/40'
                          : 'hover:bg-slate-100/60'
                      }`}
                    >
                      {/* 글로벌 순번 표준 준수 */}
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-500 text-[13px]">
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* 단가 출처 뱃지 */}
                      <td className="py-2 px-3 text-center">
                        {isMaster ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            <span>사내 기준</span>
                          </span>
                        ) : hasDiff ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            <span>수기 조정</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>AI 산출</span>
                          </span>
                        )}
                      </td>

                      {/* 도번 / 품번 */}
                      <td className="py-2 px-3">
                        <SmartTruncateTooltip
                          text={item.master_code || '-'}
                          className="font-mono font-bold text-slate-900 text-xs block"
                          maxWidthClass="max-w-[140px]"
                        />
                      </td>

                      {/* 품명 */}
                      <td className="py-2 px-4">
                        <SmartTruncateTooltip
                          text={item.item_name}
                          className="font-semibold text-slate-800 text-xs block"
                          maxWidthClass="max-w-[180px]"
                        />
                      </td>

                      {/* 재질 / 규격 */}
                      <td className="py-2 px-3 text-slate-600">
                        <div className="font-semibold text-[11.5px] text-slate-700">{item.material || '-'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.specification || '-'}</div>
                      </td>

                      {/* 수량 */}
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 text-xs">
                        {item.quantity} <span className="text-[10px] text-slate-400 font-normal">{item.unit}</span>
                      </td>

                      {/* 기준 / 산출단가 */}
                      <td className="py-2 px-3 text-right font-mono text-[12px] tabular-nums">
                        {hasDiff ? (
                          <span className="text-slate-400 line-through">
                            ₩{item.before_unit_price.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            ₩{item.before_unit_price.toLocaleString()}
                          </span>
                        )}
                      </td>

                      {/* 수정 확정단가 */}
                      <td className={`py-2 px-3 text-right font-mono font-bold text-[13px] tabular-nums ${
                        isMaster ? 'text-blue-700' : hasDiff ? 'text-amber-700' : 'text-slate-900'
                      }`}>
                        ₩{item.after_unit_price.toLocaleString()}
                      </td>

                      {/* 변동액 및 변동률 */}
                      <td className="py-2 px-3 text-center">
                        {hasDiff ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-bold font-mono ${
                              isUp
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isDown
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isUp ? '+' : ''}₩{Math.abs(item.diff_unit_price).toLocaleString()}
                            {item.diff_rate !== 0 && (
                              <span className="ml-1 opacity-80">
                                ({isUp ? '+' : ''}{item.diff_rate}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-400">-</span>
                        )}
                      </td>

                      {/* 총 공급가액 (수량 × 단가) */}
                      <td
                        className={`py-2 px-3 text-right font-mono font-bold text-[13.5px] tabular-nums ${
                          isMaster ? 'text-blue-900' : hasDiff ? 'text-amber-900' : 'text-slate-900'
                        }`}
                      >
                        ₩{item.after_amount.toLocaleString()}
                      </td>

                      {/* 출처 / 사유 / 비고 */}
                      <td className="py-2 px-3">
                        <SmartTruncateTooltip
                          text={item.remark || item.price_source_label || '-'}
                          className="text-slate-500 text-[11px] block"
                          maxWidthClass="max-w-[160px]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 모달 하단 풋터 */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[11.5px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>
              수정된 단가는 <strong>수기 단가 지식 풀(manual_price_pool)</strong>에 지능형으로 자가학습되어 향후 유사 품목 견적 시 자동 추천됩니다.
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              닫기
            </button>
            {targetCaseId && (
              <Link
                href={`/quotes/${targetCaseId}/review?filter=modified`}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-2xs flex items-center space-x-1"
              >
                <span>단가검토 워크스페이스 열기</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
