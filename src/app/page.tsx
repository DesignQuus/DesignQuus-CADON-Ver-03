'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SidebarBookmarkTab from '@/components/common/SidebarBookmarkTab';
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
  Database,
  Activity,
  ChevronLeft,
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
  RotateCcw,
  FileWarning
} from 'lucide-react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';
import { getClientCache, setClientCache, isCacheFresh } from '@/lib/cacheStore';

interface UserProfile {
  id?: string;
  userId?: string;
  name: string;
  loginId: string;
  role: string;
  companyId?: string;
  companyName?: string;
  myActiveCasesCount?: number;
}

export type PipelineStage = '0' | '1' | '2' | '3' | '4' | '5';

interface QuotationCase {
  id: string;
  case_no: string;
  case_name: string;
  company_name: string;
  company_code: string;
  lifecycle_stage: string;
  files_count?: number;
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
  company_type?: string;
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
  const [cases, setCases] = useState<QuotationCase[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [auditCount, setAuditCount] = useState<number>(0);
  const [downloadingQuoteId, setDownloadingQuoteId] = useState<string | null>(null);

  // Persistent Sidebar Collapsed State (좌측 관제탑 사이드바 & 견출 탭)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cadon_dashboard_sidebar_open');
      if (saved !== null) {
        setIsSidebarOpen(saved === 'true');
      }
    } catch {}
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cadon_dashboard_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

  // 신규 도면 견적 등록 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 순수 외부 발주 고객사 목록 (견적 주체인 '세창인터내쇼날' 자사/테넌트 제외)
  const customerCompanies = useMemo(() => {
    return companies.filter(
      (c) =>
        c.company_name &&
        c.company_name.length > 1 &&
        !/^\d+$/.test(c.company_name.trim()) &&
        !c.company_name.includes('세창') &&
        c.company_type !== 'TENANT'
    );
  }, [companies]);

  const [isSampleMode, setIsSampleMode] = useState(false);
  const [isNewCompanyInput, setIsNewCompanyInput] = useState(false);
  const [newCustomCompanyName, setNewCustomCompanyName] = useState('');

  const handleOpenUploadModal = () => {
    setNewCaseName('');
    const defaultCust = customerCompanies[0]?.id || 'comp_1790030182693';
    setSelectedCompanyId(defaultCust);
    setSelectedFile(null);
    setSubmitError(null);
    setIsSampleMode(false);
    setIsNewCompanyInput(false);
    setNewCustomCompanyName('');
    setIsUploadModalOpen(true);
  };

