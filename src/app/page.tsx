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
  FileWarning,
  Filter,
  Trash2,
  Search,
  RefreshCw
} from 'lucide-react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';
import CustomerSelectCombobox, { CustomerSelectionValue, AUTO_DETECT_CUSTOMER } from '@/components/common/CustomerSelectCombobox';
import { getClientCache, setClientCache, isCacheFresh } from '@/lib/cacheStore';
import { QuoteDeleteConfirmModal, QuoteDeleteToast, SKIP_CONFIRM_KEY } from '@/components/common/QuoteDeleteConfirmModal';

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

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  '0': '도면 대기 (사전접수)',
  '1': '1단계: 도면 접수',
  '2': '2단계: AI 형상·치수 파싱',
  '3': '3단계: 가상 BOM 추출',
  '4': '4단계: 마스터 단가 매칭',
  '5': '5단계: 공식 견적서 발행'
};

interface QuotationCase {
  id: string;
  case_no: string;
  case_name: string;
  company_name: string;
  company_code: string;
  lifecycle_stage: string;
  files_count?: number;
  primary_file_name?: string | null;
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

  // 견적서 삭제 모달 및 확인창 생략(빠른 삭제) 상태
  const [deleteQuoteModal, setDeleteQuoteModal] = useState<{ isOpen: boolean; quoteId: string; quoteNo: string }>({
    isOpen: false,
    quoteId: '',
    quoteNo: ''
  });
  const [isDeletingQuote, setIsDeletingQuote] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ text: string; showRestoreConfirm?: boolean } | null>(null);

  useEffect(() => {
    if (deleteToast) {
      const timer = setTimeout(() => {
        setDeleteToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [deleteToast]);

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

  // 순수 외부 발주 고객사 목록 (견적 주체인 '세창인터내쇼날' 본사 제외)
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
  const [customerSelection, setCustomerSelection] = useState<CustomerSelectionValue>(AUTO_DETECT_CUSTOMER);

  const handleOpenUploadModal = () => {
    setNewCaseName('');
    setSelectedCompanyId('comp_unassigned');
    setCustomerSelection(AUTO_DETECT_CUSTOMER);
    setSelectedFile(null);
    setSubmitError(null);
    setIsSampleMode(false);
    setIsUploadModalOpen(true);
  };

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setSubmitError(null);
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
    if (!newCaseName || newCaseName.includes('가공 견적')) {
      setNewCaseName(`${baseName} 가공 견적`);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile && !isSampleMode) {
      setSubmitError('분석할 CAD 도면 파일(.dwg, .dxf)을 첨부해 주세요.');
      return;
    }

    let finalCaseName = newCaseName.trim();
    if (!finalCaseName) {
      if (selectedFile) {
        finalCaseName = `${selectedFile.name.replace(/\.[^/.]+$/, '').trim()} 가공 견적`;
      } else if (isSampleMode) {
        finalCaseName = '[체험용] 판금 모터 브라켓 가공 견적 (샘플)';
      } else {
        finalCaseName = `신규 도면 견적 (${new Date().toISOString().slice(2, 10)})`;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let targetCompId = customerSelection.companyId;

    // AI 자동 판독이거나 미지정인 경우
    if (customerSelection.isAutoDetect || !targetCompId || customerSelection.companyName.includes('자동')) {
      targetCompId = 'comp_unassigned';
    } else if (customerSelection.isNew) {
      const trimmedCustom = customerSelection.companyName.trim();
      if (trimmedCustom) {
        const existingMatch = customerCompanies.find(
          (c) => (c.company_name || '').trim().toLowerCase() === trimmedCustom.toLowerCase()
        );
        if (existingMatch) {
          targetCompId = existingMatch.id;
        } else {
          try {
            const compRes = await apiFetch('/api/companies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyName: trimmedCustom })
            });
            const compData = await compRes.json();
            if (compRes.ok && compData.company?.id) {
              targetCompId = compData.company.id;
              if (!companies.some((c) => c.id === targetCompId)) {
                setCompanies((prev) => [{ id: targetCompId, company_name: trimmedCustom, company_type: 'CUSTOMER' } as any, ...prev]);
              }
            }
          } catch (cErr: any) {
            console.warn('신규 고객사 등록 경고:', cErr);
            targetCompId = 'comp_unassigned';
          }
        }
      }
    }

    try {
      // 1. 견적 건 생성
      const createRes = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseName: finalCaseName,
          companyId: targetCompId || 'comp_unassigned',
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

      if (cachedUser) {
        setUser(cachedUser);
        if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(cachedUser.role)) {
          setCaseFilter('MY');
        }
      }
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

        if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(normalizedUser.role)) {
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
          label: '시스템 최고관리자',
          bg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          dot: 'bg-indigo-500'
        };
      case 'TENANT_ADMIN':
        return {
          label: '총괄 관리자',
          bg: 'bg-blue-50 border-blue-200 text-blue-700',
          dot: 'bg-blue-500'
        };
      case 'SALES_USER':
        return {
          label: '영업담당 (실무)',
          bg: 'bg-blue-50 border-blue-200 text-blue-700',
          dot: 'bg-blue-500'
        };
      case 'REVIEWER':
        return {
          label: '가공·설계 검토 (실무)',
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          dot: 'bg-emerald-500'
        };
      case 'GUEST':
        return {
          label: '조회 전용',
          bg: 'bg-slate-50 border-slate-200 text-slate-700',
          dot: 'bg-slate-500'
        };
      default:
        return {
          label: '실무 사용자',
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          dot: 'bg-emerald-500'
        };
    }
  };

  const roleInfo = getRoleBadge(user?.role);
  // SSR Hydration Mismatch 방지: 초기 상태는 'ALL'로 서버/클라이언트 일치시키고, useEffect 마운트 시 사용자 권한에 따라 안전하게 'MY'로 동기화
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

  // 로그인한 견적 담당자의 실제 활성 프로젝트 (보관/휴지통 제외)
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
    return myActiveCases.length;
  }, [myActiveCases]);

  const filteredCases = useMemo(() => {
    let result = caseFilter === 'MY' ? myActiveCases : activeCases;
    if (pipelineFilter !== 'ALL') {
      result = result.filter((c) => getCasePipelineStage(c) === pipelineFilter);
    }
    return result;
  }, [activeCases, myActiveCases, caseFilter, pipelineFilter]);

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

  // 최근 견적서 필터링, 정렬 및 페이징 상태
  const [quotePage, setQuotePage] = useState<number>(1);
  const [quotePageSize, setQuotePageSize] = useState<number>(10);
  const [quoteSearchQuery, setQuoteSearchQuery] = useState<string>('');
  const [quoteCompanyFilter, setQuoteCompanyFilter] = useState<string>('ALL');
  const [quoteAmountFilter, setQuoteAmountFilter] = useState<string>('ALL');
  const [quoteSortField, setQuoteSortField] = useState<'default' | 'quote_no' | 'amount' | 'company'>('default');
  const [quoteSortOrder, setQuoteSortOrder] = useState<'asc' | 'desc'>('desc');

  // 등록된 유효 고객사 목록 추출
  const availableQuoteCompanies = useMemo(() => {
    const set = new Set<string>();
    quotes.forEach((q) => {
      if (q.company_name && q.company_name.trim()) {
        set.add(q.company_name.trim());
      }
    });
    return Array.from(set).sort();
  }, [quotes]);

  // 필터 및 정렬이 적용된 견적서 목록
  const filteredQuotes = useMemo(() => {
    let list = [...quotes];

    // 1. 견적번호 / 케이스명 검색 필터
    if (quoteSearchQuery.trim()) {
      const qLower = quoteSearchQuery.trim().toLowerCase();
      list = list.filter(
        (q) =>
          (q.quote_no && q.quote_no.toLowerCase().includes(qLower)) ||
          (q.case_name && q.case_name.toLowerCase().includes(qLower))
      );
    }

    // 2. 고객사 필터
    if (quoteCompanyFilter !== 'ALL') {
      list = list.filter((q) => (q.company_name || '미지정 고객사') === quoteCompanyFilter);
    }

    // 3. 견적 총액 조건 필터
    if (quoteAmountFilter === 'POSITIVE') {
      list = list.filter((q) => Number(q.total_amount || 0) > 0);
    } else if (quoteAmountFilter === 'ZERO') {
      list = list.filter((q) => Number(q.total_amount || 0) === 0);
    }

    // 4. 정렬 (견적번호, 고객사, 견적 총액)
    if (quoteSortField === 'quote_no') {
      list.sort((a, b) => {
        const cmp = (a.quote_no || '').localeCompare(b.quote_no || '');
        return quoteSortOrder === 'asc' ? cmp : -cmp;
      });
    } else if (quoteSortField === 'amount') {
      list.sort((a, b) => {
        const diff = Number(a.total_amount || 0) - Number(b.total_amount || 0);
        return quoteSortOrder === 'asc' ? diff : -diff;
      });
    } else if (quoteSortField === 'company') {
      list.sort((a, b) => {
        const cmp = (a.company_name || '').localeCompare(b.company_name || '');
        return quoteSortOrder === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [quotes, quoteSearchQuery, quoteCompanyFilter, quoteAmountFilter, quoteSortField, quoteSortOrder]);

  const hasActiveQuoteFilters =
    Boolean(quoteSearchQuery.trim()) ||
    quoteCompanyFilter !== 'ALL' ||
    quoteAmountFilter !== 'ALL' ||
    quoteSortField !== 'default';

  const handleResetQuoteFilters = () => {
    setQuoteSearchQuery('');
    setQuoteCompanyFilter('ALL');
    setQuoteAmountFilter('ALL');
    setQuoteSortField('default');
    setQuoteSortOrder('desc');
    setQuotePage(1);
  };

  const handleToggleQuoteSort = (field: 'quote_no' | 'amount' | 'company') => {
    if (quoteSortField === field) {
      if (quoteSortOrder === 'desc') {
        setQuoteSortOrder('asc');
      } else {
        setQuoteSortField('default');
        setQuoteSortOrder('desc');
      }
    } else {
      setQuoteSortField(field);
      setQuoteSortOrder('desc');
    }
    setQuotePage(1);
  };

  const quoteTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredQuotes.length / quotePageSize));
  }, [filteredQuotes.length, quotePageSize]);

  const handleQuotePageSizeChange = (newSize: number) => {
    setQuotePageSize(newSize);
    setQuotePage(1);
  };

  const getQuotePageNumbers = () => {
    const maxButtons = 5;
    let start = Math.max(1, quotePage - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;

    if (end > quoteTotalPages) {
      end = quoteTotalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  useEffect(() => {
    if (quotePage > quoteTotalPages) {
      setQuotePage(1);
    }
  }, [quoteTotalPages, quotePage]);

  const paginatedQuotes = useMemo(() => {
    const startIdx = (quotePage - 1) * quotePageSize;
    return filteredQuotes.slice(startIdx, startIdx + quotePageSize);
  }, [filteredQuotes, quotePage, quotePageSize]);

  const handleDownloadExcel = async (quoteId: string, quoteNo: string) => {
    setDownloadingQuoteId(quoteId);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/export-excel`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || '엑셀 다운로드에 실패했습니다. (승인 완료된 견적서만 출력 가능합니다)');
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
      // 확인창 없이 즉시 삭제 실행 (토스트에서 복원 링크 제공)
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
      {/* 버티컬 북마크 견출 탭 (펼치기) */}
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
      <div className={`flex items-start transition-all duration-200 ${isSidebarOpen ? 'gap-1' : 'gap-0'}`}>
        {/* LEFT SIDEBAR: Pipeline & KPI Control Tower */}
        {isSidebarOpen && (
          <aside className="w-80 shrink-0 bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-col sticky top-4 relative z-20 h-[calc(100vh-5rem)]">
            {/* 버티컬 북마크 견출 탭 (접기) */}
            <SidebarBookmarkTab
              mode="collapse"
              onClick={handleToggleSidebar}
              label="접기"
              title="관제탑 접기"
            />

            {/* Sidebar Header with Unified Tab Style Collapse Button */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
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

            {/* Scrollable Sidebar Body */}
            <div className="overflow-y-auto space-y-3.5 flex-1 pr-1 pt-3.5">
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

            {/* Smart Pipeline Vertical Navigation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>스마트 견적 파이프라인</span>
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

              <div className="space-y-1 text-xs">
                {/* Stage 0: 도면 대기 (사전 접수) */}
                <button
                  type="button"
                  onClick={() => {
                    setPipelineFilter((prev) => (prev === '0' ? 'ALL' : '0'));
                    setCasePage(1);
                  }}
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '0'
                      ? 'border-slate-500 bg-slate-100/80 ring-2 ring-slate-400/30 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-slate-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      0
                    </span>
                    <div>
                      <div className="font-extrabold text-slate-900">도면 대기 (사전접수)</div>
                      <div className="text-[10px] text-slate-400">도면 파일 미첨부 의뢰</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pipelineCounts['0'] > 0 ? 'bg-slate-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-400'}`}>
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
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
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
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
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
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
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
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
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
                  className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    pipelineFilter === '5'
                      ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">5</span>
                    <div>
                      <div className="font-extrabold text-slate-900">공식 견적서 발행</div>
                      <div className="text-[10px] text-slate-400">견적채번 완료 및 엑셀</div>
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
                    <span className="text-[10px] font-bold text-emerald-600">
                      공식 {quotes.filter((q) => ['APPROVED', 'ISSUED'].includes(q.status) && Number(q.total_amount || 0) > 0).length}건 발행
                    </span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    ₩{stats.totalQuoteAmount.toLocaleString()}
                  </div>
                  <div className="text-[9.5px] text-slate-400 mt-1 flex items-center justify-between border-t border-slate-200/60 pt-1">
                    <span>초안(단가 미확정): <strong className="text-amber-600 font-bold">{quotes.filter((q) => q.status === 'DRAFT' || Number(q.total_amount || 0) === 0).length}건</strong></span>
                    <span>승인확정: <strong className="text-emerald-700 font-mono">₩{stats.approvedQuoteAmount.toLocaleString()}</strong></span>
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
                    <span>견적서 관리 대장</span>
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
                    <span>표준 단가·임률 관리</span>
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
                        <span>고객사(발주처) 관리 센터</span>
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
          </div>
        </aside>
      )}

        {/* RIGHT MAIN WORKSPACE: Cases Table & Recent Quotes (Maximized Height, Zero Scroll!) */}
        <div className="flex-1 min-w-0 space-y-1">
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
                      ? 'bg-blue-400 text-slate-950 ring-2 ring-blue-300'
                      : 'bg-white/10 text-blue-200 hover:bg-white/20 border border-white/20'
                  }`}
                  title="도면 미첨부로 분석 대기 중인 의뢰건만 필터링"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-300" />
                  <span>도면 대기 <strong>{pipelineCounts['0']}건</strong></span>
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
              {caseFilter === 'MY' ? (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <User className="w-3 h-3 text-blue-600" />
                  <span>{user?.name || '담당자'} 담당 관제</span>
                </span>
              ) : (
                <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Building2 className="w-3 h-3 text-indigo-600" />
                  <span>전사 총괄 관제</span>
                </span>
              )}
              {pipelineFilter !== 'ALL' && (
                <span className="text-[11px] font-extrabold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs animate-in fade-in">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  <span>
                    {pipelineFilter === '0' && '도면 대기 (사전접수) 필터링'}
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
                    className="ml-1 text-slate-500 hover:text-slate-900 bg-white/80 hover:bg-white px-1.5 py-0.2 rounded border border-blue-200 text-[10px] font-black cursor-pointer transition-colors"
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
                ? `상단 스마트 파이프라인에서 [${PIPELINE_STAGE_LABELS[pipelineFilter] || `${pipelineFilter}단계`}]를 선택하여 해당 진행 상태의 건만 집중 모니터링 중입니다.`
                : caseFilter === 'MY'
                ? `${user?.name || '담당자'} 담당자님이 진행 중인 활성 견적 건입니다. (총 ${myCasesCount}건)`
                : `현재 시스템에서 진행 중인 전사 활성 견적 건입니다. (총 ${activeCases.length}건)`}
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
                전사 현황 ({activeCases.length})
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
            {pipelineFilter !== 'ALL' ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <Filter className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm font-extrabold text-slate-800">
                  선택하신 [{PIPELINE_STAGE_LABELS[pipelineFilter] || `${pipelineFilter}단계`}] 단계의 의뢰 건이 없습니다.
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {caseFilter === 'MY'
                    ? '현재 내 담당 프로젝트 중 해당 파이프라인 단계에 머물러 있는 건이 없습니다. 필터를 해제하여 다른 진행 건을 확인하세요.'
                    : '현재 시스템의 전사 활성 프로젝트 중 해당 파이프라인 단계에 머물러 있는 건이 없습니다.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPipelineFilter('ALL');
                      setCasePage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-sm cursor-pointer transition-all"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>필터 해제 (전체 단계 보기)</span>
                  </button>
                  {caseFilter === 'MY' && activeCases.length > myActiveCases.length && (
                    <button
                      type="button"
                      onClick={() => {
                        setCaseFilter('ALL');
                        setCasePage(1);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>전사 현황에서 보기 ({activeCases.length}건)</span>
                    </button>
                  )}
                  {pipelineFilter === '0' && (
                    <button
                      type="button"
                      onClick={handleOpenUploadModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-all cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3] text-blue-600" />
                      <span>신규 도면 견적 등록</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold">
                  {caseFilter === 'MY'
                    ? `${user?.name || '담당자'} 담당자님이 진행 중인 활성 견적의뢰 건이 없습니다.`
                    : '등록되어 진행 중인 견적의뢰가 없습니다.'}
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
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible pb-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-bold text-center w-16 text-slate-500">No.</th>
                  <th className="py-3 px-4 font-bold">의뢰번호 / 명칭</th>
                  <th className="py-3 px-4 font-bold">고객사</th>
                  <th className="py-3 px-4 font-bold">견적 담당자</th>
                  <th className="py-3 px-4 font-bold">도면 구조 / BOM (다품일도)</th>
                  <th className="py-3 px-4 font-bold text-right">견적금액</th>
                  <th className="py-3 px-4 font-bold text-center">진행 / 보관 상태</th>
                  <th className="py-3 px-4 font-bold text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCases.map((c, idx) => {
                  const uid = user?.userId || user?.id; const isOwner = user && ((uid && c.created_by_user_id === uid) || (user.name && c.created_by_name === user.name));
                  const isDeleted = isCaseDeleted(c);
                  const isArchived = isCaseArchived(c);
                  const companyDisplay = c.company_name === '1' ? '미등록 고객사' : (c.company_name || '고객사 미지정');
                  const globalIdx = (casePage - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => !isDeleted && router.push(`/cases/${c.id}`)}
                      className={`relative transition-all duration-150 cursor-pointer group border-l-4 ${
                        isDeleted || isArchived
                          ? 'bg-slate-50/50 hover:bg-slate-100/80 border-l-transparent text-slate-500'
                          : 'bg-white hover:bg-slate-100/90 border-l-transparent hover:border-l-blue-600'
                      }`}
                    >
                      {/* 0. No. 순번 */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-xs text-slate-400 group-hover:text-blue-600 transition-colors w-16">
                        {String(globalIdx).padStart(2, '0')}
                      </td>
                      {/* 1. 의뢰번호 / 명칭 */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-slate-500 group-hover:text-blue-700 font-bold block transition-colors">{c.case_no}</span>
                        <div className="mt-1 flex items-center gap-1.5 min-w-0">
                          {c.primary_file_name?.toLowerCase().endsWith('.dwg') ? (
                            <span className="shrink-0 px-1 py-0.2 rounded text-[9.5px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                              DWG
                            </span>
                          ) : c.primary_file_name?.toLowerCase().endsWith('.dxf') ? (
                            <span className="shrink-0 px-1 py-0.2 rounded text-[9.5px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                              DXF
                            </span>
                          ) : null}
                          <SmartTruncateTooltip
                            text={
                              c.primary_file_name
                                ? (c.files_count && c.files_count > 1 ? `${c.primary_file_name} 외 ${c.files_count - 1}건` : c.primary_file_name)
                                : (c.case_name || '도면 견적의뢰')
                            }
                            className={`font-bold text-xs ${
                              isDeleted ? 'text-slate-500 line-through' : 'text-slate-800 group-hover:text-blue-700'
                            }`}
                            maxWidthClass="max-w-[280px] 2xl:max-w-[380px]"
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
                            <span>{c.created_by_name || user?.name || '담당자'}</span>
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
                        ) : isArchived ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              보관완료
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                              보관함 격리
                            </span>
                          </div>
                        ) : c.quote_total_amount && Number(c.quote_total_amount) > 0 ? (
                          <div className="relative group/status flex flex-col items-center">
                            <Link
                              href="/quotes"
                              className="flex flex-col items-center group cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-emerald-50 group-hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                5/5 견적발행
                              </span>
                              <span className="text-[10px] text-emerald-600 font-bold mt-0.5 group-hover:underline flex items-center gap-0.5">
                                <span>공식 견적서 채번</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </Link>

                            {/* 💡 호버 안내 카드 */}
                            <div className="hidden group-hover/status:flex flex-col absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-64 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 text-left pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-slate-900 flex items-center gap-1.5">
                                  <span>📌</span> 다음 기능 안내
                                </span>
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800">
                                  5단계 : 발행완료
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] text-slate-600">
                                <div>• 공식 견적서 채번 및 단가 확정 완료</div>
                                <div className="text-slate-800 font-bold">👉 클릭 시 [견적서 관리 대장]으로 이동하여 공식 엑셀 다운로드 및 [변경비교]를 진행합니다.</div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-300"></div>
                            </div>
                          </div>
                        ) : c.bom_items_count > 0 ? (
                          <div className="relative group/status flex flex-col items-center">
                            <Link
                              href={`/quotes/${c.id}/review`}
                              className="flex flex-col items-center group cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 group-hover:bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                4/5 단가검토 대기
                              </span>
                              <span className="text-[10px] text-amber-700 font-semibold mt-0.5 group-hover:underline flex items-center gap-0.5">
                                <span>단가 확정 필요 ({c.bom_items_count}건)</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </Link>

                            {/* 💡 마우스 호버 시 다음 단계 안내 카드 */}
                            <div className="hidden group-hover/status:flex flex-col absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-72 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 text-left pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-slate-900 flex items-center gap-1.5">
                                  <span>📌</span> 다음 진행 단계 가이드
                                </span>
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                                  4단계 : 단가검토
                                </span>
                              </div>
                              <div className="space-y-1.5 text-[11px] text-slate-600">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-600 font-bold">✔</span>
                                  <span>도면 분석 완료: <strong>BOM {c.bom_items_count}개 품목</strong> 추출됨</span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-blue-600 font-bold">👉</span>
                                  <span className="text-slate-800 font-bold">클릭 시 [단가 검토 화면]으로 이동</span>
                                </div>
                                <div className="pl-3.5 text-[10px] text-slate-500 space-y-0.5 border-l-2 border-indigo-200 my-1">
                                  <div>• <strong>[⚡ AI 공학원가 산출]</strong> 버튼으로 단가 자동 계산</div>
                                  <div>• 사내 마스터 단가 대조 및 비도면 부대비용 추가</div>
                                  <div>• <strong>[결재 상신]</strong> 누르면 5단계 견적서 즉시 발행</div>
                                </div>
                              </div>
                              <div className="mt-2 pt-1.5 border-t border-slate-100 text-center">
                                <span className="text-[10.5px] font-extrabold text-indigo-600">
                                  클릭하여 단가 검토 및 산출 시작하기 →
                                </span>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-300"></div>
                            </div>
                          </div>
                        ) : c.drawings_count > 0 ? (
                          <div className="relative group/status flex flex-col items-center">
                            <Link
                              href={`/cases/${c.id}`}
                              className="flex flex-col items-center group cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 group-hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-2xs transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                2/5 AI파싱
                              </span>
                              <span className="text-[10px] text-indigo-600 font-medium mt-0.5 group-hover:underline flex items-center gap-0.5">
                                <span>도면 {c.drawings_count}매 추출</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </Link>

                            <div className="hidden group-hover/status:flex flex-col absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-64 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 text-left pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-slate-900 flex items-center gap-1.5">
                                  <span>📌</span> 다음 기능 안내
                                </span>
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-indigo-100 text-indigo-800">
                                  2단계 : 파싱완료
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] text-slate-600">
                                <div>• 도면 {c.drawings_count}매 외곽선 및 도곽 감지 완료</div>
                                <div className="text-slate-800 font-bold">👉 클릭 시 3단계 [가상 BOM 추출 및 풍선기호 검증] 화면으로 이동합니다.</div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-300"></div>
                            </div>
                          </div>
                        ) : c.files_count && c.files_count > 0 ? (
                          <div className="relative group/status flex flex-col items-center">
                            <Link
                              href={`/cases/${c.id}`}
                              className="flex flex-col items-center group cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 group-hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                1/5 도면접수
                              </span>
                              <span className="text-[10px] text-blue-600 font-medium mt-0.5 group-hover:underline flex items-center gap-0.5">
                                <span>AI 분석 대기중</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </Link>

                            <div className="hidden group-hover/status:flex flex-col absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-64 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 text-left pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-slate-900 flex items-center gap-1.5">
                                  <span>📌</span> 다음 기능 안내
                                </span>
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-blue-100 text-blue-800">
                                  1단계 : 접수완료
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] text-slate-600">
                                <div>• 도면 파일 업로드 완료</div>
                                <div className="text-slate-800 font-bold">👉 클릭 시 2단계 [AI 도면 분석 및 파싱]을 즉시 시작합니다.</div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-300"></div>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group/status flex flex-col items-center">
                            <Link
                              href={`/cases/${c.id}?step=1`}
                              className="flex flex-col items-center group cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 group-hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                사전접수 (도면대기)
                              </span>
                              <span className="text-[10px] text-amber-600 font-medium mt-0.5 group-hover:underline flex items-center gap-0.5">
                                <span>도면 미첨부 상태</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </Link>

                            <div className="hidden group-hover/status:flex flex-col absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-64 bg-white rounded-xl shadow-2xl border border-slate-300 p-3 text-left pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-slate-900 flex items-center gap-1.5">
                                  <span>📌</span> 다음 기능 안내
                                </span>
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                                  도면 등록 필요
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] text-slate-600">
                                <div>• 견적의뢰 기본 정보 등록 완료</div>
                                <div className="text-slate-800 font-bold">👉 클릭 시 [DWG / DXF 도면 파일 업로드] 화면으로 이동합니다.</div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-300"></div>
                            </div>
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
                        ) : isArchived ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[11px] text-slate-400 font-medium">보관 상태</span>
                            <Link
                              href={`/cases/${c.id}`}
                              className="p-1 text-slate-400 group-hover:text-blue-600 transition-colors"
                              title="보관 상세 조회"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </div>
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
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 via-white to-white shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>최근 견적서 관리</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  총 {quotes.length}건 (초안 {quotes.filter((q) => q.status === 'DRAFT' || Number(q.total_amount || 0) === 0).length}건 / 공식발행 {quotes.filter((q) => ['APPROVED', 'ISSUED'].includes(q.status) && Number(q.total_amount || 0) > 0).length}건)
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                도면 분석 후 생성된 견적서 목록입니다. (0원 초안은 [단가검토]에서 금액을 확정해야 공식 승인 및 엑셀 출력이 가능합니다)
              </p>
            </div>
          </div>
          <Link
            href="/quotes"
            prefetch={true}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer shadow-2xs"
            title="발행된 모든 견적서 전체 관리 대장으로 이동"
          >
            <span>견적서대장 전체보기</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Quick Filter Toolbar for Recent Quotes */}
        {quotes.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. 견적번호 / 케이스명 검색창 */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={quoteSearchQuery}
                  onChange={(e) => {
                    setQuoteSearchQuery(e.target.value);
                    setQuotePage(1);
                  }}
                  placeholder="견적번호 / 케이스명 검색"
                  className="w-full pl-8 pr-6 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                />
                {quoteSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuoteSearchQuery('');
                      setQuotePage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* 2. 고객사 필터 드롭다운 */}
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 text-[11px] font-bold flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  고객사:
                </span>
                <select
                  value={quoteCompanyFilter}
                  onChange={(e) => {
                    setQuoteCompanyFilter(e.target.value);
                    setQuotePage(1);
                  }}
                  className={`px-2 py-1 bg-white border rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors ${
                    quoteCompanyFilter !== 'ALL'
                      ? 'border-emerald-500 text-emerald-800 bg-emerald-50/50 font-bold'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <option value="ALL">전체 고객사 ({quotes.length}건)</option>
                  {availableQuoteCompanies.map((c) => {
                    const cnt = quotes.filter((q) => (q.company_name || '미지정 고객사') === c).length;
                    return (
                      <option key={c} value={c}>
                        {c} ({cnt}건)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 3. 견적 총액 조건 필터 드롭다운 */}
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 text-[11px] font-bold flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-slate-400" />
                  금액:
                </span>
                <select
                  value={quoteAmountFilter}
                  onChange={(e) => {
                    setQuoteAmountFilter(e.target.value);
                    setQuotePage(1);
                  }}
                  className={`px-2 py-1 bg-white border rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors ${
                    quoteAmountFilter !== 'ALL'
                      ? 'border-emerald-500 text-emerald-800 bg-emerald-50/50 font-bold'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <option value="ALL">전체 금액</option>
                  <option value="POSITIVE">₩0 초과 (단가 산출 완료)</option>
                  <option value="ZERO">₩0 (초안 / 미산출)</option>
                </select>
              </div>

              {/* 필터 초기화 버튼 */}
              {hasActiveQuoteFilters && (
                <button
                  type="button"
                  onClick={handleResetQuoteFilters}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-all flex items-center space-x-1 shadow-2xs cursor-pointer"
                  title="모든 필터 및 정렬 초기화"
                >
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>필터 초기화</span>
                </button>
              )}
            </div>

            {/* 현재 필터링 상태 요약 */}
            <div className="text-[11px] text-slate-500">
              {hasActiveQuoteFilters ? (
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  필터링 결과: {filteredQuotes.length}건
                </span>
              ) : (
                <span>전체 {quotes.length}건 보관</span>
              )}
            </div>
          </div>
        )}

        {quotes.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold">발행된 견적서가 아직 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">도면 의뢰건에서 [최종 견적서 즉시 산출]을 실행해보세요.</p>
            <Link
              href="/cases"
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>견적의뢰에서 견적서 생성하기</span>
            </Link>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">선택한 필터 조건에 일치하는 견적서가 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">검색어나 고객사, 금액 필터 조건을 변경해보세요.</p>
            <button
              type="button"
              onClick={handleResetQuoteFilters}
              className="mt-3 inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>모든 필터 초기화</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[500px] 2xl:max-h-[620px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-2xs">
                <tr className="text-slate-600 font-bold">
                  <th className="py-2.5 px-4 font-bold text-center w-16 bg-slate-50">No.</th>
                  <th
                    onClick={() => handleToggleQuoteSort('quote_no')}
                    className="py-2.5 px-4 font-bold bg-slate-50 cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="견적번호 기준 정렬 (클릭)"
                  >
                    <div className="flex items-center space-x-1">
                      <span>견적번호 / 버전</span>
                      <span className={`text-[10px] ${quoteSortField === 'quote_no' ? 'text-emerald-700 font-black' : 'text-slate-300 group-hover:text-slate-500'}`}>
                        {quoteSortField === 'quote_no' ? (quoteSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th className="py-2.5 px-4 font-bold bg-slate-50">연동 케이스명</th>
                  <th
                    onClick={() => handleToggleQuoteSort('company')}
                    className="py-2.5 px-4 font-bold bg-slate-50 cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="고객사 이름순 정렬 (클릭)"
                  >
                    <div className="flex items-center space-x-1">
                      <span>고객사</span>
                      <span className={`text-[10px] ${quoteSortField === 'company' ? 'text-emerald-700 font-black' : 'text-slate-300 group-hover:text-slate-500'}`}>
                        {quoteSortField === 'company' ? (quoteSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th className="py-2.5 px-4 font-bold text-center bg-slate-50">품목 수</th>
                  <th
                    onClick={() => handleToggleQuoteSort('amount')}
                    className="py-2.5 px-4 font-bold text-right bg-slate-50 cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="견적 금액순 정렬 (클릭)"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>견적 총액 (VAT포함)</span>
                      <span className={`text-[10px] ${quoteSortField === 'amount' ? 'text-emerald-700 font-black' : 'text-slate-300 group-hover:text-slate-500'}`}>
                        {quoteSortField === 'amount' ? (quoteSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th className="py-2.5 px-4 font-bold text-center bg-slate-50">상태</th>
                  <th className="py-2.5 px-4 font-bold text-center bg-slate-50">원클릭 엑셀</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedQuotes.map((q, idx) => {
                  const globalIdx = (quotePage - 1) * quotePageSize + idx + 1;
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
                      className="relative transition-all duration-150 group border-l-4 border-l-transparent hover:border-l-emerald-600 hover:bg-emerald-50/30"
                    >
                      <td className="py-3 px-4 text-center font-mono font-bold text-xs text-slate-400 group-hover:text-emerald-700 transition-colors w-16">
                        {String(globalIdx).padStart(2, '0')}
                      </td>
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
                          {q.quote_date || (q.created_at ? new Date(q.created_at).toLocaleDateString('ko-KR') : '-')}
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
                        <div className="flex items-center justify-center space-x-1.5">
                          {Number(q.total_amount || 0) > 0 && ['APPROVED', 'ISSUED'].includes(q.status) ? (
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
                          ) : (
                            <Link
                              href={`/quotes/${q.quotation_case_id}/review`}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-bold border border-amber-300 transition-all shadow-2xs cursor-pointer"
                              title="단가가 0원인 임시저장(초안) 견적서입니다. 단가검토 화면에서 금액을 확정하세요."
                            >
                              <span>단가검토</span>
                              <ChevronRight className="w-3 h-3 text-amber-600" />
                            </Link>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteQuoteClick(q.id, q.quote_no)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                            title="견적서 영구 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Standard Pagination Navigation Bar (중앙 정렬 배치 & 프로젝트 표준 로직) */}
        {filteredQuotes.length > 0 && (
          <div className="py-3.5 px-5 border-t border-slate-200/90 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-6 text-xs text-slate-500 shrink-0">
            {/* 중앙 번호 네비게이션 버튼 그룹 */}
            <div className="flex items-center space-x-1">
              {/* 이전 페이지 버튼 */}
              <button
                type="button"
                onClick={() => setQuotePage((p) => Math.max(1, p - 1))}
                disabled={quotePage <= 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                title="이전 페이지"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>이전</span>
              </button>

              {/* 페이지 번호 버튼 목록 */}
              {getQuotePageNumbers().map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setQuotePage(pageNum)}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    quotePage === pageNum
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              {/* 다음 페이지 버튼 */}
              <button
                type="button"
                onClick={() => setQuotePage((p) => Math.min(quoteTotalPages, p + 1))}
                disabled={quotePage >= quoteTotalPages}
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
                총 <strong className="text-slate-900 font-bold">{filteredQuotes.length}</strong>건 중{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {filteredQuotes.length === 0 ? 0 : (quotePage - 1) * quotePageSize + 1} -{' '}
                  {Math.min(filteredQuotes.length, quotePage * quotePageSize)}
                </span>
                건 표시
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 text-[11.5px]">페이지당 행 수:</span>
                <select
                  value={quotePageSize}
                  onChange={(e) => handleQuotePageSizeChange(Number(e.target.value))}
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

              {/* 1. 최우선 메인: CAD 도면 파일 업로드 (드래그 앤 드롭 영역) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <FileCode2 className="w-4 h-4 text-blue-600" />
                    <span>CAD 도면 파일 첨부</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  {selectedFile && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>도면 파일 첨부 완료</span>
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
                      handleFileChange(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                      : selectedFile
                      ? 'border-emerald-500 bg-emerald-50/30'
                      : 'border-blue-300 hover:border-blue-500 bg-blue-50/10 hover:bg-blue-50/30 shadow-xs'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dwg,.dxf,.zip"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                            <FileCode2 className="w-6 h-6 text-emerald-600" />
                          </div>
                          <div className="text-left min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{selectedFile.name}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                              <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB • CAD 원본 도면</span>
                              <span className="text-slate-300 hidden sm:inline">|</span>
                              <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                                <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span>표제란 AI 자동 판독 준비</span>
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            setNewCaseName('');
                          }}
                          className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          title="다른 파일로 변경"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-100/70 text-blue-600 flex items-center justify-center mx-auto mb-3">
                        <UploadCloud className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-extrabold text-slate-800">
                        DWG / DXF 도면 파일을 끌어다 놓으세요
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        클릭하여 파일 선택 (최대 200MB)
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-700">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>도면 표제란(Title Block) 기반 100% 자동 채번</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 스마트 사전 채번 정보 (선택적 확인/수정 영역) */}
              <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                  <span>자동 채번 사전 확인 (필요 시 수정 가능)</span>
                  <span className="text-[10px] text-slate-400">비워두면 도면 분석 후 자동 반영됩니다</span>
                </div>

                {/* 견적의뢰 건명 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    견적의뢰 건명 <span className="text-slate-400 font-normal">(도면 파일명 기반 자동 채번)</span>
                  </label>
                  <input
                    type="text"
                    value={newCaseName}
                    onChange={(e) => setNewCaseName(e.target.value)}
                    placeholder="도면 첨부 시 파일명으로 자동 입력됩니다"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 bg-white"
                  />
                </div>

                {/* 발주 고객사 (의뢰처) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    발주 고객사 (의뢰처) <span className="text-slate-400 font-normal">(도면 표제란 자동 판독 권장)</span>
                  </label>
                  <CustomerSelectCombobox
                    companies={customerCompanies}
                    value={customerSelection}
                    onChange={(val) => {
                      setCustomerSelection(val);
                      if (val.companyId) {
                        setSelectedCompanyId(val.companyId);
                      }
                    }}
                    placeholder="도면 표제란에서 자동 감지 (또는 특정 고객사 지정)..."
                  />
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!selectedFile && !isSampleMode)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedFile
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30 ring-2 ring-blue-500/20'
                      : isSampleMode
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                      : 'bg-slate-400'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>도면 분석 파이프라인 가동 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ 도면 분석 및 견적 등록 시작</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
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
