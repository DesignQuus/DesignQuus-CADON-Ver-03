'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import CaseWorkflowSidebar, { WorkflowTab } from '@/components/cases/CaseWorkflowSidebar';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';
import SidebarBookmarkTab from '@/components/common/SidebarBookmarkTab';
import { useRouter } from 'next/navigation';
import { getClientCache, setClientCache, isCacheFresh } from '@/lib/cacheStore';
import {
  FileText,
  Plus,
  Search,
  Building2,
  Folder,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  UploadCloud,
  FileCode2,
  Zap,
  Sliders,
  DollarSign,
  FileSpreadsheet,
  DownloadCloud,
  Layers,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  CheckSquare,
  Square,
  Minus,
  X,
  User,
  Users,
  Archive,
  Trash2,
  RotateCcw,
  Trash,
  AlertTriangle,
  Filter,
  Sparkles,
  Loader2
} from 'lucide-react';

type SortField = 'date' | 'amount' | 'drawings' | 'bom' | 'case_no' | 'case_name';
type SortDirection = 'asc' | 'desc';

interface ManagerTheme {
  bg: string;
  text: string;
  border: string;
  badge: string;
  dept: string;
  initial: string;
}

const THEME_PALETTES: ManagerTheme[] = [
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-600 text-white', dept: '견적팀', initial: '견' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-600 text-white', dept: '견적팀', initial: '견' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-600 text-white', dept: '견적팀', initial: '견' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', badge: 'bg-indigo-600 text-white', dept: '견적팀', initial: '견' },
  { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', badge: 'bg-amber-600 text-white', dept: '견적팀', initial: '견' }
];

function getManagerTheme(userId: string, userName?: string): ManagerTheme {
  if (userId === 'usr_admin') {
    return {
      bg: 'bg-slate-100',
      text: 'text-slate-800',
      border: 'border-slate-300',
      badge: 'bg-slate-700 text-white',
      dept: '운영총괄',
      initial: '관'
    };
  }
  let hash = 0;
  for (let i = 0; i < (userId || '').length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
  }
  const theme = THEME_PALETTES[Math.abs(hash) % THEME_PALETTES.length];
  return {
    ...theme,
    initial: userName ? userName.slice(0, 1) : '👤'
  };
}