  const handleOpenSampleModal = () => {
    setNewCaseName('[체험용] 판금 모터 브라켓 가공 견적 (샘플)');
    const defaultCust = customerCompanies[0]?.id || 'comp_1790030182693';
    setSelectedCompanyId(defaultCust);
    setSelectedFile(null);
    setSubmitError(null);
    setIsSampleMode(true);
    setIsNewCompanyInput(false);
    setNewCustomCompanyName('');
    setIsUploadModalOpen(true);
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) {
      setSubmitError('견적의뢰 건명을 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let targetCompId = selectedCompanyId;

    // 신규 고객사 직접 입력 처리
    if (isNewCompanyInput || selectedCompanyId === '__NEW__') {
      const trimmedCustom = newCustomCompanyName.trim();
      if (!trimmedCustom) {
        setSubmitError('신규 발주 고객사명을 입력해 주세요.');
        setIsSubmitting(false);
        return;
      }

      try {
        const compRes = await apiFetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: trimmedCustom })
        });
        const compData = await compRes.json();
        if (!compRes.ok || !compData.company?.id) {
          throw new Error(compData.error || '고객사 등록에 실패했습니다.');
        }
        targetCompId = compData.company.id;
        if (!companies.some((c) => c.id === targetCompId)) {
          setCompanies((prev) => [{ id: targetCompId, company_name: trimmedCustom, company_type: 'CUSTOMER' } as any, ...prev]);
        }
      } catch (cErr: any) {
        setSubmitError(cErr.message || '신규 고객사 등록 중 오류가 발생했습니다.');
        setIsSubmitting(false);
        return;
      }
    } else if (!targetCompId) {
      targetCompId = customerCompanies[0]?.id || 'comp_1790030182693';
    }

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

      // 2. 파일이 선택되어 있으면 업로드 및 자동 분석 수행
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
        } else if (uploadData?.file?.id) {
          // CAD 도면(.dwg, .dxf)인 경우 AI 도면 분석 파이프라인(도곽 분할, 표제란 판독, 가상 BOM 전개) 즉시 실행!
          const ext = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();
          if (['.dwg', '.dxf'].includes(ext)) {
            try {
              await apiFetch(`/api/quotation-cases/${newCaseId}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: uploadData.file.id })
              });
            } catch (analyzeErr) {
              console.warn('자동 도면 분석 경고:', analyzeErr);
            }
          }
        }
      }

      // 3. 완료 후 해당 건 상세 페이지로 즉시 이동
      setIsUploadModalOpen(false);
      setIsSubmitting(false);
      window.location.href = `/cases/${newCaseId}`;
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
    let isMounted = true;

    // 클라이언트 마운트 즉시 캐시 복원 (서버 Hydration 에러 방지 및 0ms 즉시 표출)
    try {
      const cachedUser = getClientCache('user') || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cadon_user') || 'null') : null);
      const cachedCases = getClientCache('cases')?.cases || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cadon_cached_cases') || 'null') : null);
      const cachedQuotes = getClientCache('quotes')?.quotes;
      const cachedCompanies = getClientCache('companies')?.companies;

      if (cachedUser) setUser(cachedUser);
      if (cachedCases && Array.isArray(cachedCases)) setCases(cachedCases);
      if (cachedQuotes && Array.isArray(cachedQuotes)) setQuotes(cachedQuotes);
      if (cachedCompanies && Array.isArray(cachedCompanies)) setCompanies(cachedCompanies);
    } catch {}

    async function loadDashboardData() {
      // 캐시가 전혀 없는 첫 방문일 때만 전체 로딩 인디케이터 표시
      const hasAnyData = getClientCache('cases') || (typeof window !== 'undefined' && localStorage.getItem('cadon_cached_cases'));
      if (!hasAnyData) {
        setLoading(true);
      }

      try {
        // 모든 핵심 API를 워터폴 없이 완전 동시 병렬(Promise.all)로 실행!
        const [meRes, cData, qData, compData] = await Promise.all([
          apiFetch('/api/auth/me').catch(() => null),
          apiFetch('/api/quotation-cases').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          apiFetch('/api/quotes').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          apiFetch('/api/companies').then((r) => (r.ok ? r.json() : null)).catch(() => null)
        ]);

        if (!isMounted) return;

        // 1. 유저 인증 결과 처리
        if (!meRes || !meRes.ok) {
          if (!user) router.replace('/login');
          return;
        }
        const meData = await meRes.json();
        if (!meData?.user) {
          if (!user) router.replace('/login');
          return;
        }
        if (meData.user.role === 'SUPER_ADMIN') {
          router.replace('/admin/companies');
          return;
        }

        const normalizedUser: UserProfile = {
          ...meData.user,
          id: meData.user.id || meData.user.userId,
          userId: meData.user.userId || meData.user.id
        };
        setUser(normalizedUser);
        setClientCache('user', normalizedUser);
        try {
          localStorage.setItem('cadon_user', JSON.stringify(normalizedUser));
        } catch {}

        if (normalizedUser.role === 'SALES_USER') {
          setCaseFilter('MY');
        }

        // 2. 견적의뢰 목록 (Stale-While-Revalidate 및 전역 캐시 저장)
        if (cData && Array.isArray(cData.cases)) {
          setCases(cData.cases);
          setClientCache('cases', cData);
          try {
            localStorage.setItem('cadon_cached_cases', JSON.stringify(cData.cases));
          } catch {}
        }

        // 3. 공식 견적서 목록 캐시 저장
        if (qData && Array.isArray(qData.quotes)) {
          setQuotes(qData.quotes);
          setClientCache('quotes', qData);
        }

        // 4. 고객사 목록 캐시 저장
        if (compData && Array.isArray(compData.companies)) {
          setCompanies(compData.companies);
          setClientCache('companies', compData);
        }

        // 3. If SUPER_ADMIN, fetch company stats and audit logs
        if (normalizedUser.role === 'SUPER_ADMIN') {
          const [adminCompRes, auditRes] = await Promise.all([
            apiFetch('/api/companies?include_stats=true')
              .then((r) => (r.ok ? r.json() : { companies: [] }))
              .catch(() => ({ companies: [] })),
            apiFetch('/api/admin/audit-logs?limit=1')
              .then((r) => (r.ok ? r.json() : { total: 0 }))
              .catch(() => ({ total: 0 }))
          ]);
          if (!isMounted) return;
          if (Array.isArray(adminCompRes.companies)) {
            setCompanies(adminCompRes.companies);
          }
          if (typeof auditRes.total === 'number') {
            setAuditCount(auditRes.total);
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
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
  const [pipelineFilter, setPipelineFilter] = useState<'ALL' | PipelineStage>('ALL');
  const [casePage, setCasePage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);

  // 5단계 스마트 분석 파이프라인 판별 헬퍼 (배너-테이블 1:1 연동)
  // Stage '0': 도면 미첨부 (사전 접수 / 도면 대기)
  // Stage '1': 도면 파일 접수 완료 (AI 도면 파싱 대기)
  // Stage '2': AI 형상·치수 파싱 완료 (2D WebGL 60FPS 뷰어 가동)
  // Stage '3': 가상 BOM 추출 완료 (표제란·계층구조 판독)
  // Stage '4': 마스터 단가 매칭 / 검토 및 승인 대기
  // Stage '5': 공식 견적서 발행 완료 (견적번호 채번)
  const getCasePipelineStage = (c: QuotationCase): PipelineStage => {
    if (c.quote_total_amount && Number(c.quote_total_amount) > 0) return '5';
    if (c.bom_items_count > 0) {
      const stage = (c.lifecycle_stage || '').toUpperCase();
      if (stage.includes('PRICE') || stage.includes('REVIEW') || stage.includes('APPROV') || stage.includes('COST')) {
        return '4';
      }
      return '3';
    }
    if (c.drawings_count > 0) return '2';
    if (c.files_count && c.files_count > 0) return '1';
    return '0';
  };

  // Lifecycle Partitions (휴지통, 보관함, 활성 실무 프로젝트 분리)
  const isCaseDeleted = (c: any) => Boolean(c.deleted_at && c.deleted_at !== 'NULL' && c.deleted_at !== 'null') || c.is_deleted || c.lifecycle_status === 'TRASHED' || c.status === 'DELETED';
  const isCaseArchived = (c: any) => !isCaseDeleted(c) && (c.lifecycle_status === 'ARCHIVED' || c.status === 'ARCHIVED');
  const isCaseActive = (c: any) => !isCaseDeleted(c) && !isCaseArchived(c);

  const activeCases = useMemo(() => cases.filter(isCaseActive), [cases]);
  const archivedCases = useMemo(() => cases.filter(isCaseArchived), [cases]);
  const trashedCases = useMemo(() => cases.filter(isCaseDeleted), [cases]);

  // 김세창 (또는 로그인 담당자)의 실제 활성 프로젝트 (보관/휴지통 제외)
  const myActiveCases = useMemo(() => {
    if (!user) return [];
    return activeCases.filter(
      (c) => ((user.userId || user.id) && c.created_by_user_id === (user.userId || user.id)) || (user.name && c.created_by_name === user.name)
    );
  }, [activeCases, user]);

  // 단가 매칭/승인 검토 대기 건 (4단계: BOM 항목은 있으나 최종 견적이 미발행된 활성 건)
  const pendingReviewCases = useMemo(() => {
    return activeCases.filter((c) => {
      const hasBom = Number(c.bom_items_count || 0) > 0;
      const hasQuote = Boolean(c.quote_total_amount && Number(c.quote_total_amount) > 0);
      return hasBom && !hasQuote;
    });
  }, [activeCases]);

  // 파이프라인 단계별 실시간 건수 집계 (활성 프로젝트 대상, 0~5단계 배타적 할당)
  const pipelineCounts = useMemo(() => {
    const targetList = caseFilter === 'MY' ? myActiveCases : activeCases;
    const counts: Record<PipelineStage, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const c of targetList) {
      const stage = getCasePipelineStage(c);
      counts[stage]++;
    }
    return counts;
  }, [activeCases, myActiveCases, caseFilter]);

  const myCasesCount = useMemo(() => {
    if (!user) return 0;
    return cases.filter(
      (c) => ((user.userId || user.id) && c.created_by_user_id === (user.userId || user.id)) || (user.name && c.created_by_name === user.name)
    ).length;
  }, [cases, user]);

  const filteredCases = useMemo(() => {
    let result = cases;
    if (caseFilter === 'MY' && user) {
      result = result.filter(
        (c) => ((user.userId || user.id) && c.created_by_user_id === (user.userId || user.id)) || (user.name && c.created_by_name === user.name)
      );
    }
    if (pipelineFilter !== 'ALL') {
      result = result.filter((c) => {
        if (!isCaseActive(c)) return false;
        return getCasePipelineStage(c) === pipelineFilter;
      });
    }
    return result;
  }, [cases, caseFilter, pipelineFilter, user]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredCases.length / pageSize));
  }, [filteredCases.length, pageSize]);

  useEffect(() => {
    if (casePage > totalPages) {
      setCasePage(1);
    }
  }, [totalPages, casePage]);

  const paginatedCases = useMemo(() => {
    const startIdx = (casePage - 1) * pageSize;
    return filteredCases.slice(startIdx, startIdx + pageSize);
  }, [filteredCases, casePage, pageSize]);

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
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 w-full px-2.5 sm:px-3 py-3 relative">
            {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 사이드바 접힘 시 좌측 벽면에 11px 노출 -> 호버 시 36px 돌출 */}
      {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 표준화 공통 컴포넌트 (top-1/2 수직 중앙 정렬) */}
      {!isSidebarOpen && (
        <SidebarBookmarkTab
          mode="expand"
          onClick={handleToggleSidebar}
          label="관제탑"
          icon={Layers}
          title="스마트 견적 관제탑 열기"
        />
      )}

      {/* Main Split Layout: Left Control Panel + Right Main Work Table */}
      <div className="flex gap-5 lg:gap-8 items-start">
        {/* LEFT SIDEBAR: Pipeline & KPI Control Tower */}
        {isSidebarOpen && (
          <aside className="w-80 shrink-0 bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 space-y-4 flex flex-col transition-all sticky top-4 relative">
            {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 표준화 공통 컴포넌트 (top-1/2 수직 중앙 정렬) */}
            <SidebarBookmarkTab
              mode="collapse"
              onClick={handleToggleSidebar}
              label="접기"
              title="스마트 견적 관제탑 접기 (도면 넓게 보기)"
            />

            {/* Sidebar Header with Unified Tab Style Collapse Button */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black shadow-2xs">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 tracking-tight block">스마트 견적 관제탑</span>
                  <span className="text-[10px] text-slate-400 font-semibold">AutoCAD 실무 파이프라인</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 transition-all duration-120 cursor-pointer text-xs font-bold shadow-2xs"
                title="사이드바 접기 (도면 넓게 보기)"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600 group-hover:-translate-x-0.5 transition-transform" />
                <span>접기</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              </button>
            </div>

            {/* Scope Switcher: 내 담당 vs 전사 관제 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>작업 관제 모드</span>
                <span className="text-blue-600 font-extrabold">{caseFilter === 'MY' ? '내 담당 모드' : '전사 총괄 모드'}</span>
              </div>
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setCaseFilter('MY');
                    setCasePage(1);
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    caseFilter === 'MY'
                      ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3 h-3" />
                  <span>내 담당 ({myActiveCases.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCaseFilter('ALL');
                    setCasePage(1);
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    caseFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>전사 관제 ({activeCases.length})</span>
                </button>
              </div>
            </div>

            {/* 5-Step Pipeline Vertical Navigation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>5단계 견적 파이프라인</span>
                </span>
                {pipelineFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPipelineFilter('ALL');
                      setCasePage(1);
                    }}
                    className="text-[10px] text-blue-600 hover:underline font-bold cursor-pointer"
                  >
                    필터 해제
                  </button>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                {/* Stage 0: 도면 대기 (사전 접수) */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '0' ? 'ALL' : '0'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '0'
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/40 shadow-xs'
                      : 'border-amber-200/80 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      <FileWarning className="w-3 h-3" />
                    </span>
                    <div>
                      <div className="font-extrabold text-amber-950 flex items-center gap-1">
                        <span>도면 대기 (사전접수)</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-amber-200/90 text-amber-900 rounded font-bold">보완필요</span>
                      </div>
                      <div className="text-[10px] text-amber-700">도면 미첨부 의뢰 관리</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['0'] > 0 ? 'bg-amber-500 text-white shadow-2xs' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['0']}건
                  </span>
                </button>

                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '1' ? 'ALL' : '1'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '1'
                      ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-400/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">1</span>
                    <div>
                      <div className="font-extrabold text-slate-900">도면 접수</div>
                      <div className="text-[10px] text-slate-400">DWG 파일 접수·파싱 대기</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['1'] > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['1']}건
                  </span>
                </button>

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '2' ? 'ALL' : '2'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '2'
                      ? 'border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-400/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">2</span>
                    <div>
                      <div className="font-extrabold text-slate-900">AI 형상·치수 파싱</div>
                      <div className="text-[10px] text-slate-400">60FPS WebGL 분할</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['2'] > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['2']}건
                  </span>
                </button>

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '3' ? 'ALL' : '3'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '3'
                      ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">3</span>
                    <div>
                      <div className="font-extrabold text-slate-900">가상 BOM 추출</div>
                      <div className="text-[10px] text-slate-400">표제란·계층구조 판독</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['3'] > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['3']}건
                  </span>
                </button>

                {/* Step 4 */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '4' ? 'ALL' : '4'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '4'
                      ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-400/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-900 text-[10px] font-black flex items-center justify-center shrink-0">4</span>
                    <div>
                      <div className="font-extrabold text-slate-900">마스터 단가 매칭</div>
                      <div className="text-[10px] text-slate-400">단가 검토 및 승인 대기</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['4'] > 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['4']}건
                  </span>
                </button>

                {/* Step 5 */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '5' ? 'ALL' : '5'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '5'
                      ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">5</span>
                    <div>
                      <div className="font-extrabold text-slate-900">공식 견적서 발행</div>
                      <div className="text-[10px] text-slate-400">견적번호 채번 및 엑셀</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['5'] > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {pipelineCounts['5']}건
                  </span>
                </button>
              </div>
            </div>

            {/* Compact 4-KPI Overview */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                <span>핵심 현황 요약</span>
                <span className="text-[10px] text-slate-400 font-semibold">{user?.companyName || '등록사 연동'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] font-bold text-slate-500">진행 프로젝트</div>
                  <div className="text-base font-black text-blue-600 font-mono mt-0.5">
                    {user?.role === 'SUPER_ADMIN' ? activeCases.length : myActiveCases.length}건
                  </div>
                  <div className="text-[9.5px] text-slate-400">전사 {activeCases.length}건</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] font-bold text-slate-500">보관/휴지통</div>
                  <div className="text-base font-black text-slate-600 font-mono mt-0.5">
                    {archivedCases.length} / {trashedCases.length}건
                  </div>
                  <div className="text-[9.5px] text-rose-500">총 {archivedCases.length + trashedCases.length}건 격리</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">총 견적 산출액</span>
                    <span className="text-[10px] font-bold text-emerald-600">공식 {quotes.length}건 발행</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    ₩{stats.totalQuoteAmount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={handleOpenUploadModal}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>신규 도면 견적 등록</span>
                <UploadCloud className="w-3.5 h-3.5 text-blue-200" />
              </button>

              <div className="grid grid-cols-1 gap-1.5 text-xs font-bold text-slate-700">
                <Link
                  href="/cases?tab=ANALYZED"
                  className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>단가 미매칭 검토 큐</span>
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800">
                    {pendingReviewCases.length}건
                  </span>
                </Link>

                <Link
                  href="/quotes"
                  className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>공식 견적서대장</span>
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                    {quotes.length}건
                  </span>
                </Link>

                <Link
                  href="/admin/masters"
                  className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between transition-colors text-slate-600"
                >
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-500" />
                    <span>마스터 기준정보 (단가표)</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>

                {user?.role === 'SUPER_ADMIN' && (
                  <>
                    <Link
                      href="/admin/companies"
                      className="p-2 rounded-lg hover:bg-blue-50 border border-blue-200/80 flex items-center justify-between transition-colors text-blue-700"
                    >
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>회원사 관리 센터</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-blue-400" />
                    </Link>
                    <Link
                      href="/admin/audit"
                      className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between transition-colors text-slate-700"
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                        <span>사용자 활동 로그</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* RIGHT MAIN WORKSPACE: Cases Table & Recent Quotes (Maximized Height, Zero Scroll!) */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Top Slim Welcome Strip */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-2xl py-3.5 px-6 text-white shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={handleToggleSidebar}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-200 border border-white/20 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                  title="관제 패널 펼치기"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>관제탑 펼치기</span>
                </button>
              )}
              <h1 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>안녕하세요,</span>
                <span className="text-blue-400">{user?.name || '담당자'}</span>
                <span>님! 👋</span>
              </h1>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white/10 text-blue-200 border border-white/15">
                <span className={`w-1.5 h-1.5 rounded-full ${roleInfo.dot}`}></span>
                <span>{roleInfo.label}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 hidden xl:inline">
                실무 관제 활성: <strong className="text-white">{myActiveCases.length}건</strong> (전사 {activeCases.length}건)
              </span>
              {pipelineCounts['0'] > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '0' ? 'ALL' : '0'));
                    setCasePage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-xs ${
                    pipelineFilter === '0'
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                      : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/40'
                  }`}
                  title="도면 미첨부로 분석 대기 중인 의뢰건만 필터링"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>도면 보완 필요 <strong>{pipelineCounts['0']}건</strong></span>
                </button>
              )}
              <Link
                href="/cases"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white border border-white/20 transition-all text-xs font-bold cursor-pointer"
                title="견적의뢰대장 전체 목록으로 이동"
              >
                <span>견적의뢰대장 바로가기</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-300" />
              </Link>
              <button
                type="button"
                onClick={handleOpenUploadModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer"
                title="새로운 CAD 도면을 업로드하여 신규 견적의뢰 생성"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>신규 도면 견적 등록</span>
              </button>
            </div>
          </div>

    {/* 4. Recent Quotation Cases Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/50 via-white to-white">
          {/* Left: Title & Personalization */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">최근 견적의뢰 내역</h2>
              {user?.name && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <User className="w-3 h-3 text-blue-600" />
                  <span>{user.name} 담당 관제</span>
                </span>
              )}
              {pipelineFilter !== 'ALL' && (
                <span className="text-[11px] font-extrabold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs animate-in fade-in">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>
                    {pipelineFilter === '0' && '도면 대기 (사전 접수 / 보완 필요) 필터링'}
                    {pipelineFilter === '1' && '1단계: 도면 접수 필터링'}
                    {pipelineFilter === '2' && '2단계: AI 형상·치수 파싱 필터링'}
                    {pipelineFilter === '3' && '3단계: 가상 BOM 추출 필터링'}
                    {pipelineFilter === '4' && '4단계: 마스터 단가 매칭 대기 필터링'}
                    {pipelineFilter === '5' && '5단계: 공식 견적서 발행 완료 필터링'}
                    {' '}({filteredCases.length}건)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPipelineFilter('ALL');
                      setCasePage(1);
                    }}
                    className="ml-1 text-slate-500 hover:text-slate-900 bg-white/80 hover:bg-white px-1.5 py-0.2 rounded border border-amber-300 text-[10px] font-black cursor-pointer transition-colors"
                    title="전체 단계 보기로 초기화"
                  >
                    × 해제
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {pipelineFilter === '0'
                ? '고객사로부터 의뢰는 접수되었으나 CAD 도면(DWG/DXF)이 아직 등록되지 않은 건입니다. 도면을 투입하여 실무 파이프라인을 가동하세요.'
                : pipelineFilter !== 'ALL'
                ? `상단 5단계 파이프라인에서 [${pipelineFilter}단계]를 선택하여 해당 진행 상태의 건만 집중 모니터링 중입니다.`
                : caseFilter === 'MY'
                ? `${user?.name || '담당자'} 담당자님이 등록·관리하는 견적 건입니다. (총 ${myCasesCount}건)`
                : `최근 시스템에 등록되거나 갱신된 전사 견적 건입니다. (총 ${cases.length}건)`}
            </p>
          </div>

          {/* Right: Personal Filter Tabs, Inline Pager & Full Table Link */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* Filter Toggle Segment (전사 현황 vs 내 담당 건) */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setCaseFilter('ALL');
                  setCasePage(1);
                }}
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
                onClick={() => {
                  setCaseFilter('MY');
                  setCasePage(1);
                }}
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

            {/* Smart Inline Pager Controller */}
            {filteredCases.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 rounded-lg p-1">
                {/* 5개씩 / 전체 보기 토글 */}
                <div className="inline-flex rounded-md bg-white border border-slate-200 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setPageSize(5);
                      setCasePage(1);
                    }}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      pageSize === 5
                        ? 'bg-blue-50 text-blue-700 font-extrabold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    5개씩
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPageSize(100);
                      setCasePage(1);
                    }}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      pageSize > 5
                        ? 'bg-blue-50 text-blue-700 font-extrabold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    전체
                  </button>
                </div>

                {/* ◀ 1 / 2 ▶ 인라인 꺽쇠 내비게이션 */}
                <div className="flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={() => setCasePage((p) => Math.max(1, p - 1))}
                    disabled={casePage <= 1}
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                    title="이전 페이지"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-700 px-1 select-none min-w-[36px] text-center">
                    <span className="text-blue-600">{casePage}</span> / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCasePage((p) => Math.min(totalPages, p + 1))}
                    disabled={casePage >= totalPages}
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                    title="다음 페이지"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Direct Case Register / List Link Button */}
            <Link
              href="/cases"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs border border-slate-200 hover:border-blue-300 transition-all cursor-pointer"
              title="견적의뢰대장 전체 목록으로 이동"
            >
              <span>견적의뢰대장 바로가기</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </Link>
          </div>
        </div>

        {filteredCases.length === 0 ? (
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
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleOpenUploadModal}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>신규 도면 견적 등록</span>
              </button>
              <button
                type="button"
                onClick={handleOpenSampleModal}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-all cursor-pointer shadow-2xs"
                title="CAD 도면 파일이 없어도 표준 판금 샘플 도면으로 즉시 AI 견적 과정을 체험해보실 수 있습니다."
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>표준 판금 샘플로 견적 체험하기</span>
              </button>
              {caseFilter === 'MY' && (
                <button
                  type="button"
                  onClick={() => {
                    setCaseFilter('ALL');
                    setCasePage(1);
                  }}
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
                  <th className="py-3 px-3 font-bold text-center w-12 text-slate-500">No.</th>
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
                {paginatedCases.map((c, idx) => {
                  const uid = user?.userId || user?.id; const isOwner = user && ((uid && c.created_by_user_id === uid) || (user.name && c.created_by_name === user.name));
                  const isDeleted = c.is_deleted || !!c.deleted_at;
                  const companyDisplay = c.company_name === '1' ? '미등록 고객사' : (c.company_name || '고객사 미지정');
                  const globalIdx = (casePage - 1) * pageSize + idx + 1;

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
                      {/* 0. No. 순번 */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-xs text-slate-400 group-hover:text-blue-600 transition-colors">
                        {String(globalIdx).padStart(2, '0')}
                      </td>
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
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[11px]">
                              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                              도면 미첨부 (0매)
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">DWG/DXF 파일 등록 필요</span>
                          </div>
                        )}
                      </td>

                      {/* 5. 견적금액 */}
                      <td className="py-3 px-3.5 text-right font-extrabold text-slate-900 font-mono">
                        {c.quote_total_amount
                          ? `₩${Number(c.quote_total_amount).toLocaleString()}`
                          : '-'}
                      </td>

                      {/* 6. 파이프라인 진행 상태 (상단 5단계 파이프라인과 1:1 일치) */}
                      <td className="py-3 px-3.5 text-center">
                        {isDeleted ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              삭제보관
                            </span>
                            <span className="text-[10px] text-rose-500 font-medium mt-0.5">
                              {typeof c.remaining_days === 'number'
                                ? `D-${c.remaining_days}일 후 완전삭제`
                                : '보관 만료 임박'}
                            </span>
                          </div>
                        ) : c.quote_total_amount && Number(c.quote_total_amount) > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              5/5 견적발행
                            </span>
                            <span className="text-[10px] text-emerald-600 font-bold mt-0.5">
                              공식 견적서 채번
                            </span>
                          </div>
                        ) : c.bom_items_count > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              4/5 단가검토
                            </span>
                            <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                              BOM {c.bom_items_count}건 매칭중
                            </span>
                          </div>
                        ) : c.drawings_count > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                              2/5 AI파싱
                            </span>
                            <span className="text-[10px] text-indigo-600 font-medium mt-0.5">
                              도면 {c.drawings_count}매 추출
                            </span>
                          </div>
                        ) : c.files_count && c.files_count > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              1/5 도면접수
                            </span>
                            <span className="text-[10px] text-blue-600 font-medium mt-0.5">
                              AI 분석 대기중
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              사전접수 (도면대기)
                            </span>
                            <span className="text-[10px] text-amber-600 font-medium mt-0.5">
                              도면 미첨부 상태
                            </span>
                          </div>
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
                        ) : c.drawings_count === 0 && (!c.files_count || c.files_count === 0) ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              href={`/cases/${c.id}?step=1`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 text-[11px] font-extrabold border border-blue-200 transition-all cursor-pointer shadow-2xs shrink-0"
                              title="해당 의뢰건에 CAD 도면 즉시 첨부하기"
                            >
                              <Plus className="w-3 h-3 stroke-[3]" />
                              <span>도면 투입</span>
                            </Link>
                            <Link
                              href={`/cases/${c.id}`}
                              className="p-1 text-slate-400 group-hover:text-blue-600 transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </div>
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
            <span>공식 견적서대장 전체보기</span>
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
                  {isSampleMode ? <Sparkles className="w-5 h-5 text-amber-400" /> : <UploadCloud className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    <span>{isSampleMode ? '표준 판금 샘플 견적 체험' : '신규 도면 견적 등록'}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSampleMode ? 'bg-amber-500/30 text-amber-300' : 'bg-blue-500/30 text-blue-300'}`}>
                      {isSampleMode ? 'SAMPLE' : 'FAST'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isSampleMode
                      ? 'CAD 도면이 없어도 표준 판금 샘플 프로젝트로 AI 견적 워크플로우를 즉시 체험합니다.'
                      : selectedFile
                      ? 'DWG 도면을 등록하여 AI 가상 BOM 추출 및 원가 산출을 시작합니다.'
                      : '신규 견적의뢰 건을 등록합니다. (도면은 등록 후 언제든 추가 첨부 가능)'}
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

            {/* Sample Mode Friendly Callout */}
            {isSampleMode && (
              <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-3 text-xs text-amber-900 flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="leading-relaxed">
                  <strong>[체험 모드 안내]</strong> 별도 도면 파일 없이도 생성 즉시 <strong>AI 가상 BOM 전개, 가공 공정 단가 매칭, 공식 견적서 발행</strong>까지의 전체 과정을 안전하게 테스트해보실 수 있습니다.
                </span>
              </div>
            )}

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

              {/* 2. 고객사 선택 또는 직접 입력 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    발주 고객사 (의뢰처) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewCompanyInput(!isNewCompanyInput);
                      if (!isNewCompanyInput) {
                        setNewCustomCompanyName('');
                      }
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {isNewCompanyInput ? (
                      <span>🏢 기존 목록에서 선택</span>
                    ) : (
                      <span>➕ 신규 고객사 직접 입력</span>
                    )}
                  </button>
                </div>

                {isNewCompanyInput ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      required
                      value={newCustomCompanyName}
                      onChange={(e) => setNewCustomCompanyName(e.target.value)}
                      placeholder="신규 고객사명 입력 (예: (주)한국기계, 현대위아)"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-blue-400 bg-blue-50/20 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
                      autoFocus
                    />
                    <p className="text-[10.5px] text-blue-600 font-medium">
                      * 입력하신 신규 고객사는 시스템에 자동 등록되어 향후에도 바로 선택하실 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsNewCompanyInput(true);
                        } else {
                          setSelectedCompanyId(e.target.value);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      {customerCompanies.length > 0 ? (
                        customerCompanies.map((c) => (
                          <option key={c.id} value={c.id}>
                            🏢 {c.company_name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="comp_1790030182693">🏢 엠브이텍</option>
                          <option value="comp_ag_borgwarner">🏢 A&G/보그워너</option>
                        </>
                      )}
                      <option value="__NEW__" className="text-blue-600 font-bold">
                        ➕ [직접 입력] 목록에 없는 새 고객사 입력...
                      </option>
                    </select>
                  </div>
                )}
                <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1">
                  <span>견적 주체: 세창인터내쇼날(주)</span>
                  <span>{isNewCompanyInput ? '새 고객사 등록 모드' : '목록 외 회사도 직접 입력 가능'}</span>
                </div>
              </div>

              {/* 3. DWG 도면 파일 업로드 (드래그 앤 드롭) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    CAD 도면 파일 첨부 <span className="text-slate-400 font-normal">(선택)</span>
                  </label>
                  {!selectedFile && (
                    <span className="text-[11px] text-slate-400">
                      * 도면 없이 건 먼저 등록 가능
                    </span>
                  )}
                </div>
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
                        className="text-slate-400 hover:text-rose-500 p-1 rounded cursor-pointer"
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
                      <div className="mt-2 inline-block px-2.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10.5px] text-slate-500">
                        도면 없이 건을 먼저 생성한 후 상세 화면에서 언제든 도면을 등록할 수 있습니다.
                      </div>
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
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 ${
                    selectedFile
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                      : 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/30'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {selectedFile
                          ? ['.dwg', '.dxf'].some(ext => selectedFile.name.toLowerCase().endsWith(ext))
                            ? '도면 업로드 및 분석 시작 중...'
                            : '파일 업로드 및 등록 중...'
                          : '신규 견적 건 등록 중...'}
                      </span>
                    </>
                  ) : (
                    <>
                      {isSampleMode ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>샘플 프로젝트 생성 및 체험 시작</span>
                        </>
                      ) : selectedFile ? (
                        ['.dwg', '.dxf'].some(ext => selectedFile.name.toLowerCase().endsWith(ext)) ? (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>등록 및 도면 분석 시작</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>등록 및 도면 첨부</span>
                          </>
                        )
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>신규 견적 건 등록</span>
                        </>
                      )}
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
