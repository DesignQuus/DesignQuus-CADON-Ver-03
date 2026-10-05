'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getClientCache, setClientCache } from '@/lib/cacheStore';
import { QuoteDeleteConfirmModal, QuoteDeleteToast, SKIP_CONFIRM_KEY } from '@/components/common/QuoteDeleteConfirmModal';
import {
  FileSpreadsheet,
  Download,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  Send,
  Lock,
  Building2,
  DollarSign,
  TrendingUp,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Zap,
  Trash2,
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  Sparkles,
  Sliders
} from 'lucide-react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';
import PriceAdjustmentModal from '@/components/quotes/PriceAdjustmentModal';

interface QuoteItem {
  id: string;
  quotation_case_id: string;
  quote_no: string;
  quote_version: number;
  company_id: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  quote_date: string;
  is_locked: number;
  created_at: string;
  case_no: string;
  case_name: string;
  company_name: string;
  author_name: string;
  item_count: number;
  modified_count?: number;
}

interface QuoteGroup {
  key: string;
  caseId: string;
  caseNo: string;
  caseName: string;
  companyName: string;
  latestQuote: QuoteItem;
  historyQuotes: QuoteItem[];
}

export default function QuotesListPage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'ISSUED'>('ALL');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedCaseKeys, setExpandedCaseKeys] = useState<Set<string>>(new Set());
  const [selectedAdjustmentQuote, setSelectedAdjustmentQuote] = useState<QuoteItem | null>(null);

  // 견적서 삭제 모달 및 확인창 생략(빠른 삭제) 상태
  const [deleteQuoteModal, setDeleteQuoteModal] = useState<{ isOpen: boolean; quoteId: string; quoteNo: string }>({
    isOpen: false,
    quoteId: '',
    quoteNo: ''
  });
  const [isDeletingQuote, setIsDeletingQuote] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ text: string; showRestoreConfirm?: boolean; isError?: boolean } | null>(null);

  useEffect(() => {
    if (deleteToast) {
      const timer = setTimeout(() => {
        setDeleteToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [deleteToast]);

  const fetchQuotes = async () => {
    // 캐시가 없을 때만 전체 로딩 스피너 표시
    if (quotes.length === 0) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await apiFetch(`/api/quotes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.quotes || [];
        setQuotes(list);
        if (statusFilter === 'ALL' && !searchQuery.trim()) {
          setClientCache('quotes', data);
        }
      }
    } catch (err) {
      console.error('Fetch quotes error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const cached = getClientCache<{ quotes?: QuoteItem[] }>('quotes');
      if (cached?.quotes && Array.isArray(cached.quotes)) {
        setQuotes(cached.quotes);
      }
    } catch {}
    fetchQuotes();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuotes();
  };

  // 엑셀 다운로드 핸들러
  const handleDownloadExcel = async (quoteId: string, quoteNo: string) => {
    setDownloadingId(quoteId);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/export-excel`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || '엑셀 다운로드 실패 (승인된 견적서만 출력 가능)');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `견적서_${quoteNo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || '엑셀 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  // 견적서 영구 삭제 핸들러 (커스텀 확인 모달 & 방법 A: 삭제 완료 토스트 복원)
  const executeDeleteQuote = async (quoteId: string, quoteNo: string, wasSkipped: boolean) => {
    setIsDeletingQuote(true);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        let errMsg = data?.error || data?.message;
        if (!errMsg) {
          if (res.status === 401) errMsg = '인증 세션이 만료되었습니다. 다시 로그인해주세요.';
          else if (res.status === 403) errMsg = '견적서 삭제 권한이 없습니다.';
          else if (res.status === 404) errMsg = '이미 삭제되었거나 존재하지 않는 견적서입니다.';
          else errMsg = `견적서 삭제 실패 (상태 코드: ${res.status})`;
        }
        throw new Error(errMsg);
      }

      // UI에서 즉시 제거 (낙관적 UI 및 캐시 갱신)
      setQuotes((prev) => {
        const next = prev.filter((q) => q.id !== quoteId);
        setClientCache('quotes', { quotes: next });
        return next;
      });
      setDeleteQuoteModal({ isOpen: false, quoteId: '', quoteNo: '' });

      // 방법 A: 삭제 완료 토스트 표시 (확인 없이 삭제된 경우 [확인창 다시 켜기] 복원 버튼 노출)
      setDeleteToast({
        text: `견적서 [${quoteNo}]이(가) ${wasSkipped ? '확인 없이 즉시 ' : ''}삭제되었습니다.`,
        showRestoreConfirm: wasSkipped
      });
    } catch (e: any) {
      console.error('Delete quote error:', e);
      setDeleteToast({
        text: e.message || '견적서 삭제 중 오류가 발생했습니다.',
        isError: true
      });
    } finally {
      setIsDeletingQuote(false);
    }
  };

  const handleDeleteQuoteClick = (quoteId: string, quoteNo: string) => {
    let skipConfirm = false;
    try {
      skipConfirm = localStorage.getItem(SKIP_CONFIRM_KEY) === 'true';
    } catch {}

    if (skipConfirm) {
      // 확인창 없이 즉시 삭제 실행
      executeDeleteQuote(quoteId, quoteNo, true);
    } else {
      // 커스텀 모달 띄우기
      setDeleteQuoteModal({ isOpen: true, quoteId, quoteNo });
    }
  };

  const handleConfirmModalDelete = async (skipNextTime: boolean) => {
    if (skipNextTime) {
      try {
        localStorage.setItem(SKIP_CONFIRM_KEY, 'true');
      } catch {}
    }
    await executeDeleteQuote(deleteQuoteModal.quoteId, deleteQuoteModal.quoteNo, skipNextTime);
  };

  const handleRestoreConfirmDialog = () => {
    try {
      localStorage.removeItem(SKIP_CONFIRM_KEY);
    } catch {}
    setDeleteToast({
      text: '✓ 견적서 삭제 확인창이 다시 활성화되었습니다.',
      showRestoreConfirm: false
    });
  };

  // 견적건별 최신 버전 및 과거 이력 그룹핑
  const groupedQuotes = useMemo<QuoteGroup[]>(() => {
    const map = new Map<string, { latestQuote: QuoteItem; historyQuotes: QuoteItem[] }>();

    for (const q of quotes) {
      const key = q.quotation_case_id || q.case_no || q.id;
      if (!map.has(key)) {
        map.set(key, { latestQuote: q, historyQuotes: [] });
      } else {
        map.get(key)!.historyQuotes.push(q);
      }
    }

    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      caseId: group.latestQuote.quotation_case_id,
      caseNo: group.latestQuote.case_no,
      caseName: group.latestQuote.case_name,
      companyName: group.latestQuote.company_name,
      latestQuote: group.latestQuote,
      historyQuotes: group.historyQuotes
    }));
  }, [quotes]);

  // 아코디언 토글 핸들러
  const toggleExpand = (caseKey: string) => {
    setExpandedCaseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(caseKey)) {
        next.delete(caseKey);
      } else {
        next.add(caseKey);
      }
      return next;
    });
  };

  const toggleAllHistory = () => {
    if (expandedCaseKeys.size > 0) {
      setExpandedCaseKeys(new Set());
    } else {
      setExpandedCaseKeys(new Set(groupedQuotes.map((g) => g.key)));
    }
  };

  // 통계 계산 (최신 견적건 기준 집계로 중복 왜곡 원천 차단)
  const stats = useMemo(() => {
    const latestList = groupedQuotes.map((g) => g.latestQuote);
    const totalCases = groupedQuotes.length;
    const totalRevisions = quotes.length;
    const totalAmount = latestList.reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const approvedAmount = latestList
      .filter((q) => ['APPROVED', 'ISSUED'].includes(q.status))
      .reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const pendingCount = latestList.filter((q) => q.status === 'DRAFT').length;

    return { totalCases, totalRevisions, totalAmount, approvedAmount, pendingCount };
  }, [groupedQuotes, quotes]);

  // 페이징 및 표준 네비게이션 상태
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(groupedQuotes.length / pageSize));
  }, [groupedQuotes.length, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedGroupedQuotes = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return groupedQuotes.slice(startIdx, startIdx + pageSize);
  }, [groupedQuotes, currentPage, pageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* 1. Page Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="w-full px-2.5 sm:px-3 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Quotation Management System</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                견적서 관리 대장
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                CAD 도면에서 추출된 BOM 및 공정별 단가를 바탕으로 산출된 견적서를 조회하고 엑셀 패키지로 즉시 출력합니다.
              </p>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={fetchQuotes}
                disabled={loading}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors flex items-center space-x-1.5 shadow-2xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>새로고침</span>
              </button>

              <Link
                href="/cases"
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all shadow-2xs flex items-center space-x-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>견적의뢰 대장 바로가기</span>
              </Link>
            </div>
          </div>

          {/* 2. Key KPI Stats Cards (최신 견적건 기준 정밀 집계) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">총 견적의뢰 건수</div>
                <div className="text-2xl font-black text-slate-900 flex items-baseline gap-1.5">
                  <span>{stats.totalCases}건</span>
                  {stats.totalRevisions > stats.totalCases && (
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      총 {stats.totalRevisions}개 리비전
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">최신 견적 산출 금액</div>
                <div className="text-xl font-black text-indigo-700">
                  ₩{stats.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">승인·수주 확정액</div>
                <div className="text-xl font-black text-emerald-600">
                  ₩{stats.approvedAmount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">결재 대기 중인 견적</div>
                <div className="text-2xl font-black text-amber-600">{stats.pendingCount}건</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main List Section */}
      <div className="w-full px-2.5 sm:px-3 mt-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
            {/* Status Filter Tabs */}
            <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                상태 필터:
              </span>
              {(['ALL', 'DRAFT', 'APPROVED', 'ISSUED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st === 'ALL' && '전체 견적'}
                  {st === 'DRAFT' && '초안 (검토중)'}
                  {st === 'APPROVED' && '승인 완료'}
                  {st === 'ISSUED' && '공식 발행됨'}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              {/* 과거 이력 일괄 펼치기/접기 버튼 */}
              {quotes.length > groupedQuotes.length && (
                <button
                  type="button"
                  onClick={toggleAllHistory}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs shrink-0"
                  title="모든 견적건의 과거 수정 이력 일괄 펼치기/접기"
                >
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>{expandedCaseKeys.size > 0 ? '이전 이력 모두 접기' : '이전 이력 모두 펼치기'}</span>
                </button>
              )}

              {/* Search Box */}
              <form onSubmit={handleSearchSubmit} className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="견적번호, 의뢰명, 고객사 검색"
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </form>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              견적서 목록을 불러오는 중입니다...
            </div>
          ) : groupedQuotes.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-800">등록된 공식 견적서가 없습니다.</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                도면 견적의뢰에서 [최종 견적서 즉시 산출]을 실행하시면 이곳에 자동으로 견적서가 생성됩니다.
              </p>
              <Link
                href="/cases"
                className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                <span>견적의뢰 관리로 이동</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[580px] 2xl:max-h-[700px] scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-2xs">
                  <tr className="text-slate-600 font-bold">
                    <th className="py-2.5 px-3 text-center w-14 bg-slate-50">No.</th>
                    <th className="py-2.5 px-4 bg-slate-50">견적 번호</th>
                    <th className="py-2.5 px-4 bg-slate-50">고객사 / 발주처</th>
                    <th className="py-2.5 px-4 bg-slate-50">도면 / 견적의뢰명</th>
                    <th className="py-2.5 px-4 text-center bg-slate-50">품목수</th>
                    <th className="py-2.5 px-4 text-right bg-slate-50">공급가액</th>
                    <th className="py-2.5 px-4 text-right bg-slate-50">부가세</th>
                    <th className="py-2.5 px-4 text-right font-extrabold text-slate-900 bg-slate-50">최종 견적 총액</th>
                    <th className="py-2.5 px-4 text-center bg-slate-50">결재 상태</th>
                    <th className="py-2.5 px-4 text-center bg-slate-50">출력 및 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedGroupedQuotes.map((group, idx) => {
                    const q = group.latestQuote;
                    const isExpanded = expandedCaseKeys.has(group.key);
                    const hasHistory = group.historyQuotes.length > 0;
                    const globalIdx = (currentPage - 1) * pageSize + idx + 1;

                    return (
                      <React.Fragment key={group.key}>
                        {/* 1. 최신 유효 견적 대표 행 */}
                        <tr className={`transition-colors hover:bg-blue-50/40 ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                          {/* 0. Row Number (No.) */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <span className="font-mono text-slate-400 text-xs font-bold">
                              {String(globalIdx).padStart(2, '0')}
                            </span>
                          </td>

                          {/* Quote No & Version */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className="flex items-center space-x-2">
                              <Link
                                href={`/cases/${q.quotation_case_id}`}
                                className="font-bold text-blue-700 hover:underline flex items-center gap-1 group/link"
                                title="견적의뢰 상세 및 도면 분석 화면으로 이동"
                              >
                                <span>{q.quote_no}</span>
                                <ArrowUpRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                              </Link>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                                최신 v{q.quote_version}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                              발행일: {q.quote_date || (q.created_at ? q.created_at.slice(0, 10) : '-')}
                            </div>

                            {/* 과거 수정 이력 토글 버튼 */}
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(group.key)}
                                className="mt-1.5 inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                                title={isExpanded ? '이전 이력 접기' : '이전 수정 이력 펼치기'}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3 h-3 text-slate-500" />
                                    <span>이전 버전 {group.historyQuotes.length}건 접기</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3 text-slate-500" />
                                    <span>이전 이력 {group.historyQuotes.length}건 보기</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>

                          {/* Company */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{q.company_name}</span>
                            </div>
                          </td>

                          {/* Case Name with SmartTruncateTooltip */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(q.case_name?.includes('즉시 견적') || q.case_name?.includes('즉시견적')) && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-[#E9E9E9] text-slate-800 border border-slate-300 shadow-2xs" title="AI 즉시 견적으로 산출된 건입니다.">
                                  <Zap className="w-2.5 h-2.5 text-amber-500" />
                                  <span>AI 즉시 견적</span>
                                </span>
                              )}
                              <SmartTruncateTooltip
                                text={q.case_name}
                                className="font-semibold text-slate-800 text-xs"
                                maxWidthClass="max-w-[240px]"
                              />
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{q.case_no}</div>
                          </td>

                          {/* Item Count & Modified Price Badge */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[11px]">
                                {Number(q.item_count || 0)}개 품목
                              </span>
                              {Number(q.modified_count || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAdjustmentQuote(q);
                                  }}
                                  className="px-2 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10.5px] inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                                  title="견적 분석 담당자가 수기로 수정한 단가 품목 일람표 보기"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  <span>단가수정 {q.modified_count}건</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Subtotal */}
                          <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                            ₩{Number(q.subtotal || 0).toLocaleString()}
                          </td>

                          {/* Tax */}
                          <td className="py-3.5 px-4 text-right font-mono text-slate-400 text-[11px]">
                            ₩{Number(q.tax_amount || 0).toLocaleString()}
                          </td>

                          {/* Total Amount */}
                          <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-blue-700">
                            ₩{Number(q.total_amount || 0).toLocaleString()}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 text-center">
                            {q.status === 'ISSUED' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E9E9] text-slate-800 border border-slate-300">
                                공식발행
                              </span>
                            )}
                            {q.status === 'APPROVED' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E9E9] text-slate-800 border border-slate-300">
                                승인완료
                              </span>
                            )}
                            {q.status === 'DRAFT' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {Number(q.total_amount || 0) > 0 ? '초안 (단가산출)' : '초안 (검토대기)'}
                              </span>
                            )}
                          </td>

                          {/* Actions (2-Primary Actions + Tool Group) */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1.5">
                              {/* 1. Primary: 엑셀 다운로드 (금액 있으면 초안도 즉시 허용!) */}
                              {Number(q.total_amount || 0) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadExcel(q.id, q.quote_no)}
                                  disabled={downloadingId === q.id}
                                  className="h-[26px] px-2.5 text-[11px] font-bold text-slate-800 bg-[#E9E9E9] hover:bg-[#DCDCDC] border border-slate-300 rounded-full transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                  title="최신 엑셀 견적서 즉시 다운로드"
                                >
                                  <FileSpreadsheet className={`w-3.5 h-3.5 text-emerald-600 ${downloadingId === q.id ? 'animate-spin' : ''}`} />
                                  <span>{downloadingId === q.id ? '출력중...' : '엑셀 다운로드'}</span>
                                </button>
                              ) : (
                                <span
                                  className="h-[26px] px-2.5 inline-flex items-center text-[11px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-full cursor-not-allowed select-none"
                                  title="단가가 0원인 건은 엑셀을 출력할 수 없습니다. 단가를 먼저 입력해주세요."
                                >
                                  단가 미산출
                                </span>
                              )}

                              {/* 2. Secondary: 상태별 워크플로우 전진 버튼 */}
                              {q.status === 'DRAFT' ? (
                                <Link
                                  href={`/quotes/${q.quotation_case_id}/publish`}
                                  className="h-[26px] px-2.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full transition-all flex items-center space-x-1 shadow-2xs"
                                  title="최종 견적서 공식 승인 및 발행 화면으로 이동"
                                >
                                  <span>견적 확정/발행</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </Link>
                              ) : (
                                <Link
                                  href={`/quotes/${q.quotation_case_id}/publish`}
                                  className="h-[26px] px-2.5 text-[11px] font-bold text-slate-800 bg-[#E9E9E9] hover:bg-[#DCDCDC] border border-slate-300 rounded-full transition-all flex items-center space-x-1 shadow-2xs"
                                  title="공식 발행된 견적서 상세 보기"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                                  <span>견적서 보기</span>
                                </Link>
                              )}

                              {/* 3. 보조 액션 도구 (구분선 + 콤팩트 아이콘들) */}
                              <div className="flex items-center space-x-0.5 pl-1 border-l border-slate-200">
                                <Link
                                  href={`/quotes/${q.quotation_case_id}/review`}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="단가 검토 워크스페이스 이동"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </Link>

                                <Link
                                  href={`/quotes/${q.quotation_case_id}/diff`}
                                  className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                  title="설계 및 단가 변경점 비교"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </Link>

                                <Link
                                  href={`/cases/${q.quotation_case_id}`}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="CAD 도면 분석 화면 보기"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuoteClick(q.id, q.quote_no)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="견적서 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* 2. 이전 수정 이력 서브 행 (아코디언 확장 시 표출) */}
                        {isExpanded &&
                          group.historyQuotes.map((hq) => (
                            <tr
                              key={hq.id}
                              className="bg-slate-50/80 hover:bg-slate-100/70 border-l-4 border-l-blue-400 text-xs transition-colors"
                            >
                              {/* 0. Sub Row Indicator */}
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-slate-300 font-mono text-xs select-none">↳</span>
                              </td>

                              {/* Sub Quote No */}
                              <td className="py-2.5 px-4 font-mono pl-6">
                                <div className="flex items-center space-x-2">
                                  <span className="text-blue-500 font-bold select-none">↳</span>
                                  <Link
                                    href={`/cases/${hq.quotation_case_id}`}
                                    className="font-medium text-slate-600 hover:text-blue-600 hover:underline"
                                    title="이전 버전 도면 분석 이동"
                                  >
                                    <span>{hq.quote_no}</span>
                                  </Link>
                                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-200 text-slate-600">
                                    구버전 v{hq.quote_version}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 pl-4 font-sans mt-0.5">
                                  이력일자: {hq.quote_date || (hq.created_at ? hq.created_at.slice(0, 10) : '-')}
                                </div>
                              </td>

                              {/* Company */}
                              <td className="py-2.5 px-4 text-slate-500">
                                <span className="text-slate-400 mr-1">└</span>
                                <span>{hq.company_name}</span>
                              </td>

                              {/* Case Name */}
                              <td className="py-2.5 px-4">
                                <span className="text-slate-600 text-xs">{hq.case_name}</span>
                                <div className="text-[10px] text-slate-400 font-mono">v{hq.quote_version} 이력 리비전</div>
                              </td>

                              {/* Item Count & Modified Price Badge */}
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-slate-500 font-mono text-[11px]">
                                    {Number(hq.item_count || 0)}개 품목
                                  </span>
                                  {Number(hq.modified_count || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedAdjustmentQuote(hq);
                                      }}
                                      className="px-1.5 py-0.2 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[9.5px] inline-flex items-center gap-0.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                      title="과거 버전의 단가 수정 품목 내역서 보기"
                                    >
                                      <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                      <span>수정 {hq.modified_count}건</span>
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Subtotal */}
                              <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                                ₩{Number(hq.subtotal || 0).toLocaleString()}
                              </td>

                              {/* Tax */}
                              <td className="py-2.5 px-4 text-right font-mono text-slate-400 text-[11px]">
                                ₩{Number(hq.tax_amount || 0).toLocaleString()}
                              </td>

                              {/* Total Amount */}
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-600">
                                ₩{Number(hq.total_amount || 0).toLocaleString()}
                              </td>

                              {/* Status */}
                              <td className="py-2.5 px-4 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">
                                  과거 이력
                                </span>
                              </td>

                              {/* Actions for History */}
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center space-x-1.5">
                                  {Number(hq.total_amount || 0) > 0 ? (
                                    <button
                                      onClick={() => handleDownloadExcel(hq.id, hq.quote_no)}
                                      disabled={downloadingId === hq.id}
                                      className="px-2 py-0.8 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                      title="과거 버전 엑셀 견적서 다운로드"
                                    >
                                      <Download className="w-3 h-3 text-slate-500" />
                                      <span>{downloadingId === hq.id ? '생성중...' : '이력엑셀'}</span>
                                    </button>
                                  ) : (
                                    <span
                                      className="px-2 py-0.8 text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-md cursor-not-allowed select-none"
                                      title="금액이 0원인 이력 버전입니다."
                                    >
                                      미승인
                                    </span>
                                  )}

                                  <Link
                                    href={`/quotes/${hq.quotation_case_id}/diff`}
                                    className="px-2 py-0.8 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors flex items-center space-x-1"
                                    title="최신 버전과의 변경점 비교"
                                  >
                                    <span>변경비교</span>
                                  </Link>

                                  <Link
                                    href={`/cases/${hq.quotation_case_id}`}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="이전 버전 도면 분석 보기"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Link>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuoteClick(hq.id, hq.quote_no)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                    title="과거 이력 견적서 삭제"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Standard Pagination Navigation Bar (중앙 정렬 배치 & 프로젝트 표준 로직) */}
          {groupedQuotes.length > 0 && (
            <div className="py-3.5 px-5 border-t border-slate-200/90 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-6 text-xs text-slate-500 shrink-0">
              {/* 중앙 번호 네비게이션 버튼 그룹 */}
              <div className="flex items-center space-x-1">
                {/* 이전 페이지 버튼 */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                  title="이전 페이지"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>이전</span>
                </button>

                {/* 페이지 번호 버튼 목록 */}
                {getPageNumbers().map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                {/* 다음 페이지 버튼 */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                  title="다음 페이지"
                >
                  <span>다음</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="hidden sm:inline text-slate-300">|</span>

              {/* 건수 정보 및 페이지당 표시 행수 선택기 */}
              <div className="flex items-center space-x-3 text-slate-600">
                <div>
                  총 <strong className="text-slate-900 font-bold">{groupedQuotes.length}</strong>건 중{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {groupedQuotes.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
                    {Math.min(groupedQuotes.length, currentPage * pageSize)}
                  </span>
                  건 표시
                </div>
                <span className="text-slate-300">|</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-500 text-[11.5px]">페이지당 행 수:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs"
                  >
                    <option value={10}>10개씩 보기</option>
                    <option value={20}>20개씩 보기</option>
                    <option value={30}>30개씩 보기</option>
                    <option value={50}>50개씩 보기</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 단가 직접 수정 품목 내역서 모달 */}
      {selectedAdjustmentQuote && (
        <PriceAdjustmentModal
          quoteId={selectedAdjustmentQuote.id}
          quoteNo={selectedAdjustmentQuote.quote_no}
          caseName={selectedAdjustmentQuote.case_name}
          caseNo={selectedAdjustmentQuote.case_no}
          quotationCaseId={selectedAdjustmentQuote.quotation_case_id}
          isOpen={Boolean(selectedAdjustmentQuote)}
          onClose={() => setSelectedAdjustmentQuote(null)}
        />
      )}

      {/* ⚠️ 견적서 삭제 커스텀 확인 모달 */}
      <QuoteDeleteConfirmModal
        isOpen={deleteQuoteModal.isOpen}
        quoteNo={deleteQuoteModal.quoteNo}
        onClose={() => setDeleteQuoteModal({ isOpen: false, quoteId: '', quoteNo: '' })}
        onConfirm={handleConfirmModalDelete}
        isDeleting={isDeletingQuote}
      />

      {/* 💡 방법 A: 삭제 완료 토스트 & [확인창 다시 켜기] 복원 버튼 */}
      <QuoteDeleteToast
        message={deleteToast}
        onClose={() => setDeleteToast(null)}
        onRestoreConfirmDialog={handleRestoreConfirmDialog}
      />
    </div>
  );
}