// Korean Chosung Search Helper
const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function getChosung(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xac00;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG_LIST[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

function matchHangulSearch(target: string, query: string): boolean {
  if (!target) return false;
  const lowerTarget = target.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return true;
  if (lowerTarget.includes(lowerQuery)) return true;
  const chosungTarget = getChosung(lowerTarget);
  const chosungQuery = getChosung(lowerQuery);
  return chosungTarget.includes(chosungQuery);
}

function getRemainingTrashDays(deletedAt: string | null | undefined): number {
  if (!deletedAt) return 30;
  const delTime = new Date(deletedAt).getTime();
  if (isNaN(delTime)) return 30;
  const expireTime = delTime + 30 * 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((expireTime - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(30, diffDays));
}

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState(false);
  const [caseName, setCaseName] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter & Search States
  const [selectedTab, setSelectedTab] = useState<'ALL' | 'READY_FOR_QUOTE' | 'ANALYZED' | 'PENDING' | 'PRIVATE_APPROVAL' | 'SECURE_VAULT' | 'ARCHIVED' | 'TRASHED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterManager, setFilterManager] = useState('ALL');
  const [filterCompany, setFilterCompany] = useState('ALL');

  // Lifecycle States (보관, 휴지통, 복원, 영구삭제)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveTargetIds, setArchiveTargetIds] = useState<string[]>([]);
  const [archiveReasonType, setArchiveReasonType] = useState('고객사 일정/품의 지연 (잠정 보류)');
  const [archiveCustomReason, setArchiveCustomReason] = useState('');
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  // Enterprise Sorting & Pagination States
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);

  // Persistent Sidebar Collapsed State (테이블 넓게 보기 지원 & 로컬스토리지 기억)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cadon_sidebar_collapsed');
      if (saved !== null) {
        setIsSidebarCollapsed(saved === 'true');
      }
    } catch {}

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['ALL', 'READY_FOR_QUOTE', 'ANALYZED', 'PENDING', 'PRIVATE_APPROVAL', 'SECURE_VAULT', 'ARCHIVED', 'TRASHED'].includes(tabParam)) {
        setSelectedTab(tabParam as any);
      }
    }
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('cadon_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // 신규 도면 견적 등록 표준 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isModalDragging, setIsModalDragging] = useState(false);
  const [isNewCompanyInput, setIsNewCompanyInput] = useState(false);
  const [newCustomCompanyName, setNewCustomCompanyName] = useState('');
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Drag & Drop Quick Upload States (Local & Global)
  const [isDragging, setIsDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const [quickUploadStatus, setQuickUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

  const handleOpenUploadModal = () => {
    setNewCaseName('');
    const defaultCust = customerCompanies[0]?.id || 'comp_1790030182693';
    setSelectedCompanyId(defaultCust);
    setSelectedFile(null);
    setSubmitError(null);
    setIsNewCompanyInput(false);
    setNewCustomCompanyName('');
    setIsUploadModalOpen(true);
  };

  const handleCreateCaseFromModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) {
      setSubmitError('견적의뢰 건명을 입력해 주세요.');
      return;
    }

    setIsSubmittingModal(true);
    setSubmitError(null);

    let targetCompId = selectedCompanyId;

    // 신규 고객사 직접 입력 처리
    if (isNewCompanyInput || selectedCompanyId === '__NEW__') {
      const trimmedCustom = newCustomCompanyName.trim();
      if (!trimmedCustom) {
        setSubmitError('신규 발주 고객사명을 입력해 주세요.');
        setIsSubmittingModal(false);
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
        setIsSubmittingModal(false);
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

      // 2. 도면 파일 첨부된 경우 업로드 및 자동 분석
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await apiFetch(`/api/quotation-cases/${newCaseId}/upload`, {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (uploadData?.file?.id) {
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

      setIsUploadModalOpen(false);
      setIsSubmittingModal(false);
      window.location.href = `/cases/${newCaseId}`;
    } catch (err: any) {
      setSubmitError(err.message || '견적 등록 중 오류가 발생했습니다.');
      setIsSubmittingModal(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await apiFetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        const compList = data.companies || [];
        setCompanies(compList);
        setClientCache('companies', data);
        if (compList.length > 0) {
          setCompanyId(compList[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch companies:', e);
    }
  };

  const fetchOperators = async () => {
    try {
      const res = await apiFetch('/api/operators');
      if (res.ok) {
        const data = await res.json();
        setOperators(data.operators || []);
        setClientCache('operators', data);
      }
    } catch (e) {
      console.error('Failed to fetch operators:', e);
    }
  };

  const fetchCases = async () => {
    try {
      const res = await apiFetch('/api/quotation-cases');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const list = data.cases || [];
        setCases(list);
        setClientCache('cases', data);
        try {
          localStorage.setItem('cadon_cached_cases', JSON.stringify(list));
        } catch {}
      }
    } catch {
      // 캐시가 없을 때만 빈 배열 처리
      setCases((prev) => (prev.length > 0 ? prev : []));
    } finally {
      setLoading(false);
    }
  };

  // Quick DWG Upload & Auto Case Creation Handler
  const handleQuickUploadFile = React.useCallback(async (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.dwg', '.dxf'].includes(ext)) {
      alert('CAD 도면 파일(.dwg 또는 .dxf)만 업로드할 수 있습니다.');
      return;
    }

    setQuickUploading(true);
    setQuickUploadStatus(`'${file.name}' 도면으로 신규 견적 프로젝트 생성 중...`);

    try {
      // 1. Create a new case automatically
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const autoCaseName = `${cleanName} 견적의뢰 (DWG 자동분석)`;
      const createRes = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'comp_unassigned',
          projectId: 'proj_unassigned',
          caseName: autoCaseName
        })
      });

      if (createRes.status === 401) {
        alert('로그인 세션이 만료되었습니다. 로그인 페이지로 이동합니다.');
        window.location.href = '/login';
        return;
      }
      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        throw new Error(errJson.error || '신규 견적 프로젝트 생성에 실패했습니다.');
      }
      const createData = await createRes.json();
      const newCaseId = createData.caseId;

      // 2. Upload the DWG file to the new case
      setQuickUploadStatus(`'${file.name}' DWG 도면 업로드 및 저장 중...`);
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await apiFetch(`/api/quotation-cases/${newCaseId}/upload`, {
        method: 'POST',
        body: formData
      });

      if (uploadRes.status === 401) {
        alert('로그인 세션이 만료되었습니다. 로그인 페이지로 이동합니다.');
        window.location.href = '/login';
        return;
      }
      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.json().catch(() => ({}));
        throw new Error(uploadErr.error || '도면 파일 업로드에 실패했습니다.');
      }
      const uploadJson = await uploadRes.json();

      // 3. Automatically analyze CAD drawing so WebGL binary & drawing sheets are fully generated!
      setQuickUploadStatus(`'${file.name}' CAD 도면 자동 분석 및 WebGL 렌더링 준비 중...`);
      try {
        await apiFetch(`/api/quotation-cases/${newCaseId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: uploadJson.file.id })
        });
      } catch (analyzeErr) {
        console.warn('Auto analysis warning:', analyzeErr);
      }

      // 4. Redirect to the case workbench
      setQuickUploadStatus('워크벤치로 이동 중...');
      router.push(`/cases/${newCaseId}`);
    } catch (err: any) {
      alert(err.message || '빠른 도면 등록 중 오류가 발생했습니다.');
      setQuickUploading(false);
    }
  }, [router]);

  // Multi-file DWG/DXF Batch Upload & Auto Case Creation Handler
  const handleBatchUploadFiles = React.useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return ['.dwg', '.dxf'].includes(ext);
    });

    if (validFiles.length === 0) {
      alert('업로드할 유효한 CAD 도면 파일(.dwg 또는 .dxf)이 없습니다.');
      return;
    }

    if (validFiles.length === 1) {
      return handleQuickUploadFile(validFiles[0]);
    }

    setQuickUploading(true);
    setQuickUploadStatus(`선택한 도면 ${validFiles.length}장으로 신규 통합 견적 프로젝트 생성 중...`);

    try {
      // 1. Create a new case automatically
      const firstCleanName = validFiles[0].name.replace(/\.[^/.]+$/, "");
      const autoCaseName = `${firstCleanName} 외 ${validFiles.length - 1}건 (도면 ${validFiles.length}장 일괄 분석)`;
      const createRes = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'comp_unassigned',
          projectId: 'proj_unassigned',
          caseName: autoCaseName
        })
      });

      if (!createRes.ok) {
        throw new Error('신규 견적 프로젝트 생성에 실패했습니다.');
      }
      const createData = await createRes.json();
      const newCaseId = createData.caseId;

      // 2. Upload all files sequentially
      const uploadedFileIds: string[] = [];
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setQuickUploadStatus(`도면 업로드 중... (${i + 1}/${validFiles.length}) - ${file.name}`);
        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await apiFetch(`/api/quotation-cases/${newCaseId}/upload`, {
          method: 'POST',
          body: formData
        });

        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          if (uploadJson?.file?.id) {
            uploadedFileIds.push(uploadJson.file.id);
          }
        }
      }

      // 3. Automatically analyze CAD drawings
      setQuickUploadStatus(`업로드된 도면 ${uploadedFileIds.length}장 AI BOM 자동 분석 및 렌더링 준비 중...`);
      for (let i = 0; i < uploadedFileIds.length; i++) {
        try {
          await apiFetch(`/api/quotation-cases/${newCaseId}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: uploadedFileIds[i] })
          });
        } catch (analyzeErr) {
          console.warn('Auto analysis warning for file:', uploadedFileIds[i], analyzeErr);
        }
      }

      // 4. Redirect to the case workbench
      setQuickUploadStatus('워크벤치로 이동 중...');
      router.push(`/cases/${newCaseId}`);
    } catch (err: any) {
      alert(err.message || '다중 도면 일괄 등록 중 오류가 발생했습니다.');
      setQuickUploading(false);
    }
  }, [handleQuickUploadFile, router]);

  useEffect(() => {
    // 클라이언트 마운트 즉시 캐시 복원 (Hydration 일치 및 0ms 즉시 렌더링)
    try {
      const cachedCases = getClientCache('cases')?.cases || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cadon_cached_cases') || 'null') : null);
      const cachedUser = getClientCache('user') || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cadon_user') || 'null') : null);
      const cachedCompanies = getClientCache('companies')?.companies;
      const cachedOperators = getClientCache('operators')?.operators;

      if (cachedCases && Array.isArray(cachedCases)) setCases(cachedCases);
      if (cachedUser) setUser(cachedUser);
      if (cachedCompanies && Array.isArray(cachedCompanies)) setCompanies(cachedCompanies);
      if (cachedOperators && Array.isArray(cachedOperators)) setOperators(cachedOperators);
    } catch {}

    // 비동기 요청들을 완전 병렬로 동시 실행
    Promise.all([
      fetchCases(),
      fetchCompanies(),
      fetchOperators(),
      apiFetch('/api/auth/me')
        .then((res) => (res.ok ? res.json() : { user: null }))
        .then((data) => {
          if (data.user) {
            setUser(data.user);
            setClientCache('user', data.user);
            try { localStorage.setItem('cadon_user', JSON.stringify(data.user)); } catch {}
            if (!['TENANT_ADMIN', 'SUPER_ADMIN'].includes(data.user.role)) {
              // 일반 견적 담당자는 로그인 시 '내 담당건' 필터로 기본 적용
              setFilterManager(data.user.userId);
            } else {
              setFilterManager('ALL');
            }
          }
        })
        .catch(() => {})
    ]);

    // 전역 윈도우 드래그 앤 드롭 감지
    let dragCounter = 0;
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setGlobalDragging(true);
      }
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        setGlobalDragging(false);
        dragCounter = 0;
      }
    };
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setGlobalDragging(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (e.dataTransfer.files.length > 1) {
          handleBatchUploadFiles(e.dataTransfer.files);
        } else {
          handleQuickUploadFile(e.dataTransfer.files[0]);
        }
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleQuickUploadFile, handleBatchUploadFiles]);

  // Lifecycle Action Handlers
  const openArchiveModal = (ids: string[]) => {
    setArchiveTargetIds(ids);
    setArchiveReasonType('고객사 일정/품의 지연 (잠정 보류)');
    setArchiveCustomReason('');
    setArchiveModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (archiveTargetIds.length === 0) return;
    const finalReason = archiveReasonType === 'CUSTOM' ? (archiveCustomReason.trim() || '기타 보관') : archiveReasonType;
    setLifecycleLoading(true);
    try {
      const res = await apiFetch('/api/quotation-cases/bulk-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: archiveTargetIds,
          action: 'ARCHIVE',
          reason: finalReason
        })
      });
      if (res.ok) {
        setArchiveModalOpen(false);
        setSelectedCaseIds(prev => prev.filter(id => !archiveTargetIds.includes(id)));
        await fetchCases();
      } else {
        const d = await res.json();
        alert(d.error || '보관 처리 실패');
      }
    } catch (err: any) {
      alert('보관 처리 중 오류: ' + err.message);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleTrashCases = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}건의 견적 건을 휴지통으로 이동하시겠습니까?\n(30일간 보관 후 완전 삭제되며, 언제든 복원할 수 있습니다.)`)) {
      return;
    }
    setLifecycleLoading(true);
    try {
      const res = await apiFetch('/api/quotation-cases/bulk-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: ids,
          action: 'TRASH'
        })
      });
      if (res.ok) {
        setSelectedCaseIds(prev => prev.filter(id => !ids.includes(id)));
        await fetchCases();
      } else {
        const d = await res.json();
        alert(d.error || '휴지통 이동 실패');
      }
    } catch (err: any) {
      alert('휴지통 이동 중 오류: ' + err.message);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleRestoreCases = async (ids: string[]) => {
    if (ids.length === 0) return;
    setLifecycleLoading(true);
    try {
      const res = await apiFetch('/api/quotation-cases/bulk-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: ids,
          action: 'RESTORE'
        })
      });
      if (res.ok) {
        setSelectedCaseIds(prev => prev.filter(id => !ids.includes(id)));
        await fetchCases();
      } else {
        const d = await res.json();
        alert(d.error || '복원 실패');
      }
    } catch (err: any) {
      alert('복원 처리 중 오류: ' + err.message);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handlePermanentDeleteCases = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`⚠️ 경고: 선택한 ${ids.length}건을 완전 영구 삭제하시겠습니까?\n모든 도면 파일 및 BOM 산출 데이터가 복구 불가능하게 삭제됩니다.`)) {
      return;
    }
    setLifecycleLoading(true);
    try {
      const res = await apiFetch('/api/quotation-cases/bulk-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: ids,
          action: 'PERMANENT_DELETE'
        })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setSelectedCaseIds(prev => prev.filter(id => !ids.includes(id)));
        await fetchCases();

        if (d.skippedCount > 0 && d.processedCount > 0) {
          alert(`선택한 ${d.totalRequested}건 중 ${d.processedCount}건이 영구 삭제되었습니다.\n\n⚠️ 제외된 ${d.skippedCount}건: 타 담당자의 보안 견적건으로 최고관리자(admin) 계정 권한이 필요하여 보존되었습니다.`);
        } else if (d.skippedCount > 0 && d.processedCount === 0) {
          alert(`영구 삭제할 수 없습니다.\n\n⚠️ ${d.skippedItems?.[0]?.reason || '타 담당자의 견적건은 본인 작성자 또는 최고관리자만 영구 삭제할 수 있습니다.'}`);
        }
      } else {
        alert(d.error || '영구 삭제 실패');
      }
    } catch (err: any) {
      alert('영구 삭제 중 오류: ' + err.message);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const [exportingExcel, setExportingExcel] = useState(false);

  const handleBulkExportExcel = async (targetCaseIds?: string[]) => {
    const ids = targetCaseIds && targetCaseIds.length > 0 ? targetCaseIds : selectedCaseIds;
    if (!ids || ids.length === 0) {
      alert('일괄 엑셀 다운로드할 견적건을 선택해주세요.');
      return;
    }

    setExportingExcel(true);
    try {
      const res = await apiFetch('/api/quotation-cases/bulk-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseIds: ids })
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '엑셀 압축 파일 생성에 실패했습니다.');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `CADON_BOM_견적서일괄_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = decodeURIComponent(matches[1].replace(/['"]/g, ''));
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('엑셀 일괄 다운로드 중 오류: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  // Reset pagination when search, tab, or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTab, searchQuery, pageSize, filterManager, filterCompany]);

  const handleBatchUploadPrompt = () => {
    batchFileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        handleBatchUploadFiles(e.dataTransfer.files);
      } else {
        handleQuickUploadFile(e.dataTransfer.files[0]);
      }
    }
  };

  const handleManualCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, projectId, caseName })
      });
      if (res.ok) {
        setShowModal(false);
        setCaseName('');
        fetchCases();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Lifecycle Partitions
  const isCaseDeleted = (c: any) => Boolean(c.deleted_at) && c.deleted_at !== 'NULL' && c.deleted_at !== 'null';
  const trashedCases = useMemo(() => cases.filter(c => isCaseDeleted(c) || c.lifecycle_status === 'TRASHED'), [cases]);
  const archivedCases = useMemo(() => cases.filter(c => !isCaseDeleted(c) && (c.lifecycle_status === 'ARCHIVED' || c.status === 'ARCHIVED')), [cases]);
  const activeCases = useMemo(() => cases.filter(c => !isCaseDeleted(c) && c.lifecycle_status !== 'TRASHED' && c.lifecycle_status !== 'ARCHIVED' && c.status !== 'ARCHIVED'), [cases]);

  // KPI Calculations
  const currentTabBaseCases = useMemo(() => {
    if (selectedTab === 'ARCHIVED') return archivedCases;
    if (selectedTab === 'TRASHED') return trashedCases;
    return activeCases;
  }, [selectedTab, activeCases, archivedCases, trashedCases]);

  const uniqueManagers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dept?: string }>();

    // 1. 사내 등록된 모든 임직원 마스터(operators)에서 추가 (견적 0건이어도 항상 노출)
    operators.forEach((op: any) => {
      const opId = op.id || op.userId;
      if (opId && op.name) {
        map.set(opId, {
          id: opId,
          name: op.name,
          dept: op.department || (op.role === 'TENANT_ADMIN' ? '대표' : '견적팀')
        });
      }
    });

    // 2. 현재 등록된 견적 건의 작성자들도 병합
    currentTabBaseCases.forEach(c => {
      if (c.created_by_user_id) {
        if (!map.has(c.created_by_user_id)) {
          map.set(c.created_by_user_id, {
            id: c.created_by_user_id,
            name: c.created_by_name || c.created_by_user_id,
            dept: '견적팀'
          });
        }
      }
    });

    // 3. 현재 로그인 사용자 본인도 포함
    if (user?.userId && !map.has(user.userId)) {
      map.set(user.userId, {
        id: user.userId,
        name: user.name || user.userId,
        dept: user.role === 'TENANT_ADMIN' ? '대표' : '견적팀'
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [operators, currentTabBaseCases, user]);

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    // 1. 등록된 고객사 마스터에서 추가
    companies.forEach((comp: any) => {
      if (comp.name && comp.name !== '고객사 미지정') {
        set.add(comp.name);
      }
    });
    // 2. 현재 견적 건들의 고객사명 병합
    currentTabBaseCases.forEach(c => {
      if (c.company_name && c.company_name !== '고객사 미지정') {
        set.add(c.company_name);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [companies, currentTabBaseCases]);
  
  const managerCaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    currentTabBaseCases.forEach(c => {
      if (c.created_by_user_id) {
        counts[c.created_by_user_id] = (counts[c.created_by_user_id] || 0) + 1;
      }
    });
    return counts;
  }, [currentTabBaseCases]);
  
  // Dynamically scoped cases by active Manager and Company filters
  const scopeActiveCases = useMemo(() => {
    return activeCases.filter(c => {
      if (filterManager !== 'ALL' && c.created_by_user_id !== filterManager) return false;
      if (filterCompany !== 'ALL' && c.company_name !== filterCompany) return false;
      return true;
    });
  }, [activeCases, filterManager, filterCompany]);

  const scopeArchivedCases = useMemo(() => {
    return archivedCases.filter(c => {
      if (filterManager !== 'ALL' && c.created_by_user_id !== filterManager) return false;
      if (filterCompany !== 'ALL' && c.company_name !== filterCompany) return false;
      return true;
    });
  }, [archivedCases, filterManager, filterCompany]);

  const scopeTrashedCases = useMemo(() => {
    return trashedCases.filter(c => {
      if (filterManager !== 'ALL' && c.created_by_user_id !== filterManager) return false;
      if (filterCompany !== 'ALL' && c.company_name !== filterCompany) return false;
      return true;
    });
  }, [trashedCases, filterManager, filterCompany]);

  const secureVaultCount = scopeActiveCases.filter(c => c.visibility === 'PRIVATE').length;
  
  const totalCasesCount = scopeActiveCases.length;
  const readyCount = scopeActiveCases.filter(c => c.quote_readiness === 'READY_FOR_QUOTE').length;
  const analyzedCount = scopeActiveCases.filter(c => c.status === 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE').length;
  const pendingCount = scopeActiveCases.filter(c => c.status !== 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE').length;
  const pendingApprovalCount = scopeActiveCases.filter(c => c.visibility === 'PRIVATE_PENDING').length;
  const archivedCount = scopeArchivedCases.length;
  const trashedCount = scopeTrashedCases.length;

  const latestReadyCase = useMemo(() => {
    return scopeActiveCases.find(c => c.quote_readiness === 'READY_FOR_QUOTE') || null;
  }, [scopeActiveCases]);

  const readyCaseIds = useMemo(() => {
    return scopeActiveCases.filter(c => c.quote_readiness === 'READY_FOR_QUOTE').map(c => c.id);
  }, [scopeActiveCases]);

  const totalDrawingsSum = scopeActiveCases.reduce((acc, c) => acc + (c.drawings_count || c.files_count || 0), 0);
  const archivedDrawingsSum = scopeArchivedCases.reduce((acc, c) => acc + (c.drawings_count || c.files_count || 0), 0);
  const allTotalDrawingsSum = totalDrawingsSum + archivedDrawingsSum;
  const allTotalCasesCount = scopeActiveCases.length + scopeArchivedCases.length;
  const totalBomItemsSum = scopeActiveCases.reduce((acc, c) => acc + (c.bom_items_count || 0), 0);
  const totalQuotedAmountSum = scopeActiveCases.reduce((acc, c) => acc + (c.quote_total_amount || 0), 0);

  // Filtered cases list
  const filteredCases = currentTabBaseCases.filter(c => {
    if (selectedTab === 'READY_FOR_QUOTE' && c.quote_readiness !== 'READY_FOR_QUOTE') return false;
    if (selectedTab === 'ANALYZED' && (c.status !== 'ANALYZED' || c.quote_readiness === 'READY_FOR_QUOTE')) return false;
    if (selectedTab === 'PENDING' && (c.status === 'ANALYZED' || c.quote_readiness === 'READY_FOR_QUOTE')) return false;
    if (selectedTab === 'PRIVATE_APPROVAL' && c.visibility !== 'PRIVATE_PENDING') return false;
    if (selectedTab === 'SECURE_VAULT' && c.visibility !== 'PRIVATE') return false;
    
    if (filterManager !== 'ALL' && c.created_by_user_id !== filterManager) return false;
    if (filterCompany !== 'ALL' && c.company_name !== filterCompany) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchName = matchHangulSearch(c.case_name || '', q);
      const matchNo = matchHangulSearch(c.case_no || '', q);
      const matchComp = matchHangulSearch(c.company_name || '', q);
      const matchProj = matchHangulSearch(c.project_name || '', q);
      const matchManager = matchHangulSearch(c.created_by_name || '', q);
      return matchName || matchNo || matchComp || matchProj || matchManager;
    }
    return true;
  });

  // Sorting
  const sortedCases = [...filteredCases].sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;
    switch (sortField) {
      case 'date':
        valA = new Date(a.request_date || a.created_at || 0).getTime();
        valB = new Date(b.request_date || b.created_at || 0).getTime();
        break;
      case 'amount':
        valA = Number(a.quote_total_amount || 0);
        valB = Number(b.quote_total_amount || 0);
        break;
      case 'drawings':
        valA = Number(a.drawings_count || a.files_count || 0);
        valB = Number(b.drawings_count || b.files_count || 0);
        break;
      case 'bom':
        valA = Number(a.bom_items_count || 0);
        valB = Number(b.bom_items_count || 0);
        break;
      case 'case_no':
        valA = a.case_no || '';
        valB = b.case_no || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case 'case_name':
        valA = a.case_name || '';
        valB = b.case_name || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (sortDirection === 'asc') return valA > valB ? 1 : valA < valB ? -1 : 0;
    return valA < valB ? 1 : valA > valB ? -1 : 0;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedCases.length / pageSize));
  const paginatedCases = sortedCases.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Subtotal for filtered set
  const filteredTotalAmount = filteredCases.reduce((acc, c) => acc + (c.quote_total_amount || 0), 0);

  // Selection handlers
  const pageIds = paginatedCases.map(c => c.id);
  const isAllPageSelected = pageIds.length > 0 && pageIds.every(id => selectedCaseIds.includes(id));
  const isSomePageSelected = pageIds.some(id => selectedCaseIds.includes(id)) && !isAllPageSelected;

  const handleToggleSelectAll = () => {
    if (isAllPageSelected) {
      setSelectedCaseIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedCaseIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCaseIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 ml-1 inline" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1 inline" />
    );
  };

  // [Solution 3] 지능형 필터 완화: 탭을 클릭했을 때 현재 고객사 필터로 인해 0건이 되면 고객사 필터를 자동으로 'ALL'로 완화하여 데이터가 즉시 보이도록 처리
  const handleSelectTab = (tab: any) => {
    setSelectedTab(tab);
    if (filterCompany !== 'ALL') {
      const willHaveItems = activeCases.some(c => {
        if (tab === 'PENDING') return c.status !== 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE';
        if (tab === 'ANALYZED') return c.status === 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE';
        if (tab === 'READY_FOR_QUOTE') return c.quote_readiness === 'READY_FOR_QUOTE';
        if (tab === 'ARCHIVED') return c.status === 'ARCHIVED' || c.lifecycle_status === 'ARCHIVED';
        if (tab === 'TRASHED') return isCaseDeleted(c) || c.lifecycle_status === 'TRASHED';
        return true;
      });
      const hasItemWithCurrentCompany = activeCases.some(c => {
        if (c.company_name !== filterCompany) return false;
        if (tab === 'PENDING') return c.status !== 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE';
        if (tab === 'ANALYZED') return c.status === 'ANALYZED' && c.quote_readiness !== 'READY_FOR_QUOTE';
        if (tab === 'READY_FOR_QUOTE') return c.quote_readiness === 'READY_FOR_QUOTE';
        if (tab === 'ARCHIVED') return c.status === 'ARCHIVED' || c.lifecycle_status === 'ARCHIVED';
        if (tab === 'TRASHED') return isCaseDeleted(c) || c.lifecycle_status === 'TRASHED';
        return true;
      });
      if (willHaveItems && !hasItemWithCurrentCompany) {
        setFilterCompany('ALL');
      }
    }
  };

  return (
    <div className="space-y-3 w-full px-3 sm:px-4 py-3 pb-10">
      {/* Global Drag & Drop Overlay */}
      {globalDragging && (
        <div className="fixed inset-0 bg-blue-900/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center text-white border-4 border-dashed border-blue-300 m-6 rounded-2xl animate-in fade-in">
          <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-4 animate-bounce">
            <UploadCloud className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">CAD 도면(DWG / DXF)을 여기에 놓으세요</h2>
          <p className="text-blue-200 text-sm mt-2 font-medium">
            파일을 놓으면 <strong className="text-white underline">신규 견적 프로젝트 자동 생성 ➔ 도면 업로드 ➔ AI BOM 자동 분석</strong>이 즉시 시작됩니다.
          </p>
        </div>
      )}

      {/* Quick Upload Progress Overlay */}
      {quickUploading && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[4px] p-8 max-w-md w-full shadow-2xl text-center space-y-4 border border-slate-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[3px] flex items-center justify-center mx-auto shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">DWG 쾌속 견적 프로젝트 생성</h3>
              <p className="text-xs text-slate-500 mt-1">{quickUploadStatus}</p>
            </div>
            <div className="w-full bg-slate-100 rounded-[2px] h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-[2px] animate-pulse w-3/4"></div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input for Single Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".dwg,.dxf"
        onClick={(e) => {
          (e.target as HTMLInputElement).value = '';
        }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];
            e.target.value = '';
            handleQuickUploadFile(selectedFile);
          }
        }}
        className="hidden"
      />

      {/* Hidden File Input for Batch Multiple Upload */}
      <input
        type="file"
        ref={batchFileInputRef}
        accept=".dwg,.dxf"
        multiple
        onClick={(e) => {
          (e.target as HTMLInputElement).value = '';
        }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = e.target.files;
            e.target.value = '';
            handleBatchUploadFiles(selectedFiles);
          }
        }}
        className="hidden"
      />

      {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 표준화 공통 컴포넌트 (top-1/2 수직 중앙 정렬) */}
      {isSidebarCollapsed && (
        <SidebarBookmarkTab
          mode="expand"
          onClick={handleToggleSidebar}
          label="파이프라인"
          icon={Layers}
          title="작업 파이프라인 펼치기"
        />
      )}

      {/* Main Two-Column Workflow Layout */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Left Column: Vertical Workflow Pipeline Sidebar (With Integrated Drag & Drop Zone & Collapsible) */}
        <CaseWorkflowSidebar
          selectedTab={selectedTab}
          onSelectTab={handleSelectTab}
          counts={{
            total: totalCasesCount,
            pending: pendingCount,
            analyzed: analyzedCount,
            ready: readyCount,
            pendingApproval: pendingApprovalCount,
            secureVault: secureVaultCount,
            archived: archivedCount,
            trashed: trashedCount,
          }}
          latestReadyCase={latestReadyCase}
          user={user}
          onSingleUploadClick={handleOpenUploadModal}
          onBatchUploadClick={handleBatchUploadPrompt}
          isDragging={isDragging}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onBulkExportExcel={() => handleBulkExportExcel(readyCaseIds)}
          isExportingExcel={exportingExcel}
        />

        {/* Right Column: Main Workbench */}
        <div className="flex-1 min-w-0 space-y-3 w-full">
          {/* Zone 2: 3-Step BOM Automation Guide & Key Metrics (Slim & Compact) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Step 1 */}
            <div className="bg-white px-3 py-2 rounded border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  1
                </span>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1">
                    <h3 className="font-extrabold text-slate-900 text-xs tracking-tight truncate">CAD 도면 접수·분석</h3>
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 py-0.2 rounded shrink-0">BOM 검출</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 font-medium truncate">
                    외곽선·표제란·BOM 자동 추출
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div className="text-[9.5px] font-semibold text-slate-400">분석 도면</div>
                <div className="font-mono font-extrabold text-sm text-slate-900 leading-tight">
                  {totalDrawingsSum.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">장</span>
                  {archivedCount > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 ml-1" title="보관함 포함 전사 누적 분석 도면 총수">
                      (누적 {allTotalDrawingsSum.toLocaleString()}장)
                    </span>
                  )}
                </div>
                {archivedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectTab('ARCHIVED')}
                    className="text-[9.5px] text-purple-700 hover:text-purple-900 font-bold hover:underline cursor-pointer flex items-center justify-end gap-1 mt-0.5"
                    title="보관함에 안전 보관된 2건(246장) 즉시 조회"
                  >
                    <span>📦 보관함 {archivedCount}건 ({archivedDrawingsSum.toLocaleString()}장)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white px-3 py-2 rounded border border-slate-200 shadow-2xs hover:border-emerald-300 transition-colors flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  2
                </span>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1">
                    <h3 className="font-extrabold text-slate-900 text-xs tracking-tight truncate">부품·단가 최적화</h3>
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded shrink-0">단가 매칭</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 font-medium truncate">
                    사내 마스터 단가 1-클릭 일괄 매칭
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div className="text-[9.5px] font-semibold text-slate-400">정규화 BOM</div>
                <div className="font-mono font-extrabold text-sm text-emerald-600 leading-tight">
                  {totalBomItemsSum.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">개</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white px-3 py-2 rounded border border-slate-200 shadow-2xs hover:border-teal-300 transition-colors flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-5 h-5 rounded bg-teal-100 text-teal-700 text-[11px] font-extrabold flex items-center justify-center shrink-0">
                  3
                </span>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1">
                    <h3 className="font-extrabold text-slate-900 text-xs tracking-tight truncate">견적 산출·발행</h3>
                    <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-1 py-0.2 rounded shrink-0">엑셀 출력</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 font-medium truncate">
                    인쇄용 표준 화이트 양식 & 엑셀
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div className="text-[9.5px] font-semibold text-slate-400">누적 견적 총액</div>
                <div className="font-mono font-extrabold text-sm text-teal-700 leading-tight">
                  {totalQuotedAmountSum.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">원</span>
                </div>
              </div>
          </div>
        </div>

        {/* Zone 4: Enterprise High-Density Table / Card Grid Section */}
        <div className="space-y-2">
          {/* Header Context Banner: 현재 관제 모드 (김세창 담당 관제 vs 전사 공유 견적) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5 pb-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>견적의뢰 관리 대장</span>
              </h2>
              {user?.name && filterManager === user.userId ? (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs animate-in fade-in">
                  <User className="w-3 h-3 text-blue-600" />
                  <span>
                    <strong className="text-blue-900 font-extrabold">{user.name}</strong> 담당 관제 모드
                  </span>
                  <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                    {managerCaseCounts[user.userId] || 0}건 활성
                  </span>
                </span>
              ) : filterManager !== 'ALL' ? (
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs animate-in fade-in">
                  <User className="w-3 h-3 text-indigo-600" />
                  <span>
                    <strong className="text-indigo-900 font-extrabold">
                      {uniqueManagers.find(m => m.id === filterManager)?.name || filterManager}
                    </strong> 담당 필터링
                  </span>
                  <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                    {managerCaseCounts[filterManager] || 0}건
                  </span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span>전사 공유 전체 모드</span>
                  <span className="text-slate-500 font-semibold text-[10px]">({totalCasesCount}건)</span>
                </span>
              )}
            </div>

            {/* Quick Mode Toggle Helpers */}
            <div className="flex items-center gap-1.5 text-xs">
              {user && filterManager !== user.userId && (
                <button
                  type="button"
                  onClick={() => setFilterManager(user.userId)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded transition-all cursor-pointer shadow-2xs"
                  title={`${user.name || '내'} 담당 견적만 즉시 필터링`}
                >
                  <User className="w-3 h-3" />
                  <span>{user.name || '내'} 담당 모드 ({managerCaseCounts[user.userId] || 0})</span>
                </button>
              )}
              {filterManager !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilterManager('ALL')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 py-0.5 rounded transition-all cursor-pointer"
                  title="전체 견적 보기로 전환"
                >
                  <span>전체보기</span>
                </button>
              )}
            </div>
          </div>

          {/* Top Control Toolbar (Unified Single-Row High Density) */}
          <div className="bg-white px-3 py-1.5 rounded border border-slate-200 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Status Tabs (Single Row, No-Wrap) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleToggleSidebar}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 border flex items-center space-x-1 ${
                isSidebarCollapsed
                  ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs hover:bg-blue-100'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
              title={isSidebarCollapsed ? '좌측 파이프라인 사이드바 펼치기' : '좌측 사이드바 접기 (테이블 100% 넓게 보기)'}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isSidebarCollapsed ? '열기' : '넓게보기'}</span>
            </button>

            <button
              onClick={() => handleSelectTab('ALL')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              전체 ({totalCasesCount})
            </button>
            <button
              onClick={() => handleSelectTab('READY_FOR_QUOTE')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                selectedTab === 'READY_FOR_QUOTE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700'
              }`}
            >
              <span>견적준비 ({readyCount})</span>
            </button>
            <button
              onClick={() => handleSelectTab('ANALYZED')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                selectedTab === 'ANALYZED'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'
              }`}
            >
              <span>분석완료 ({analyzedCount})</span>
            </button>
            <button
              onClick={() => handleSelectTab('PENDING')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                selectedTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700'
              }`}
            >
              <span>도면대기 ({pendingCount})</span>
            </button>
            {user?.role === 'SUPER_ADMIN' && (
              <>
                <button
                  onClick={() => handleSelectTab('PRIVATE_APPROVAL')}
                  className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                    selectedTab === 'PRIVATE_APPROVAL'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700'
                  }`}
                >
                  <span>결재대기 ({pendingApprovalCount})</span>
                </button>
                <button
                  onClick={() => handleSelectTab('SECURE_VAULT')}
                  className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                    selectedTab === 'SECURE_VAULT'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <span>🔒 보안 ({secureVaultCount})</span>
                </button>
              </>
            )}
            <span className="text-slate-300 mx-0.5">|</span>
            {/* Archive Tab */}
            <button
              onClick={() => handleSelectTab('ARCHIVED')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                selectedTab === 'ARCHIVED'
                  ? 'bg-purple-700 text-white shadow-xs font-black'
                  : 'bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-800'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>보관함 ({archivedCount})</span>
            </button>

            {/* Trash Tab */}
            <button
              onClick={() => handleSelectTab('TRASHED')}
              className={`btn-hover-effect-tab px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                selectedTab === 'TRASHED'
                  ? 'bg-rose-700 text-white shadow-xs font-black'
                  : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-800'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>휴지통 ({trashedCount})</span>
            </button>
          </div>

          {/* Right Controls: Compact Single Row (Manager Filter, Company Filter, Search, Rows) */}
          <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
            {/* [Solution 4] 실시간 자동 저장 인디케이터 (2XL 이상 화면에서만 표시하여 폭 절약) */}
            <div className="hidden 2xl:flex items-center space-x-1.5 px-2 py-1 bg-emerald-50/80 border border-emerald-200/80 rounded text-[11px] font-bold text-emerald-700 shrink-0 select-none" title="모든 도면 및 견적 데이터는 실시간으로 영구 자동 저장되고 있습니다.">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>자동저장</span>
            </div>
            {/* 1. [👤 내 담당] 1-클릭 빠른 토글 칩 */}
            {user && (
              <button
                type="button"
                onClick={() => setFilterManager(filterManager === user.userId ? 'ALL' : user.userId)}
                title={filterManager === user.userId ? '전체 공유 견적 보기 (토글 해제)' : `${user.name || '내'} 담당 견적만 모아보기`}
                className={`btn-hover-effect-tab inline-flex items-center space-x-1 px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                  filterManager === user.userId
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-600/30'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>👤 내 담당</span>
                {filterManager === user.userId && user.name && (
                  <span className="text-[11px] font-semibold text-blue-100">
                    ({user.name})
                  </span>
                )}
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    filterManager === user.userId
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {managerCaseCounts[user.userId] || 0}
                </span>
              </button>
            )}

            {/* 2. 회사 대표(TENANT_ADMIN) 또는 시스템 총괄(SUPER_ADMIN) 드롭다운 */}
            {user && ['TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
              <select
                value={filterManager}
                onChange={e => setFilterManager(e.target.value)}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 max-w-[130px] shrink-0"
                title="회원사 대표 전용: 사내 전체 담당자별 견적 조회"
              >
                <option value="ALL">👤 모든 담당자 ({uniqueManagers.length})</option>
                {uniqueManagers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id === user.userId ? `👤 [대표] ${m.name}` : `👤 ${m.name}`}
                  </option>
                ))}
              </select>
            )}

            {/* 3. 고객사 필터 드롭다운 */}
            <select
              value={filterCompany}
              onChange={e => setFilterCompany(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 max-w-[125px] shrink-0"
              title="고객사별 견적 필터링"
            >
              <option value="ALL">🏢 모든 고객사 ({uniqueCompanies.length})</option>
              {uniqueCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* 4. 스마트 통합 검색창 */}
            <div className="relative w-36 sm:w-40 lg:w-44 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="검색... (고객사, 건명)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-6 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors font-medium shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="검색어 초기화"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 5. 페이지당 보기 건수 */}
            <div className="flex items-center space-x-1 bg-white border border-slate-300 rounded px-1.5 py-1 shadow-2xs shrink-0">
              <span className="text-[11px] font-semibold text-slate-500">보기:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value={15}>15건</option>
                <option value={20}>20건</option>
                <option value={50}>50건</option>
                <option value={100}>100건</option>
              </select>
            </div>

            {/* 6. 표준 신규 견적 등록 버튼 (AutoCAD Ribbon Style Primary Action) */}
            <button
              type="button"
              onClick={handleOpenUploadModal}
              className="btn-hover-effect-tab inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow-xs cursor-pointer shrink-0 transition-colors ml-1"
              title="신규 도면 견적의뢰 건을 등록합니다."
            >
              <Plus className="w-3.5 h-3.5" />
              <span>신규 견적 등록</span>
            </button>
          </div>
        </div>
        </div>

        {/* Sub-bar: Filtering Summary & Bulk Selection Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-700 font-medium bg-slate-50 px-4 py-2.5 rounded-[3px] border border-slate-200/80 gap-2">
          <div className="flex items-center flex-wrap gap-2">
            {selectedTab === 'ARCHIVED' ? (
              <span>
                보관함: <strong className="text-purple-900 font-bold">{filteredCases.length}건</strong>
                <span className="text-slate-500 font-medium ml-1">(전체 DB 누적 {allTotalCasesCount}건 중)</span>
              </span>
            ) : (
              <span>
                진행중: <strong className="text-blue-900 font-bold">{filteredCases.length}건</strong>
                <span className="text-slate-500 font-medium ml-1">(전체 DB 누적 {allTotalCasesCount}건)</span>
              </span>
            )}
            <span className="text-slate-400">•</span>
            <span>
              합산 견적액: <strong className="text-blue-700 font-mono font-bold text-sm">₩{filteredTotalAmount.toLocaleString()}</strong>
            </span>

            {selectedTab === 'ARCHIVED' ? (
              <>
                <span className="text-slate-400">•</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[11px] flex items-center gap-1 border border-purple-300">
                  <Archive className="w-3 h-3 text-purple-600" />
                  보관함 모드 조회 중 (총 {filteredCases.length}건)
                </span>
                <button
                  onClick={() => handleSelectTab('ALL')}
                  className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white shadow-2xs text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                  title="진행중인 활성 견적 목록으로 돌아가기"
                >
                  <span>← 진행중 견적 보기</span>
                </button>
              </>
            ) : archivedCount > 0 ? (
              <>
                <span className="text-slate-400">•</span>
                <button
                  onClick={() => handleSelectTab('ARCHIVED')}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 text-[11px] font-extrabold cursor-pointer transition-colors shadow-2xs"
                  title="보관함에 보관된 완료/보류 견적건 2건 즉시 조회"
                >
                  <Archive className="w-3 h-3 text-purple-600" />
                  <span>보관함 {archivedCount}건 바로보기 ➔</span>
                </button>
              </>
            ) : null}

            {selectedCaseIds.length > 0 && (
              <div className="flex items-center flex-wrap gap-2 ml-2">
                <div className="flex items-center space-x-2 bg-blue-100 text-blue-900 px-2.5 py-1 rounded-[3px] font-bold text-xs">
                  <span>✓ {selectedCaseIds.length}건 선택됨</span>
                  <button
                    onClick={() => setSelectedCaseIds([])}
                    className="text-xs underline hover:text-blue-950 cursor-pointer ml-1 font-semibold"
                  >
                    선택 해제
                  </button>
                </div>

                {selectedTab === 'ARCHIVED' ? (
                  <>
                    <button
                      onClick={() => handleRestoreCases(selectedCaseIds)}
                      disabled={lifecycleLoading}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '견적 복원' : `복원 (${selectedCaseIds.length}건)`}</span>
                    </button>
                    <button
                      onClick={() => handleTrashCases(selectedCaseIds)}
                      disabled={lifecycleLoading}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '휴지통 이동' : `휴지통 이동 (${selectedCaseIds.length}건)`}</span>
                    </button>
                  </>
                ) : selectedTab === 'TRASHED' ? (
                  <>
                    <button
                      onClick={() => handleRestoreCases(selectedCaseIds)}
                      disabled={lifecycleLoading}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '견적 복원' : `복원 (${selectedCaseIds.length}건)`}</span>
                    </button>
                    <button
                      onClick={() => handlePermanentDeleteCases(selectedCaseIds)}
                      disabled={lifecycleLoading}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-red-700 hover:bg-red-800 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Trash className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '영구 삭제' : `영구 삭제 (${selectedCaseIds.length}건)`}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleBulkExportExcel(selectedCaseIds)}
                      disabled={lifecycleLoading || exportingExcel}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      title={selectedCaseIds.length === 1 ? "선택된 견적건의 모든 BOM 및 견적서를 엑셀 파일(XLSX)로 다운로드합니다." : "선택된 견적건들의 모든 BOM 및 견적서를 엑셀 파일(XLSX)로 생성하여 ZIP 파일로 다운로드합니다."}
                    >
                      <DownloadCloud className="w-3.5 h-3.5" />
                      <span>
                        {exportingExcel
                          ? '엑셀 패키징 중...'
                          : selectedCaseIds.length === 1
                          ? '엑셀 다운로드 (XLSX)'
                          : `엑셀 다운로드 (${selectedCaseIds.length}건 ZIP)`}
                      </span>
                    </button>
                    <button
                      onClick={() => openArchiveModal(selectedCaseIds)}
                      disabled={lifecycleLoading || exportingExcel}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '보관함 이동' : `보관함 이동 (${selectedCaseIds.length}건)`}</span>
                    </button>
                    <button
                      onClick={() => handleTrashCases(selectedCaseIds)}
                      disabled={lifecycleLoading || exportingExcel}
                      className="btn-hover-effect-tab px-2.5 py-1 rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{selectedCaseIds.length === 1 ? '휴지통 이동' : `휴지통 이동 (${selectedCaseIds.length}건)`}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="text-slate-700 font-semibold">
            {filteredCases.length > 0 && (
              <span>
                {currentPage} / {totalPages} 페이지 (
                {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredCases.length)}건 표시)
              </span>
            )}
          </div>
        </div>

        {/* Main Data Container */}
        {loading ? (
          <div className="text-center py-20 text-slate-500 font-medium bg-white rounded-[4px] border border-slate-200">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <span>견적 프로젝트 데이터 로딩 중...</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[4px] border border-slate-200 shadow-xs">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-800 font-bold text-sm">등록된 견적 프로젝트가 없습니다.</p>
            <p className="text-slate-500 text-xs mt-1">상단 툴바 또는 아래 버튼을 눌러 첫 번째 견적 프로젝트를 등록해 보세요.</p>
            <button
              onClick={handleOpenUploadModal}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-[4px] text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>신규 도면 견적 등록</span>
            </button>
          </div>
        ) : (
          /* Enterprise High-Density Data Grid Table (Single Standard View) */
          <div className="bg-white rounded-[4px] border border-slate-200 shadow-xs overflow-hidden min-h-[340px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-extrabold text-slate-800 select-none">
                    <th className="py-3 px-3.5 w-10 text-center">
                      <button
                        onClick={handleToggleSelectAll}
                        className="cursor-pointer text-slate-400 hover:text-slate-700 flex items-center justify-center mx-auto"
                        title={isAllPageSelected ? '현재 페이지 전체 해제' : '현재 페이지 전체 선택'}
                      >
                        {isAllPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : isSomePageSelected ? (
                          <Minus className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th
                      onClick={() => handleSort('case_no')}
                      className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors w-36 whitespace-nowrap group"
                    >
                      <span>관리번호</span>
                      {renderSortIndicator('case_no')}
                    </th>
                    <th
                      onClick={() => handleSort('case_name')}
                      className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors group min-w-[240px] whitespace-nowrap"
                    >
                      <span>견적의뢰 건명</span>
                      {renderSortIndicator('case_name')}
                    </th>
                    <th className="py-3 px-3.5 min-w-[190px] w-56 whitespace-nowrap border-l border-slate-200/80">
                      <span>고객사 / 프로젝트</span>
                    </th>
                    <th className="py-3 px-3.5 w-40 text-center whitespace-nowrap">
                      <span>견적 담당자</span>
                    </th>
                    <th className="py-3 px-3.5 w-32 text-center whitespace-nowrap">
                      <span>진행 상태</span>
                    </th>
                    <th
                      onClick={() => handleSort('drawings')}
                      className="py-3 px-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors w-20 whitespace-nowrap group"
                    >
                      <span>도면수</span>
                      {renderSortIndicator('drawings')}
                    </th>
                    <th
                      onClick={() => handleSort('bom')}
                      className="py-3 px-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors w-24 whitespace-nowrap group"
                    >
                      <span>BOM품목</span>
                      {renderSortIndicator('bom')}
                    </th>
                    <th
                      onClick={() => handleSort('amount')}
                      className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors w-36 whitespace-nowrap group"
                    >
                      <span>견적 합계액</span>
                      {renderSortIndicator('amount')}
                    </th>
                    <th
                      onClick={() => handleSort('date')}
                      className="py-3 px-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors w-28 whitespace-nowrap group"
                    >
                      <span>의뢰일자</span>
                      {renderSortIndicator('date')}
                    </th>
                    <th className="py-3 px-3.5 text-center w-24 whitespace-nowrap">
                      <span>작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-[13px]">
                  {paginatedCases.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 px-4 text-center">
                        <div className="max-w-lg mx-auto bg-slate-50/90 border border-slate-200 rounded-2xl p-6 shadow-2xs">
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                            <Filter className="w-6 h-6" />
                          </div>
                          <h4 className="font-extrabold text-slate-900 text-sm mb-1">
                            선택하신 필터 조건에 일치하는 견적 건이 없습니다
                          </h4>
                          
                          {/* Active filters badges */}
                          <div className="flex flex-wrap items-center justify-center gap-1.5 my-3 text-xs">
                            <span className="text-slate-500 text-[11px] font-medium mr-1">적용된 조건:</span>
                            {selectedTab !== 'ALL' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200">
                                탭: {selectedTab === 'PENDING' ? '도면대기' : selectedTab === 'READY_FOR_QUOTE' ? '견적준비완료' : selectedTab === 'ANALYZED' ? '분석완료' : selectedTab === 'ARCHIVED' ? '보관함' : selectedTab === 'TRASHED' ? '휴지통' : selectedTab}
                              </span>
                            )}
                            {filterManager !== 'ALL' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold border border-blue-200">
                                담당자: {uniqueManagers.find(m => m.id === filterManager)?.name || filterManager}
                              </span>
                            )}
                            {filterCompany !== 'ALL' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold border border-purple-200">
                                고객사: {filterCompany}
                              </span>
                            )}
                            {searchQuery.trim() && (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold border border-emerald-200">
                                검색어: &ldquo;{searchQuery.trim()}&rdquo;
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            필터 조건이 좁게 설정되어 결과가 숨겨졌습니다.<br />
                            아래 버튼을 클릭하시면 <strong>원클릭으로 필터를 초기화</strong>하여 전체 견적 건을 확인하실 수 있습니다.
                          </p>

                          {/* Quick Recovery Action Buttons */}
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {(filterManager !== 'ALL' || filterCompany !== 'ALL' || searchQuery.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterManager('ALL');
                                  setFilterCompany('ALL');
                                  setSearchQuery('');
                                }}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>필터(담당자/고객사/검색) 전체 해제</span>
                              </button>
                            )}

                            {selectedTab !== 'ALL' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTab('ALL');
                                  setFilterManager('ALL');
                                  setFilterCompany('ALL');
                                  setSearchQuery('');
                                }}
                                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                              >
                                <span>전체 목록 처음부터 보기</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedCases.map((c) => {
                      const isSelected = selectedCaseIds.includes(c.id);
                      const isReady = c.quote_readiness === 'READY_FOR_QUOTE';
                      const isAnalyzed = c.status === 'ANALYZED';
                      const totalAmount = c.quote_total_amount;

                      return (
                        <tr
                          key={c.id}
                          onClick={() => router.push(`/cases/${c.id}`)}
                          className={`transition-colors cursor-pointer group ${
                            isSelected
                              ? 'bg-blue-50/70 hover:bg-blue-50'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          {/* Checkbox */}
                          <td
                            className="py-3 px-3.5 text-center"
                            onClick={(e) => handleToggleSelect(c.id, e)}
                          >
                            <div className="flex items-center justify-center">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </div>
                          </td>

                          {/* Case No */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 group-hover:bg-blue-100/60 text-slate-800 rounded-[3px] transition-colors">
                              {c.case_no}
                            </span>
                          </td>

                          {/* Case Name */}
                          <td className="py-3 px-3.5 min-w-[240px]">
                            <div className="flex items-center justify-between gap-2.5 min-w-0">
                              <div className="min-w-0 flex-1">
                                <SmartTruncateTooltip
                                  text={c.case_name || ''}
                                  className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-[13.5px]"
                                  maxWidthClass="max-w-[210px]"
                                />
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5 ml-auto">
                                {selectedTab === 'TRASHED' ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                    title={`삭제일시: ${c.deleted_at || '최근'} (30일 보관 후 영구 삭제)`}
                                  >
                                    <Clock className="w-3 h-3 text-rose-500" />
                                    <span>D-{getRemainingTrashDays(c.deleted_at)}</span>
                                  </span>
                                ) : selectedTab === 'ARCHIVED' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                    {c.archive_reason || '보류'}
                                  </span>
                                ) : (
                                  <>
                                    {(c.lifecycle_status === 'ARCHIVED' || c.status === 'ARCHIVED') && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                        📦 보관 ({c.archive_reason || '보류'})
                                      </span>
                                    )}
                                    {(c.lifecycle_status === 'TRASHED' || Boolean(c.deleted_at)) && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                        🗑️ 휴지통
                                      </span>
                                    )}
                                  </>
                                )}
                                {c.visibility === 'SHARED' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">사내 공유</span>}
                                {c.visibility === 'PRIVATE_PENDING' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">비공개 심사</span>}
                                {c.visibility === 'PRIVATE' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">공개 불가</span>}
                              </div>
                            </div>
                          </td>

                          {/* Customer & Project */}
                          <td className="py-3 px-3.5 min-w-[190px] w-56 whitespace-nowrap border-l border-slate-100">
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900 flex items-center space-x-1.5 text-[13px]">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {c.company_id === 'comp_unassigned' || c.company_name === '고객사 미지정' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    ⚠️ 고객사 미지정
                                  </span>
                                ) : (
                                  <SmartTruncateTooltip
                                    text={c.company_name || ''}
                                    className="text-slate-900 font-bold"
                                    maxWidthClass="max-w-[160px]"
                                  />
                                )}
                              </div>
                              <div className="text-xs text-slate-600 font-medium flex items-center space-x-1.5">
                                <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {c.company_id === 'comp_unassigned' ? (
                                  <span className="text-slate-400 text-xs">도면 분석 대기 (프로젝트 미정)</span>
                                ) : (
                                  <SmartTruncateTooltip
                                    text={c.project_name || '-'}
                                    className="text-slate-600 font-medium text-xs"
                                    maxWidthClass="max-w-[160px]"
                                  />
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Quote Manager Badge (독립 전용 열 & 1-클릭 필터) */}
                          <td className="py-3 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const mgrInfo = uniqueManagers.find(m => m.id === c.created_by_user_id);
                              const managerDisplayName = c.created_by_name || mgrInfo?.name || (c.created_by_user_id === user?.userId ? user?.name : null) || '담당자 미지정';
                              const theme = getManagerTheme(c.created_by_user_id, managerDisplayName);
                              const isFiltered = filterManager === c.created_by_user_id;
                              return (
                                <button
                                  type="button"
                                  onClick={() => setFilterManager(isFiltered ? 'ALL' : c.created_by_user_id)}
                                  title={`${managerDisplayName} 건만 필터링 (클릭)`}
                                  className={`btn-hover-effect-tab inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-[4px] border ${theme.bg} ${theme.text} ${theme.border} text-xs font-bold transition-all hover:shadow-xs hover:scale-105 cursor-pointer ${
                                    isFiltered ? 'ring-2 ring-blue-500 shadow-xs ring-offset-1 font-black' : ''
                                  }`}
                                >
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${theme.badge} shrink-0 shadow-2xs`}>
                                    {theme.initial}
                                  </span>
                                  <span className="font-bold">{managerDisplayName}</span>
                                  <span className="text-[10px] font-medium opacity-75 border-l border-current/30 pl-1 ml-0.5">
                                    {mgrInfo?.dept || theme.dept}
                                  </span>
                                </button>
                              );
                            })()}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-block text-xs font-bold px-2.5 py-1 rounded-[3px] border ${
                                isReady
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : isAnalyzed
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              {isReady ? '견적준비완료' : isAnalyzed ? '분석완료' : '도면등록대기'}
                            </span>
                          </td>

                          {/* Drawings Count */}
                          <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap text-[13px]">
                            {c.drawings_count || c.files_count || 0}
                            <span className="text-xs font-semibold text-slate-600 ml-0.5">장</span>
                          </td>

                          {/* BOM Items Count */}
                          <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap text-[13px]">
                            {c.bom_items_count ? (
                              <span className="text-blue-700 font-extrabold">
                                {c.bom_items_count} <span className="text-xs font-semibold text-slate-600 ml-0.5">개</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                                {isAnalyzed ? '0개' : '미검출'}
                              </span>
                            )}
                          </td>

                          {/* Quoted Total Amount */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap font-mono font-extrabold">
                            {totalAmount ? (
                              <span className="text-blue-700 text-[13.5px]">
                                ₩{Number(totalAmount).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                                {isReady ? '0원' : '단가 미매칭'}
                              </span>
                            )}
                          </td>

                          {/* Request Date */}
                          <td className="py-3 px-3.5 text-center font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {c.request_date || c.created_at?.slice(0, 10) || '-'}
                          </td>

                          {/* Actions (Smart Action CTA by Lifecycle Status) */}
                          <td className="py-3 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center space-x-1.5">
                              {selectedTab === 'TRASHED' || c.lifecycle_status === 'TRASHED' || Boolean(c.deleted_at) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreCases([c.id])}
                                    title="견적건 활성 상태로 복원"
                                    className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-300 transition-all cursor-pointer shadow-2xs"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>복원</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePermanentDeleteCases([c.id])}
                                    title="완전 영구 삭제 (복구 불가)"
                                    className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-300 transition-all cursor-pointer shadow-2xs"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                    <span>영구 삭제</span>
                                  </button>
                                  <Link
                                    href={`/cases/${c.id}`}
                                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                                    title="견적 건 열기 (읽기 모드)"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </Link>
                                </>
                              ) : selectedTab === 'ARCHIVED' || c.lifecycle_status === 'ARCHIVED' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreCases([c.id])}
                                    title="작업 활성 상태로 복원"
                                    className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-300 transition-all cursor-pointer shadow-2xs"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>보관 해제</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTrashCases([c.id])}
                                    title="휴지통으로 이동"
                                    className="p-1.5 text-rose-700 hover:bg-rose-50 rounded border border-rose-300 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <Link
                                    href={`/cases/${c.id}`}
                                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                                    title="견적 건 상세 보기"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </Link>
                                </>
                              ) : (
                                <>
                                  {/* Next Action Context Button */}
                                  {isReady ? (
                                    <Link
                                      href={`/cases/${c.id}?tab=quote`}
                                      className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs group"
                                      title="최종 견적서 발행 및 다운로드 바로가기"
                                    >
                                      <FileSpreadsheet className="w-3.5 h-3.5" />
                                      <span>견적서 발행</span>
                                    </Link>
                                  ) : isAnalyzed ? (
                                    <Link
                                      href={`/cases/${c.id}?tab=bom`}
                                      className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-xs group"
                                      title="추출된 BOM 및 단가 매칭 검토 바로가기"
                                    >
                                      <span>BOM·단가 검토</span>
                                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                    </Link>
                                  ) : (
                                    <Link
                                      href={`/cases/${c.id}`}
                                      className="btn-hover-effect-tab inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-xs group"
                                      title="CAD 도면 등록 및 AI 분석 바로가기"
                                    >
                                      <UploadCloud className="w-3.5 h-3.5" />
                                      <span>도면 등록</span>
                                    </Link>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openArchiveModal([c.id])}
                                    title="견적건 보관함으로 이동 (보류/이력)"
                                    className="p-1.5 text-purple-700 hover:bg-purple-50 rounded border border-purple-300 transition-colors cursor-pointer"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTrashCases([c.id])}
                                    title="견적건 삭제 (휴지통으로 이동)"
                                    className="p-1.5 text-rose-700 hover:bg-rose-50 rounded border border-rose-300 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Enterprise Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-700 font-medium hidden sm:block">
              전체 <strong className="text-slate-900 font-bold">{sortedCases.length}</strong>개 항목 중 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedCases.length)}번째
            </div>

            <div className="flex items-center space-x-1 mx-auto sm:mx-0">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-[3px] border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 cursor-pointer"
                title="첫 페이지"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-[3px] border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 cursor-pointer"
                title="이전 페이지"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 2
                  );
                })
                .map((page, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && page - prev > 1;

                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && (
                        <span className="px-1.5 text-xs text-slate-400 font-bold">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-[3px] text-xs font-bold transition-all cursor-pointer ${
                          currentPage === page
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-[3px] border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 cursor-pointer"
                title="다음 페이지"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-[3px] border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 cursor-pointer"
                title="마지막 페이지"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Manual New Case Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[4px] max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-extrabold text-slate-900 mb-4">신규 견적의뢰 건 직접 등록</h2>
            <form onSubmit={handleManualCreateCase} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">고객사 선택</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-[3px] text-xs font-semibold text-slate-800 outline-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                >
                  {companies.length === 0 ? (
                    <option value="">(등록된 고객사 없음)</option>
                  ) : (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} {c.company_code ? `[${c.company_code}]` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">프로젝트</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-[3px] text-xs font-semibold text-slate-800 outline-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                >
                  <option value="proj_unassigned">기본 프로젝트 (미지정)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">견적의뢰 건 명칭</label>
                <input
                  type="text"
                  required
                  placeholder="예: 조립라인 3호기 가이드레일 및 브라켓 견적"
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-[3px] text-xs font-medium text-slate-900 outline-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-[3px] cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-[3px] shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? '등록 중...' : '견적의뢰 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive Reason Modal */}
      {archiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[6px] shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">견적건 보관함 이동</h3>
                  <p className="text-xs text-purple-800">
                    선택된 {archiveTargetIds.length}건을 보관함으로 이동합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setArchiveModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">보관 사유 선택</label>
                <div className="space-y-2">
                  {[
                    '고객사 일정/품의 지연 (잠정 보류)',
                    '도면 개정(Rev 변경) 대기 / 구버전 보관',
                    '견적 산출 완료 후 수주/실주 이력 보관',
                    'CUSTOM'
                  ].map((option) => (
                    <label
                      key={option}
                      className={`flex items-center space-x-2.5 p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                        archiveReasonType === option
                          ? 'bg-purple-50 border-purple-400 font-bold text-purple-900'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="archiveReason"
                        checked={archiveReasonType === option}
                        onChange={() => setArchiveReasonType(option)}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>{option === 'CUSTOM' ? '기타 사유 직접 입력' : option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {archiveReasonType === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">직접 입력</label>
                  <input
                    type="text"
                    value={archiveCustomReason}
                    onChange={(e) => setArchiveCustomReason(e.target.value)}
                    placeholder="보관 사유를 입력하세요 (예: 11월 재검토 등)"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                💡 <strong>안내:</strong> 보관함으로 이동된 건은 메인 진행 목록에서 숨겨지며, 상단의 <strong>‘📦 보관함’</strong> 탭에서 언제든 즉시 작업 활성 상태로 복원할 수 있습니다.
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setArchiveModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                disabled={lifecycleLoading}
                className="px-4 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{lifecycleLoading ? '처리 중...' : '보관함으로 이동'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedCaseIds.length > 0 && (
        <aside aria-label="선택 항목 일괄 작업 바" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center space-x-3.5 border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center space-x-2 pr-3 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shadow-xs">
              {selectedCaseIds.length}
            </span>
            <span className="text-xs font-bold text-slate-200">건 선택됨</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* 1건만 선택되었을 때 빠른 도면/견적 워크벤치 바로가기 제공 */}
            {selectedCaseIds.length === 1 && (
              <button
                type="button"
                onClick={() => router.push(`/cases/${selectedCaseIds[0]}`)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
                title="해당 견적 건의 도면 및 BOM 워크벤치로 바로 이동합니다."
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>견적 건 열기</span>
              </button>
            )}

            {selectedTab === 'ARCHIVED' ? (
              <button
                type="button"
                onClick={() => handleRestoreCases(selectedCaseIds)}
                disabled={lifecycleLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{selectedCaseIds.length === 1 ? '견적 복원' : `복원 (${selectedCaseIds.length}건)`}</span>
              </button>
            ) : selectedTab === 'TRASHED' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleRestoreCases(selectedCaseIds)}
                  disabled={lifecycleLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{selectedCaseIds.length === 1 ? '견적 복원' : `복원 (${selectedCaseIds.length}건)`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePermanentDeleteCases(selectedCaseIds)}
                  disabled={lifecycleLoading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash className="w-3.5 h-3.5" />
                  <span>{selectedCaseIds.length === 1 ? '영구 삭제' : `영구 삭제 (${selectedCaseIds.length}건)`}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openArchiveModal(selectedCaseIds)}
                  disabled={lifecycleLoading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{selectedCaseIds.length === 1 ? '보관함 이동' : `보관함 이동 (${selectedCaseIds.length}건)`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTrashCases(selectedCaseIds)}
                  disabled={lifecycleLoading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{selectedCaseIds.length === 1 ? '휴지통 삭제' : `휴지통 삭제 (${selectedCaseIds.length}건)`}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setSelectedCaseIds([])}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-xs font-medium transition-colors cursor-pointer ml-1"
            >
              선택 해제
            </button>
          </div>
        </aside>
      )}

      {/* 신규 도면 견적 등록 표준 모달 (AutoCAD Standard Dialog) */}
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
                    {selectedFile
                      ? 'DWG 도면을 등록하여 AI 가상 BOM 추출 및 원가 산출을 시작합니다.'
                      : '신규 견적의뢰 건을 등록합니다. (도면은 등록 후 언제든 추가 첨부 가능)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmittingModal && setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateCaseFromModal} className="p-6 space-y-4 overflow-y-auto">
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
                    setIsModalDragging(true);
                  }}
                  onDragLeave={() => setIsModalDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsModalDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setSelectedFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => modalFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isModalDragging
                      ? 'border-blue-500 bg-blue-50/60'
                      : selectedFile
                      ? 'border-emerald-400 bg-emerald-50/40'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={modalFileInputRef}
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
                  disabled={isSubmittingModal}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 ${
                    selectedFile
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                      : 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/30'
                  }`}
                >
                  {isSubmittingModal ? (
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
                      {selectedFile ? (
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
