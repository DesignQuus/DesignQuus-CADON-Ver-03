'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  FileText,
  Building2,
  Users,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  TrendingUp,
  Sparkles,
  UploadCloud,
  FileCode2,
  Activity,
  ChevronRight,
  DollarSign,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight,
  FileSpreadsheet,
  Download,
  Check,
  X,
  Loader2,
  User,
  RotateCcw
} from 'lucide-react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';

interface UserProfile {
  id: string;
  name: string;
  loginId: string;
  role: string;
  companyId?: string;
  companyName?: string;
}

interface QuotationCase {
  id: string;
  case_no: string;
  case_name: string;
  company_name: string;
  company_code: string;
  lifecycle_stage: string;
  drawings_count: number;
  bom_items_count: number;
  quote_total_amount?: number;
  created_at: string;
  created_by_user_id?: string;
  created_by_name?: string;
  is_deleted?: boolean;
  remaining_days?: number | null;
  deleted_at?: string | null;
}

interface CompanySummary {
  id: string;
  company_name: string;
  is_active: number;
  memberCount: number;
  caseCount: number;
}

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

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<QuotationCase[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [auditCount, setAuditCount] = useState<number>(0);
  const [downloadingQuoteId, setDownloadingQuoteId] = useState<string | null>(null);

  // 신규 도면 견적 등록 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenUploadModal = () => {
    setNewCaseName('');
    setSelectedCompanyId(user?.companyId || (companies[0]?.id ?? 'comp_ag_borgwarner'));
    setSelectedFile(null);
    setSubmitError(null);
    setIsUploadModalOpen(true);
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) {
      setSubmitError('견적의뢰 건명을 입력해 주세요.');
      return;
    }
    const targetCompId = selectedCompanyId || user?.companyId || 'comp_ag_borgwarner';

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. 견적 건 생성
      const createRes = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseName: newCaseName.trim(),
          companyId: targetCompId,
          projectId: 'proj_unassigned',
        })
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.caseId) {
        throw new Error(createData.error || '견적의뢰 등록에 실패했습니다.');
      }

      const newCaseId = createData.caseId;

      // 2. 파일이 선택되어 있으면 업로드 수행
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await apiFetch(`/api/quotation-cases/${newCaseId}/upload`, {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          console.warn('파일 업로드 경고:', uploadData.error);
        }
      }

      // 3. 완료 후 해당 건 상세 페이지로 즉시 이동
      setIsUploadModalOpen(false);
      router.push(`/cases/${newCaseId}`);
    } catch (err: any) {
      setSubmitError(err.message || '견적 등록 중 오류가 발생했습니다.');
      setIsSubmitting(false);
    }
  };

  const handleRestoreCase = async (e: React.MouseEvent, caseId: string, caseName: string) => {
    e.stopPropagation();
    if (!confirm(`[${caseName || '해당 건'}] 건을 정상 작업 상태로 복원하시겠습니까?`)) return;
    try {
      const res = await apiFetch(`/api/quotation-cases/${caseId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESTORE' })
      });
      if (res.ok) {
        setCases((prev) =>
          prev.map((c) =>
            c.id === caseId
              ? { ...c, is_deleted: false, deleted_at: null, remaining_days: null }
              : c
          )
        );
      } else {
        const data = await res.json();
        alert(data.error || '복구에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to restore case:', err);
      alert('복구 요청 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    // 1. Check user session
    apiFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.replace('/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || !data.user) {
          router.replace('/login');
          return;
        }
        if (data.user.role === 'SUPER_ADMIN') {
          router.replace('/admin/companies');
          return;
        }

        setUser(data.user);
        try {
          localStorage.setItem('cadon_user', JSON.stringify(data.user));
        } catch {}

        // 2. Fetch cases
        apiFetch('/api/quotation-cases')
          .then((r) => (r.ok ? r.json() : { cases: [] }))
          .then((cData) => {
            if (Array.isArray(cData.cases)) {
              setCases(cData.cases);
            }
          })
          .catch(() => {});

        // 2-B. Fetch quotes for quote amount KPI & recent quotes list
        apiFetch('/api/quotes')
          .then((r) => (r.ok ? r.json() : { quotes: [] }))
          .then((qData) => {
            if (Array.isArray(qData.quotes)) {
              setQuotes(qData.quotes);
            }
          })
          .catch(() => {});

        // 2-C. Fetch companies for select dropdown
        apiFetch('/api/companies')
          .then((r) => (r.ok ? r.json() : { companies: [] }))
          .then((compData) => {
            if (Array.isArray(compData.companies)) {
              setCompanies(compData.companies);
            }
          })
          .catch(() => {});

        // 3. If SUPER_ADMIN, fetch company stats and audit logs
        if (data.user.role === 'SUPER_ADMIN') {
          apiFetch('/api/companies?include_stats=true')
            .then((r) => (r.ok ? r.json() : { companies: [] }))
            .then((compData) => {
              if (Array.isArray(compData.companies)) {
                setCompanies(compData.companies);
              }
            })
            .catch(() => {});

          apiFetch('/api/admin/audit-logs?limit=1')
            .then((r) => (r.ok ? r.json() : { total: 0 }))
            .then((aData) => {
              if (typeof aData.total === 'number') {
                setAuditCount(aData.total);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalCases = cases.length;
    let inProgressCount = 0;
    let pendingApprovalCount = 0;
    let completedCount = 0;
    let totalDrawings = 0;

    for (const c of cases) {
      totalDrawings += Number(c.drawings_count || 0);
      const stage = (c.lifecycle_stage || '').toUpperCase();
      if (stage.includes('APPROV') || stage.includes('PENDING') || stage.includes('REVIEW')) {
        pendingApprovalCount++;
      } else if (stage.includes('COMPLETE') || stage.includes('ORDER') || stage.includes('FINAL')) {
        completedCount++;
      } else {
        inProgressCount++;
      }
    }

    const activeCompanies = companies.filter((c) => c.is_active === 1).length;
    const totalMembers = companies.reduce((acc, c) => acc + (c.memberCount || 0), 0);

    // Quote KPIs
    const totalQuotesCount = quotes.length;
    const totalQuoteAmount = quotes.reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const approvedQuoteAmount = quotes
      .filter((q) => ['APPROVED', 'ISSUED'].includes(q.status))
      .reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
    const pendingQuoteAmount = quotes
      .filter((q) => q.status === 'DRAFT')
      .reduce((acc, q) => acc + Number(q.total_amount || 0), 0);

    return {
      totalCases,
      inProgressCount,
      pendingApprovalCount,
      completedCount,
      totalDrawings,
      totalCompanies: companies.length,
      activeCompanies,
      totalMembers,
      totalQuotesCount,
      totalQuoteAmount,
      approvedQuoteAmount,
      pendingQuoteAmount
    };
  }, [cases, companies, quotes]);

  // Role Badge Formatter
  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return {
          label: '시스템 최고관리자 (SUPER ADMIN)',
          bg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          dot: 'bg-indigo-500'
        };
      case 'TENANT_ADMIN':
        return {
          label: '회원사 대표관리자 (TENANT ADMIN)',
          bg: 'bg-blue-50 border-blue-200 text-blue-700',
          dot: 'bg-blue-500'
        };
      case 'MANAGER':
        return {
          label: '견적/승인 책임자 (MANAGER)',
          bg: 'bg-purple-50 border-purple-200 text-purple-700',
          dot: 'bg-purple-500'
        };
      default:
        return {
          label: '실무 사용자 (USER)',
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          dot: 'bg-emerald-500'
        };
    }
  };

  const roleInfo = getRoleBadge(user?.role);
  const [caseFilter, setCaseFilter] = useState<'ALL' | 'MY'>('ALL');

  const myCasesCount = useMemo(() => {
    if (!user) return 0;
    return cases.filter(
      (c) => c.created_by_user_id === user.id || c.created_by_name === user.name
    ).length;
  }, [cases, user]);

  const recentCases = useMemo(() => {
    let list = cases;
    if (caseFilter === 'MY' && user) {
      list = cases.filter(
        (c) => c.created_by_user_id === user.id || c.created_by_name === user.name
      );
    }
    return list.slice(0, 5);
  }, [cases, caseFilter, user]);

  const recentQuotes = useMemo(() => quotes.slice(0, 5), [quotes]);

  const handleDownloadExcel = async (quoteId: string, quoteNo: string) => {
    setDownloadingQuoteId(quoteId);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/export-excel`);
      if (!res.ok) {
        alert('엑셀 다운로드에 실패했습니다.');
        return;
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
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setDownloadingQuoteId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-500">대시보드를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1640px] mx-auto">
      {/* 1. Hero & Welcome Section (Compact 2-Row Layout) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 rounded-2xl py-4 sm:py-5 px-6 sm:px-8 text-white shadow-xl shadow-slate-950/10">
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute right-40 bottom-0 -mb-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left: 2-Row Stack */}
          <div className="space-y-1.5">
            {/* Row 1: Greeting Title + Inline Role Badge */}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                <span>안녕하세요,</span>
                <span className="text-blue-400">{user?.name || '담당자'}</span>
                <span>님! 👋</span>
              </h1>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-blue-200 border border-white/15 backdrop-blur-md shadow-2xs">
                <span className={`w-2 h-2 rounded-full ${roleInfo.dot}`}></span>
                <span>{roleInfo.label}</span>
                {user?.companyName && user.companyName !== '고객사 미지정' && (
                  <span className="border-l border-white/20 pl-1.5 text-white font-bold">{user.companyName}</span>
                )}
              </div>
            </div>

            {/* Row 2: Subtitle Description (Single Line) */}
            <p className="text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed whitespace-normal lg:whitespace-nowrap">
              CADON AI 기반 DWG 도면 자동 파싱, 실시간 가상 BOM 추출 및 스마트 제조 원가 견적 관제 시스템입니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenUploadModal}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>신규 도면 견적 등록</span>
              <UploadCloud className="w-4 h-4 text-blue-200 ml-0.5" />
            </button>

            {user?.role === 'SUPER_ADMIN' && (
              <Link
                href="/admin/companies"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 backdrop-blur-md transition-all cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-blue-300" />
                <span>회원사 관리 센터</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key KPI Statistics Cards (견적 금액 중심 비즈니스 관제) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Quote Amount (누적 견적 산출액) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">총 견적 산출액</span>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900 font-mono">
              ₩{stats.totalQuoteAmount.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>공식 견적서 {stats.totalQuotesCount}건 발행</span>
            <Link href="/quotes" className="text-blue-600 hover:underline font-bold text-[11px]">
              견적대장 ➡️
            </Link>
          </p>
        </div>

        {/* Card 2: Approved / Ordered Amount (승인·수주 확정액) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">승인·수주 확정액</span>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-emerald-600 font-mono">
              ₩{stats.approvedQuoteAmount.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>최종 승인 및 발주 완료 견적</span>
          </p>
        </div>

        {/* Card 3: Pending Quote & Approval (결재·산출 대기액) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">결재·산출 대기액</span>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-amber-600 font-mono">
              ₩{stats.pendingQuoteAmount.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span>진행 중 {stats.inProgressCount}건 / 결재대기 {stats.pendingApprovalCount}건</span>
          </p>
        </div>

        {/* Card 4: Total Cases & Drawings (도면 및 테넌트 현황) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">도면 분석 및 테넌트</span>
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-600">{stats.totalCases}</span>
            <span className="text-xs font-semibold text-slate-500">건 의뢰 (도면 {stats.totalDrawings}매)</span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-purple-500" />
            <span>
              {user?.role === 'SUPER_ADMIN'
                ? `회원사 ${stats.activeCompanies}개사 가동 중`
                : `${user?.companyName || '등록 고객사 연동 완료'}`}
            </span>
          </p>
        </div>
      </div>

      {/* 3. Smart Quick Action Hub */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>업무 퀵 액세스 허브 (Quick Actions)</span>
            </h2>
            <p className="text-xs text-slate-500">자주 사용하는 주요 핵심 기능으로 즉시 이동합니다.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Action 1: Official Quotes (공식 견적서 관리) */}
          <Link
            href="/quotes"
            className="group bg-white p-5 rounded-xl border border-emerald-200 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer ring-1 ring-emerald-100"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center justify-between">
                <span>공식 견적서 관리 대장</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                채번된 견적번호(Q-XXXX), 버전별 공급가/부가세/총액 조회 및 엑셀 다운로드
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-600">
              <span>견적서 대장 바로가기</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Action 2: Cases (도면 의뢰 목록) */}
          <Link
            href="/cases"
            className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center justify-between">
                <span>견적의뢰 관리 대장</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                접수된 CAD 도면 목록을 조회하고, AI 가상 BOM 추출 및 단가 산출 작업을 진행합니다.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-blue-600">
              <span>목록 바로가기</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Action 2: New Case (공통) */}
          <button
            type="button"
            onClick={handleOpenUploadModal}
            className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer text-left w-full"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center justify-between">
                <span>신규 도면 견적 등록</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                DWG CAD 도면(DWG, DXF)을 업로드하여 신규 견적의뢰 건을 생성합니다.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-indigo-600">
              <span>견적 등록 팝업 열기</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </button>

          {/* Action 3: 회원사 대표(TENANT_ADMIN) 전용 - 사원 관리 */}
          {user?.role === 'TENANT_ADMIN' && (
            <Link
              href="/admin/members"
              className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center justify-between">
                  <span>사원 관리 센터</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  소속 임직원 신규 등록, 계정 권한 관리 및 사원별 활동 상태를 관리합니다.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-600">
                <span>사원 목록 바로가기</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </Link>
          )}

          {/* Action 4: 회원사 대표(TENANT_ADMIN) 전용 - 사내 승인 및 결재 권한 */}
          {user?.role === 'TENANT_ADMIN' && (
            <Link
              href="/admin/permissions"
              className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-purple-500 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors flex items-center justify-between">
                  <span>사내 승인 및 결재 관리</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  사원별 견적 수정 권한 매트릭스를 확인하고, 접수된 결재 요청을 검토 및 승인합니다.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-purple-600">
                <span>결재함 바로가기</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </Link>
          )}

          {/* Action 5: 일반 실무 사원(SALES_USER) 전용 - AI 가상 BOM 분석 안내 */}
          {user?.role === 'SALES_USER' && (
            <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-5 rounded-xl border border-blue-100 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold mb-3 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                  <span>AI 도면 분석 & 견적 지원</span>
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  도면 업로드 시 CADON AI가 형상·치수·재질을 자동 추출하여 공정별 가상 BOM 및 단가를 즉시 산출합니다.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-blue-100/80 flex items-center text-xs font-bold text-blue-700">
                <span>스마트 견적 프로세스 활성화</span>
              </div>
            </div>
          )}

          {/* Action 6: 최고관리자(SUPER_ADMIN) 전용 - 회원사 관리 센터 */}
          {user?.role === 'SUPER_ADMIN' && (
            <Link
              href="/admin/companies"
              className="group bg-white p-5 rounded-xl border border-blue-200 bg-blue-50/20 hover:border-blue-600 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold group-hover:scale-110 transition-transform shadow-xs">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800">
                    최고관리자
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center justify-between">
                  <span>회원사 관리 센터</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  SaaS 회원사 등록, 사업자 인증 및 서비스 이용 상태를 총괄합니다.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-blue-100 flex items-center text-xs font-bold text-blue-700">
                <span>테넌트 관리 바로가기</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </Link>
          )}

          {/* Action 7: 최고관리자(SUPER_ADMIN) 전용 - 감사 로그 */}
          {user?.role === 'SUPER_ADMIN' && (
            <Link
              href="/admin/audit"
              className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-700 transition-colors flex items-center justify-between">
                  <span>사용자 활동 로그</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  로그인, 도면 수정, 단가 승인 등 8대 감사 활동 로그를 모니터링합니다.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-slate-600">
                <span>감사 로그 조회</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* 4. Recent Quotation Cases Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/50 via-white to-white">
          {/* Left: Title & Personalization */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">최근 견적의뢰 내역</h2>
              {user?.name && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <User className="w-3 h-3 text-blue-600" />
                  <span>{user.name} 담당 관제</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {caseFilter === 'MY'
                ? `${user?.name || '박세창'} 담당자님이 등록·관리하는 견적 건입니다. (총 ${myCasesCount}건)`
                : `최근 시스템에 등록되거나 갱신된 전사 견적 건입니다. (총 ${cases.length}건)`}
            </p>
          </div>

          {/* Right: Personal Filter Tabs & Full Table Link */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Filter Toggle Segment (전사 현황 vs 내 담당 건) */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCaseFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  caseFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                전사 현황 ({cases.length})
              </button>
              <button
                type="button"
                onClick={() => setCaseFilter('MY')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  caseFilter === 'MY'
                    ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-blue-600'
                }`}
              >
                <span>내 담당 건</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    caseFilter === 'MY' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {myCasesCount}
                </span>
              </button>
            </div>

            {/* Direct Case Register / List Link Button */}
            <Link
              href="/cases"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs border border-slate-200 hover:border-blue-300 transition-all cursor-pointer"
              title="견적의뢰 관리 대장 전체 목록으로 이동"
            >
              <span>의뢰 대장 바로가기</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </Link>
          </div>
        </div>

        {recentCases.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold">
              {caseFilter === 'MY'
                ? `${user?.name || '박세창'} 담당자님이 등록한 견적의뢰 건이 없습니다.`
                : '등록된 견적의뢰가 없습니다.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {caseFilter === 'MY'
                ? '상단의 [+ 신규 도면 견적 등록] 버튼을 눌러 첫 번째 담당 견적을 시작해 보세요.'
                : '도면 파일을 업로드하여 첫 번째 견적을 생성해 보세요.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenUploadModal}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>신규 도면 견적 등록</span>
              </button>
              {caseFilter === 'MY' && (
                <button
                  type="button"
                  onClick={() => setCaseFilter('ALL')}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  전체 의뢰 보기
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible pb-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-3.5 font-bold">의뢰번호 / 명칭</th>
                  <th className="py-3 px-3.5 font-bold">고객사</th>
                  <th className="py-3 px-3.5 font-bold">견적 담당자</th>
                  <th className="py-3 px-3.5 font-bold">도면 구조 / BOM (다품일도)</th>
                  <th className="py-3 px-3.5 font-bold text-right">견적금액</th>
                  <th className="py-3 px-3.5 font-bold text-center">진행 / 보관 상태</th>
                  <th className="py-3 px-3.5 font-bold text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentCases.map((c) => {
                  const isOwner = user && (c.created_by_user_id === user.id || c.created_by_name === user.name);
                  const isDeleted = c.is_deleted || !!c.deleted_at;
                  const companyDisplay = c.company_name === '1' ? '미등록 고객사' : (c.company_name || '고객사 미지정');

                  return (
                    <tr
                      key={c.id}
                      onClick={() => !isDeleted && router.push(`/cases/${c.id}`)}
                      className={`relative transition-all duration-150 cursor-pointer group border-l-4 ${
                        isDeleted
                          ? 'bg-slate-50/50 hover:bg-slate-100/80 border-l-transparent text-slate-500'
                          : 'bg-white hover:bg-slate-100/90 border-l-transparent hover:border-l-blue-600'
                      }`}
                    >
                      {/* 1. 의뢰번호 / 명칭 */}
                      <td className="py-3 px-3.5">
                        <span className="font-mono text-[11px] text-slate-500 group-hover:text-blue-700 font-bold block transition-colors">{c.case_no}</span>
                        <div className="mt-0.5">
                          <SmartTruncateTooltip
                            text={c.case_name || '도면 견적의뢰'}
                            className={`font-bold text-xs ${
                              isDeleted ? 'text-slate-500 line-through' : 'text-slate-800 group-hover:text-blue-700'
                            }`}
                            maxWidthClass="max-w-[320px] 2xl:max-w-[420px]"
                            showCopy={true}
                          />
                        </div>
                      </td>

                      {/* 2. 고객사 */}
                      <td className="py-3 px-3.5 text-slate-700 font-medium">
                        {companyDisplay}
                      </td>

                      {/* 3. 견적 담당자 (신설) */}
                      <td className="py-3 px-3.5">
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[10px] font-black shrink-0">
                              {user?.name ? user.name.slice(0, 1) : '나'}
                            </span>
                            <span>{c.created_by_name || user?.name || '박세창'}</span>
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.2 rounded shrink-0">
                              본인
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium text-xs">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] shrink-0">
                              <User className="w-3 h-3 text-slate-400" />
                            </span>
                            <span>{c.created_by_name || '담당자'}</span>
                          </span>
                        )}
                      </td>

                      {/* 4. 도면 구조 / BOM (다품일도) */}
                      <td className="py-3 px-4">
                        {c.drawings_count > 1 ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-300 shrink-0">
                                다품일도
                              </span>
                              <span className="font-bold text-slate-800 font-mono text-xs">
                                {c.drawings_count}개 시트 분할
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-600 font-medium mt-0.5">
                              {c.bom_items_count > 0 ? (
                                <span>{c.bom_items_count}품목 전개</span>
                              ) : (
                                'BOM 분석 대기'
                              )}
                            </span>
                          </div>
                        ) : c.drawings_count === 1 ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded font-medium text-[10px] bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                단품일도
                              </span>
                              <span className="font-bold text-slate-800 font-mono text-xs">
                                1개 도곽
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {c.bom_items_count}품목 전개
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium text-[11px]">
                            도면 미첨부 (0매)
                          </span>
                        )}
                      </td>

                      {/* 5. 견적금액 */}
                      <td className="py-3 px-3.5 text-right font-extrabold text-slate-900 font-mono">
                        {c.quote_total_amount
                          ? `₩${Number(c.quote_total_amount).toLocaleString()}`
                          : '-'}
                      </td>

                      {/* 6. 진행 / 보관 상태 (단일 옅은 회색 톤으로 통일) */}
                      <td className="py-3 px-3.5 text-center">
                        {isDeleted ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              삭제보관
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                              {typeof c.remaining_days === 'number'
                                ? `D-${c.remaining_days}일 후 완전삭제`
                                : '보관 만료 임박'}
                            </span>
                          </div>
                        ) : c.drawings_count === 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            도면미등록
                          </span>
                        ) : c.quote_total_amount ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                            견적완료
                          </span>
                        ) : c.bom_items_count > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              BOM완료 ({c.bom_items_count}건)
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                              단가산출 대기
                            </span>
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            견적작성
                          </span>
                        )}
                      </td>

                      {/* 7. 관리 / 이동 */}
                      <td className="py-3 px-3.5 text-center">
                        {isDeleted ? (
                          <button
                            type="button"
                            onClick={(e) => handleRestoreCase(e, c.id, c.case_name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 transition-colors cursor-pointer shadow-2xs"
                            title="삭제 취소 및 정상 복구"
                          >
                            <RotateCcw className="w-3 h-3 text-slate-500" />
                            <span>복구</span>
                          </button>
                        ) : (
                          <Link
                            href={`/cases/${c.id}`}
                            className="inline-flex items-center gap-1 text-slate-400 group-hover:text-blue-600 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4-B. Recent Official Quotes Table (최근 발행 공식 견적서 및 엑셀 다운로드) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 via-white to-white">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>최근 발행된 공식 견적서</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {quotes.length}건 보관
                </span>
              </h2>
              <p className="text-xs text-slate-500">정식 채번 및 원가 단가가 매칭되어 발행된 견적서 목록입니다.</p>
            </div>
          </div>
          <Link
            href="/quotes"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
          >
            <span>견적서 대장 전체보기</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentQuotes.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold">발행된 공식 견적서가 아직 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">도면 의뢰건에서 [최종 견적서 즉시 산출]을 실행해보세요.</p>
            <Link
              href="/cases"
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>견적의뢰에서 견적서 생성하기</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-bold">견적번호 / 버전</th>
                  <th className="py-3 px-4 font-bold">연동 케이스명</th>
                  <th className="py-3 px-4 font-bold">고객사</th>
                  <th className="py-3 px-4 font-bold text-center">품목 수</th>
                  <th className="py-3 px-4 font-bold text-right">견적 총액 (VAT포함)</th>
                  <th className="py-3 px-4 font-bold text-center">상태</th>
                  <th className="py-3 px-4 font-bold text-center">원클릭 엑셀</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentQuotes.map((q) => {
                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  let statusLabel = '임시저장 (DRAFT)';
                  if (q.status === 'APPROVED') {
                    statusBadge = 'bg-blue-50 text-blue-700 border-blue-200';
                    statusLabel = '승인완료';
                  } else if (q.status === 'ISSUED') {
                    statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    statusLabel = '공식발행';
                  }

                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-emerald-50/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <Link
                            href={`/cases/${q.quotation_case_id}`}
                            className="font-mono text-xs font-black text-blue-600 hover:text-blue-800 hover:underline"
                            title="해당 도면 견적 워크벤치로 이동"
                          >
                            {q.quote_no}
                          </Link>
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
                            V{q.quote_version}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {q.quote_date || new Date(q.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 max-w-[200px] truncate">
                        {q.case_name || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {q.company_name || '미지정 고객사'}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700 font-mono">
                        {q.item_count || 0}개
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 font-mono text-sm">
                        ₩{Number(q.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-bold border ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDownloadExcel(q.id, q.quote_no)}
                          disabled={downloadingQuoteId === q.id}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                          title="한국 표준 견적서 양식 Excel (.xlsx) 즉시 다운로드"
                        >
                          {downloadingQuoteId === q.id ? (
                            <Clock className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>엑셀출력</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Process Workflow Guide */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 rounded-2xl p-5 sm:p-6 border border-blue-100/80 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black tracking-wider text-blue-900 uppercase flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>CADON BOM AI 표준 분석 & 견적 워크플로우</span>
          </h3>
          <span className="text-[11px] font-semibold text-blue-600/80 hidden sm:inline-block">엔드투엔드 자동화 파이프라인</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-blue-100 shadow-2xs hover:shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">STEP 01</span>
                <span className="text-[10px] text-slate-400 font-mono">Input & Parse</span>
              </div>
              <div className="text-xs font-bold text-slate-900">CAD 도면 업로드 & 벡터 파싱</div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                DWG/DXF 도면 업로드, 벡터 엔티티 및 도면 메타데이터 무손실 정밀 파싱
              </p>
            </div>
          </div>
          <div className="bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-indigo-100 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">STEP 02</span>
                <span className="text-[10px] text-slate-400 font-mono">BOM Structure</span>
              </div>
              <div className="text-xs font-bold text-slate-900">멀티레벨 BOM 자동 전개</div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                도곽·표제란·BOM 테이블 자동 감지 및 부품 규격, 재질, 조립 계층(Tree) 자동 정규화
              </p>
            </div>
          </div>
          <div className="bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-purple-100 shadow-2xs hover:shadow-xs hover:border-purple-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">STEP 03</span>
                <span className="text-[10px] text-slate-400 font-mono">Cost & Matching</span>
              </div>
              <div className="text-xs font-bold text-slate-900">단가 마스터 매칭 & 원가 산출</div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                표준 단가 마스터 지능형 매칭 및 레이저·절곡·용접 등 공정별 임가공 제조원가 자동 계산
              </p>
            </div>
          </div>
          <div className="bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-emerald-100 shadow-2xs hover:shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">STEP 04</span>
                <span className="text-[10px] text-slate-400 font-mono">Approval & Export</span>
              </div>
              <div className="text-xs font-bold text-slate-900">사내 전자결재 & 엑셀 배포</div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                사내 전결 권한 확인, 전자결재 승인 처리 및 공식 견적 패키지(XLSX) 원클릭 발행
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 신규 도면 견적 등록 모달 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    <span>신규 도면 견적 등록</span>
                    <span className="text-[10px] font-bold bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded">FAST</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    DWG 도면을 등록하여 AI 가상 BOM 추출 및 원가 산출을 시작합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateCase} className="p-6 space-y-4 overflow-y-auto">
              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* 1. 건명 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  견적의뢰 건명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="예: 240314 컨베이어 라인 도면 견적"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              {/* 2. 고객사 선택 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  고객사 (회원사)
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  {companies.length > 0 ? (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))
                  ) : (
                    <option value={user?.companyId || 'comp_ag_borgwarner'}>
                      {user?.companyName || 'A&G/보그워너'}
                    </option>
                  )}
                </select>
              </div>

              {/* 3. DWG 도면 파일 업로드 (드래그 앤 드롭) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  CAD 도면 파일 첨부 (선택)
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setSelectedFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/60'
                      : selectedFile
                      ? 'border-emerald-400 bg-emerald-50/40'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dwg,.dxf,.pdf,.zip"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-emerald-200">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <FileCode2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-left min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <UploadCloud className="w-8 h-8 text-blue-500 mx-auto mb-2 opacity-80" />
                      <p className="text-xs font-bold text-slate-700">
                        클릭하거나 DWG / DXF 도면 파일을 끌어다 놓으세요
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-1">
                        지원 형식: .dwg, .dxf, .pdf (최대 200MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>등록 및 도면 분석 시작 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>등록 및 도면 분석 시작</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
