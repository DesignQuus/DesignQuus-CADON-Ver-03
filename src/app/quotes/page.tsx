'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
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
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';

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
}

export default function QuotesListPage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'ISSUED'>('ALL');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/quotes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes || []);
      }
    } catch (err) {
      console.error('Fetch quotes error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
      const res = await fetch(`/api/quotes/${quoteId}/export-excel`);
      if (!res.ok) throw new Error('엑셀 생성 실패');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `공식견적서_${quoteNo}.xlsx`;
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

  // 통계 계산
  const stats = useMemo(() => {
    const totalCount = quotes.length;
    const totalAmount = quotes.reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const approvedAmount = quotes
      .filter((q) => ['APPROVED', 'ISSUED'].includes(q.status))
      .reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const pendingCount = quotes.filter((q) => q.status === 'DRAFT').length;

    return { totalCount, totalAmount, approvedAmount, pendingCount };
  }, [quotes]);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* 1. Page Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Quotation Management System</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                공식 견적서 관리 대장
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                CAD 도면에서 추출된 BOM 및 공정별 단가를 바탕으로 산출된 공식 견적서를 조회하고 엑셀 패키지로 즉시 출력합니다.
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
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>+ 신규 견적의뢰 접수</span>
              </Link>
            </div>
          </div>

          {/* 2. Key KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">총 발행 견적서</div>
                <div className="text-2xl font-black text-slate-900">{stats.totalCount}건</div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500">총 견적 산출 금액</div>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Status Filter Tabs */}
            <div className="flex items-center space-x-1">
              <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                상태 필터:
              </span>
              {(['ALL', 'DRAFT', 'APPROVED', 'ISSUED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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

            {/* Search Box */}
            <form onSubmit={handleSearchSubmit} className="relative min-w-[260px]">
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

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              견적서 목록을 불러오는 중입니다...
            </div>
          ) : quotes.length === 0 ? (
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">견적 번호</th>
                    <th className="py-3 px-4">고객사 / 발주처</th>
                    <th className="py-3 px-4">도면 / 견적의뢰명</th>
                    <th className="py-3 px-4 text-center">품목수</th>
                    <th className="py-3 px-4 text-right">공급가액</th>
                    <th className="py-3 px-4 text-right">부가세</th>
                    <th className="py-3 px-4 text-right font-extrabold text-slate-900">최종 견적 총액</th>
                    <th className="py-3 px-4 text-center">결재 상태</th>
                    <th className="py-3 px-4 text-center">출력 및 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-blue-50/30 transition-colors">
                      {/* Quote No */}
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        <Link
                          href={`/cases/${q.quotation_case_id}`}
                          className="hover:underline flex items-center gap-1 group"
                          title="견적의뢰 상세 및 도면 분석 화면으로 이동"
                        >
                          <span>{q.quote_no}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        <div className="text-[10px] text-slate-400 font-normal font-sans">
                          버전 v{q.quote_version} ({q.quote_date || q.created_at.slice(0, 10)})
                        </div>
                      </td>

                      {/* Company */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{q.company_name}</span>
                        </div>
                      </td>

                      {/* Case Name */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{q.case_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{q.case_no}</div>
                      </td>

                      {/* Item Count */}
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[11px]">
                          {q.item_count || '-'}개 품목
                        </span>
                      </td>

                      {/* Subtotal */}
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        ₩{Number(q.subtotal || 0).toLocaleString()}
                      </td>

                      {/* Tax */}
                      <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                        ₩{Number(q.tax_amount || 0).toLocaleString()}
                      </td>

                      {/* Total Amount */}
                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-blue-700">
                        ₩{Number(q.total_amount || 0).toLocaleString()}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {q.status === 'ISSUED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                            발행완료
                          </span>
                        )}
                        {q.status === 'APPROVED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            승인완료
                          </span>
                        )}
                        {q.status === 'DRAFT' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            초안검토
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleDownloadExcel(q.id, q.quote_no)}
                            disabled={downloadingId === q.id}
                            className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                            title="공식 엑셀 견적서 즉시 다운로드"
                          >
                            <Download className={`w-3.5 h-3.5 ${downloadingId === q.id ? 'animate-bounce' : ''}`} />
                            <span>{downloadingId === q.id ? '생성중...' : '엑셀출력'}</span>
                          </button>

                          <Link
                            href={`/quotes/${q.quotation_case_id}/extract`}
                            className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center space-x-1"
                            title="도면 표제란 및 BOM 추출 검증 (Step 3)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>추출검증</span>
                          </Link>

                          <Link
                            href={`/quotes/${q.quotation_case_id}/review`}
                            className="px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center space-x-1"
                            title="3분할 단가 검토 워크스페이스 (Step 5)"
                          >
                            <span>단가검토</span>
                          </Link>

                          <Link
                            href={`/quotes/${q.quotation_case_id}/diff`}
                            className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors flex items-center space-x-1"
                            title="이전 리비전 대비 변경점 비교"
                          >
                            <span>Diff비교</span>
                          </Link>

                          <Link
                            href={`/quotes/${q.quotation_case_id}/publish`}
                            className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center space-x-1"
                            title="2종 견적서 출력 및 수주 피드백"
                          >
                            <span>견적발행</span>
                          </Link>

                          <Link
                            href={`/cases/${q.quotation_case_id}`}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="도면 분석 상세 보기"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
