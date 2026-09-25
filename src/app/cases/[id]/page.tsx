'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, Upload, Play, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft,
  Layers, Database, FileSpreadsheet, RefreshCw, Lock, Unlock, Sparkles, Building2,
  Folder, Calendar, Check, X, ShieldAlert, ShieldCheck, Clock, Send, ArrowDown, ArrowLeft, Home, Eye, Download, Info, Trash2, Trash,
  Search, Plus, Pencil, ChevronDown, CheckSquare, Square, Coins, ExternalLink, MapPin,
  Table, LayoutGrid, Filter, RotateCcw, User, AlertCircle, Brain, Archive, Copy, Wrench
} from 'lucide-react';
import CadViewer from '@/components/CadViewer';
import QuotationDocumentPreview from '@/components/QuotationDocumentPreview';
import FabricationFeaturesPanel from '@/components/FabricationFeaturesPanel';
import PipelineNavigator from '@/components/common/PipelineNavigator';
import SidebarBookmarkTab from '@/components/common/SidebarBookmarkTab';

export default function CaseWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyReason, setPrivacyReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cad' | 'structure' | 'approval' | 'quote' | 'excel' | 'features'>('cad');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedNormItem, setSelectedNormItem] = useState<any>(null);
  const [manualPriceModal, setManualPriceModal] = useState<any>(null);
  const [manualPriceInput, setManualPriceInput] = useState('');
  const [manualPriceReason, setManualPriceReason] = useState('');
  const [manualPriceHistory, setManualPriceHistory] = useState<any[]>([]);
  const [priceMasterList, setPriceMasterList] = useState<any[]>([]);
  const [modalActiveTab, setModalActiveTab] = useState<'MASTER' | 'MANUAL' | 'DIRECT'>('MASTER');
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [selectedPriceSource, setSelectedPriceSource] = useState<'PRICE_MASTER' | 'MANUAL_PRICE'>('PRICE_MASTER');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [applyScope, setApplyScope] = useState<'SINGLE' | 'ALL_SAME'>('SINGLE');
  const [autoIncludeInQuote, setAutoIncludeInQuote] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [analyzingFileId, setAnalyzingFileId] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<any>(null);
  const [externalFocusIdx, setExternalFocusIdx] = useState<number | null>(null);
  
  // 🎯 5단계 통합 스마트 파이프라인 단계 관리 (1: 도면접수, 2: AI도면파싱, 3: 가상BOM, 4: 단가매칭, 5: 견적발행)
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3 | 4 | 5>(2);

  // URL step 쿼리 파라미터 연동 (?step=1, ?step=2, ?step=3)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const stepParam = sp.get('step');
      if (stepParam === '1') {
        setWorkflowStep(1);
        setIsSidebarOpen(true);
      } else if (stepParam === '2') {
        setWorkflowStep(2);
      } else if (stepParam === '3') {
        setWorkflowStep(3);
      }
    }
  }, []);

  // 🚀 Smart Upload Intent & Multi-Drawing Filter States
  const [uploadIntentModal, setUploadIntentModal] = useState<{ file: File; uploadJson: any } | null>(null);
  const [fileViewMode, setFileViewMode] = useState<'ALL' | 'SINGLE'>('ALL');

  // 🏢 Company Detection & Manual Input Modal States
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [inputCompanyName, setInputCompanyName] = useState('');
  const [existingCompanies, setExistingCompanies] = useState<any[]>([]);
  const [savingCompany, setSavingCompany] = useState(false);

  // 📦🗑️ Lifecycle Modal & Action States
  const [detailArchiveModalOpen, setDetailArchiveModalOpen] = useState(false);
  const [detailArchiveReasonType, setDetailArchiveReasonType] = useState('일정/품의 지연');
  const [detailArchiveCustomReason, setDetailArchiveCustomReason] = useState('');
  const [detailLifecycleLoading, setDetailLifecycleLoading] = useState(false);

  const router = useRouter();

  const handleArchiveCase = async () => {
    const finalReason = detailArchiveReasonType === 'CUSTOM'
      ? (detailArchiveCustomReason.trim() || '기타 보류')
      : detailArchiveReasonType;
    setDetailLifecycleLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ARCHIVE', reason: finalReason })
      });
      const resJson = await res.json();
      if (res.ok) {
        setDetailArchiveModalOpen(false);
        await fetchData();
      } else {
        alert(resJson.error || '보관함 이동 실패');
      }
    } catch (e: any) {
      alert('통신 오류: ' + e.message);
    } finally {
      setDetailLifecycleLoading(false);
    }
  };

  const handleTrashCase = async () => {
    if (!confirm('이 견적건을 휴지통으로 이동하시겠습니까?\n휴지통으로 이동된 건은 견적 목록에서 제외되며 언제든 복원할 수 있습니다.')) return;
    setDetailLifecycleLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TRASH' })
      });
      const resJson = await res.json();
      if (res.ok) {
        await fetchData();
      } else {
        alert(resJson.error || '휴지통 이동 실패');
      }
    } catch (e: any) {
      alert('통신 오류: ' + e.message);
    } finally {
      setDetailLifecycleLoading(false);
    }
  };

  const handleRestoreCase = async () => {
    setDetailLifecycleLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESTORE' })
      });
      const resJson = await res.json();
      if (res.ok) {
        await fetchData();
      } else {
        alert(resJson.error || '복원 실패');
      }
    } catch (e: any) {
      alert('통신 오류: ' + e.message);
    } finally {
      setDetailLifecycleLoading(false);
    }
  };

  const handlePermanentDeleteCase = async () => {
    if (!confirm('⚠️ 경고: 이 견적건과 연관된 모든 CAD 객체, BOM 데이터, 도면 물리 파일이 영구 삭제됩니다.\n삭제 후에는 절대 복원할 수 없습니다. 계속하시겠습니까?')) return;
    if (!confirm('정말 최종적으로 영구 삭제하시겠습니까?')) return;
    setDetailLifecycleLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PERMANENT_DELETE' })
      });
      const resJson = await res.json();
      if (res.ok) {
        alert('견적건이 완전히 영구 삭제되었습니다.');
        router.push('/cases');
      } else {
        alert(resJson.error || '영구 삭제 실패');
        setDetailLifecycleLoading(false);
      }
    } catch (e: any) {
      alert('통신 오류: ' + e.message);
      setDetailLifecycleLoading(false);
    }
  };

  const handleOpenCompanyModal = async () => {
    setShowCompanyModal(true);
    setInputCompanyName(data?.case?.company_id === 'comp_unassigned' || data?.case?.company_name === '고객사 미지정' ? '' : (data?.case?.company_name || ''));
    try {
      const res = await apiFetch('/api/companies');
      if (res.ok) {
        const json = await res.json();
        setExistingCompanies((json.companies || []).filter((c: any) => c.id !== 'comp_unassigned' && c.company_name !== '고객사 미지정'));
      }
    } catch (e) {
      console.error('Failed to fetch companies:', e);
    }
  };

  const handleSaveCompany = async () => {
    if (!inputCompanyName.trim()) {
      alert('고객사명을 입력하거나 기존 고객사를 선택해주세요.');
      return;
    }
    setSavingCompany(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: inputCompanyName.trim() })
      });
      if (res.ok) {
        setShowCompanyModal(false);
        await fetchData();
      } else {
        const json = await res.json();
        alert(json.error || '고객사 저장 실패');
      }
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setSavingCompany(false);
    }
  };

  // 💎 Inline Direct Price Edit States
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const isSavingInlineRef = useRef(false);
  const isCancelledRef = useRef(false);
  const hasAutoTriggeredAnalysis = useRef(false);

  // 🧠 Self-Learning Price Pool Modal States
  const [showLearnedModal, setShowLearnedModal] = useState(false);
  const [learnedPoolList, setLearnedPoolList] = useState<any[]>([]);
  const [loadingLearnedPool, setLoadingLearnedPool] = useState(false);
  const [learnedPoolSearch, setLearnedPoolSearch] = useState('');

  const openLearnedPoolModal = async () => {
    setShowLearnedModal(true);
    setLoadingLearnedPool(true);
    try {
      const res = await apiFetch('/api/manual-prices?mode=ALL_LEARNED');
      if (res.ok) {
        const json = await res.json();
        setLearnedPoolList(json.list || []);
      }
    } catch (e) {
      console.error('Failed to fetch learned price pool:', e);
    } finally {
      setLoadingLearnedPool(false);
    }
  };

  // 💎 Quote Checkbox Header Pull-down Menu State
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false);
  const quoteDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quoteDropdownRef.current && !quoteDropdownRef.current.contains(event.target as Node)) {
        setQuoteDropdownOpen(false);
      }
    }
    if (quoteDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [quoteDropdownOpen]);

  // 💎 Step 2 Quote Items Export States (.xls, .xlsx, .csv)
  const [step2ExportFormat, setStep2ExportFormat] = useState<'xls' | 'xlsx' | 'csv'>('xls');
  const [step2ShowExportMenu, setStep2ShowExportMenu] = useState(false);
  const [step2ExportLoading, setStep2ExportLoading] = useState(false);
  const step2ExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (step2ExportRef.current && !step2ExportRef.current.contains(event.target as Node)) {
        setStep2ShowExportMenu(false);
      }
    }
    if (step2ShowExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [step2ShowExportMenu]);

  // 💎 Approval Workbench Tab Filter & View States
  const [approvalFilterTab, setApprovalFilterTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'QUOTE_INCLUDED' | 'QUOTE_EXCLUDED'>('ALL');
  const [similarityFilter, setSimilarityFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [quoteFilterTab, setQuoteFilterTab] = useState<'ALL' | 'INCLUDED' | 'EXCLUDED'>('ALL');
  const [approvalSearchText, setApprovalSearchText] = useState('');
  const [approvalViewMode, setApprovalViewMode] = useState<'TABLE' | 'CARD'>('TABLE');
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);

  // 💎 Cross-User Permission & Approval Modal States
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRequestApproval = async () => {
    if (!approvalReason.trim()) {
      alert('수정/승인 요청 사유를 입력해주세요.');
      return;
    }
    setRequestingApproval(true);
    try {
      const res = await apiFetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationCaseId: id,
          reason: approvalReason.trim(),
          requestType: 'EDIT_CASE'
        })
      });
      const resJson = await res.json();
      if (res.ok) {
        setShowApprovalModal(false);
        setApprovalReason('');
        setApprovalFeedback({ type: 'success', text: '최고관리자에게 수정/승인 결재 요청이 성공적으로 접수되었습니다.' });
        setTimeout(() => setApprovalFeedback(null), 5000);
        await fetchData();
      } else {
        alert(resJson.error || '승인 요청에 실패했습니다.');
      }
    } catch (e: any) {
      alert(e.message || '요청 전송 통신 오류');
    } finally {
      setRequestingApproval(false);
    }
  };

  // 3-B. Bypass Super Admin Approval & Proceed Directly (최고관리자 결재 승인 없이 견적 진행)
  const handleBypassApproval = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/bypass-approval`, {
        method: 'POST'
      });
      const resJson = await res.json();
      if (res.ok) {
        setApprovalFeedback({
          type: 'success',
          text: resJson.message || '최고관리자 결재 승인이 보류되어 결재 대기 없이 즉시 견적 작업이 활성화되었습니다.'
        });
        setTimeout(() => setApprovalFeedback(null), 6000);
        await fetchData();
      } else {
        alert(resJson.error || '견적 진행 처리 실패');
      }
    } catch (err: any) {
      alert('통신 오류: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 💾 BOM Data Snapshot Archiving (Step 2 검수 완료 후 영구 스냅샷 보관)
  const [archivingSnapshot, setArchivingSnapshot] = useState(false);
  const handleArchiveSnapshot = async () => {
    if (!id || archivingSnapshot) return;
    setArchivingSnapshot(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/archive-snapshot`, {
        method: 'POST'
      });
      const dataRes = await res.json();
      if (res.ok) {
        alert(dataRes.message || '현재 케이스의 도면 및 BOM 정규화 데이터 스냅샷이 안전하게 보관되었습니다.');
      } else {
        alert(dataRes.error || '스냅샷 보관에 실패했습니다.');
      }
    } catch (err: any) {
      alert('스냅샷 보관 중 통신 오류: ' + err.message);
    } finally {
      setArchivingSnapshot(false);
    }
  };

  // 📦 Export Package Download (Step 3 최종 패키지 ZIP 다운로드)
  const handleDownloadZip = () => {
    if (!id) return;
    window.open(`/api/quotation-cases/${id}/export-package`, '_blank');
  };

  const handleNavigateToCadDrawing = (target: any) => {
    if (!target) return;
    const allDrawings = data?.drawings || [];
    const targetId = target.matched_drawing_id || target.drawing_id || target.id;
    const targetDwgNo = (target.drawing_no || target.drawing_no_raw || target.part_no || '').trim();

    let idx = -1;
    // 1. Match by exact drawing ID
    if (targetId) {
      idx = allDrawings.findIndex((item: any) => item.id === targetId);
    }
    // 2. Match by exact Drawing / Part Number (normalized & case-insensitive)
    if (idx < 0 && targetDwgNo) {
      const cleanNo = targetDwgNo.toUpperCase().replace(/\s+/g, '');
      idx = allDrawings.findIndex((item: any) => {
        const dRaw = (item.drawing_no_raw || '').toUpperCase().replace(/\s+/g, '');
        const dNorm = (item.drawing_no_normalized || '').toUpperCase().replace(/\s+/g, '');
        return dRaw === cleanNo || dNorm === cleanNo || item.id === targetDwgNo;
      });
    }
    // 3. Match via source_drawings_json list
    if (idx < 0 && target.source_drawings_json) {
      try {
        const sourceList = typeof target.source_drawings_json === 'string'
          ? JSON.parse(target.source_drawings_json)
          : target.source_drawings_json;
        if (Array.isArray(sourceList) && sourceList.length > 0) {
          idx = allDrawings.findIndex((item: any) => sourceList.includes(item.drawing_no_raw));
        }
      } catch {}
    }
    // 4. Fallback match by drawing / item name (avoid generic project name false positives)
    if (idx < 0 && (target.drawing_name || target.normalized_name || target.name_raw || target.item_name)) {
      const targetName = (target.drawing_name || target.normalized_name || target.name_raw || target.item_name || '').trim();
      const genericNames = ['MAIN_ASSEMBLY', 'SUB_ASSEMBLY', '도면', '기본도면'];
      if (targetName && !genericNames.includes(targetName)) {
        idx = allDrawings.findIndex(
          (item: any) =>
            item.drawing_name_raw === targetName ||
            item.drawing_name_normalized === targetName
        );
      }
    }

    if (idx >= 0) {
      setExternalFocusIdx(null);
      setTimeout(() => {
        setExternalFocusIdx(idx);
      }, 50);
    }
    setActiveTab('cad');
  };

  const fetchData = async () => {
    try {
      setFetchError(null);
      const res = await apiFetch(`/api/quotation-cases/${id}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (!json.files || json.files.length === 0) {
          setIsSidebarOpen(true);
        }
        if (json.normalizedItems?.length > 0) {
          if (!selectedNormItem) {
            setSelectedNormItem(json.normalizedItems[0]);
          }
          // Synchronize selectedApprovalIds with all quote-included items from Tab 1
          const quoteIncludedIds = json.normalizedItems
            .filter((ni: any) => ni.is_quote_included !== 0)
            .map((ni: any) => ni.id);
          setSelectedApprovalIds(quoteIncludedIds);
        }
      } else {
        const errJson = await res.json().catch(() => null);
        setFetchError(errJson?.error || `견적건을 불러오는 중 오류가 발생했습니다 (${res.status})`);
      }
    } catch (e: any) {
      setFetchError(e.message || '네트워크 통신 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    apiFetch('/api/auth/me').then(res => res.json()).then(d => setUser(d.user)).catch(() => {});
  }, [id]);

  const [isDragging, setIsDragging] = useState(false);

  // Unified File Upload & Automatic Pipeline Trigger (PROMPT 03, 18, 18-R1, 18-R2)
  const handleProcessFile = async (file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      // 1. Upload File to server storage
      const uploadRes = await apiFetch(`/api/quotation-cases/${id}/upload`, {
        method: 'POST',
        body: formData
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error || '파일 업로드에 실패했습니다.');
      }

      // Check if this case already has other drawings/files
      const existingUserFiles = (data?.files || []).filter((f: any) => 
        f.file_role !== 'VECTOR_SVG' && f.file_role !== 'DERIVED'
      );

      if (existingUserFiles.length > 0) {
        // 이미 다른 도면 파일이 존재하는 경우 ➡️ 스마트 인텐트 모달 띄워 사용자에게 의도 확인
        setUploading(false);
        setUploadIntentModal({ file, uploadJson });
        return;
      }

      // 첫 번째 도면인 경우 ➡️ 즉시 분석 진행
      await executeDirectAnalysis(uploadJson.file.id);
    } catch (err: any) {
      alert(err.message || '처리 실패');
      setUploading(false);
      setAnalyzing(false);
      setAnalyzingFileId(null);
    }
  };

  // Direct Analysis Execution helper
  const executeDirectAnalysis = async (fileId: string) => {
    setAnalyzing(true);
    setAnalyzingFileId(fileId);
    try {
      const analyzeRes = await apiFetch(`/api/quotation-cases/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
      });
      const analyzeJson = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeJson.error || 'CAD 도면 자동 분석 중 오류가 발생했습니다.');
      }
      setSelectedFileId(fileId);
      await fetchData();
    } catch (err: any) {
      alert(err.message || '분석 실패');
    } finally {
      setUploading(false);
      setAnalyzing(false);
      setAnalyzingFileId(null);
    }
  };

  // Intent Action 1: Create separate new case (방안 A)
  const handleIntentSeparateCase = async () => {
    if (!uploadIntentModal) return;
    const { file, uploadJson } = uploadIntentModal;
    setUploadIntentModal(null);
    setUploading(true);

    try {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const autoCaseName = `${cleanName} 견적의뢰 (DWG 자동분석)`;
      const createRes = await apiFetch('/api/quotation-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: qc?.company_id || 'comp_unassigned',
          projectId: qc?.project_id || 'proj_unassigned',
          caseName: autoCaseName
        })
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || '새 견적건 생성 실패');

      const newCaseId = createData.caseId;
      // Upload file to new case and analyze
      const formData = new FormData();
      formData.append('file', file);
      const newUploadRes = await apiFetch(`/api/quotation-cases/${newCaseId}/upload`, {
        method: 'POST',
        body: formData
      });
      const newUploadJson = await newUploadRes.json();
      if (newUploadRes.ok) {
        await apiFetch(`/api/quotation-cases/${newCaseId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: newUploadJson.file.id })
        });
      }

      // Cleanup the temporary file uploaded to this case
      if (uploadJson?.file?.id) {
        await apiFetch(`/api/quotation-cases/${id}/files/${uploadJson.file.id}`, { method: 'DELETE' }).catch(() => {});
      }

      // Navigate to new case
      window.location.href = `/cases/${newCaseId}`;
    } catch (err: any) {
      alert(err.message || '신규 견적건 분리 생성 실패');
      setUploading(false);
    }
  };

  // Intent Action 2: Add and merge into current case (방안 B)
  const handleIntentMergeCurrentCase = async () => {
    if (!uploadIntentModal) return;
    const { uploadJson } = uploadIntentModal;
    setUploadIntentModal(null);
    await executeDirectAnalysis(uploadJson.file.id);
    setApprovalFeedback({
      type: 'success',
      text: '현재 견적건에 신규 도면이 추가 통합되었습니다. [📂 전체 통합 보기]에서 모든 도면을 확인하실 수 있습니다.'
    });
  };

  // Intent Action 3: Revision Update with price inheritance (상황 C)
  const handleIntentRevisionUpdate = async () => {
    if (!uploadIntentModal) return;
    const { uploadJson } = uploadIntentModal;
    setUploadIntentModal(null);
    // Execute analysis and preserve quote items
    await executeDirectAnalysis(uploadJson.file.id);
    setApprovalFeedback({
      type: 'success',
      text: '설계 변경 도면이 반영되었습니다. 기존에 입력된 부품 단가 및 마스터 매칭이 자동 승계되었습니다.'
    });
  };

  // Cancel Intent Modal
  const handleCancelUploadIntent = async () => {
    if (!uploadIntentModal) return;
    const { uploadJson } = uploadIntentModal;
    setUploadIntentModal(null);
    if (uploadJson?.file?.id) {
      await apiFetch(`/api/quotation-cases/${id}/files/${uploadJson.file.id}`, { method: 'DELETE' }).catch(() => {});
      await fetchData();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFile = e.target.files[0];
    e.target.value = '';
    await handleProcessFile(selectedFile);
  };

  // 2. Start Analysis Manual Trigger (PROMPT 18-R1 / 18-R2)
  const handleStartAnalysis = async (targetFileId?: any) => {
    const rawFiles = (data?.files || []).filter((f: any) => 
      f.file_role !== 'VECTOR_SVG' && 
      f.file_type !== 'SVG' && 
      f.file_role !== 'DERIVED' && 
      !f.original_file_name.endsWith('.svg') &&
      !f.original_file_name.endsWith('.dwg.dxf')
    );
    const fileIdToUse = typeof targetFileId === 'string'
      ? targetFileId
      : (selectedFileId || data?.latestParseRun?.source_file_id || (rawFiles && rawFiles[0]?.id));
    setAnalyzing(true);
    setAnalyzingFileId(fileIdToUse);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileIdToUse })
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || '분석 실패');
      }
    } finally {
      setAnalyzing(false);
      setAnalyzingFileId(null);
    }
  };

  // 🛡️ Auto-Trigger Analysis Fallback: CAD 도면 파일이 있으나 도곽/시트가 0개이고 분석 이력이 없는 경우 즉시 자동 분석 실행
  useEffect(() => {
    if (!data || loading || analyzing) return;
    const rawCadFiles = (data.files || []).filter((f: any) => 
      ['DWG', 'DXF'].includes(f.file_type) && 
      f.file_role !== 'VECTOR_SVG' && 
      f.file_role !== 'DERIVED' &&
      !f.original_file_name.endsWith('.svg') &&
      !f.original_file_name.endsWith('.dwg.dxf')
    );
    if (
      rawCadFiles.length > 0 &&
      (!data.drawings || data.drawings.length === 0) &&
      !data.latestParseRun &&
      !hasAutoTriggeredAnalysis.current
    ) {
      hasAutoTriggeredAnalysis.current = true;
      handleStartAnalysis(rawCadFiles[0].id);
    }
  }, [data, loading, analyzing]);

  // Delete Drawing File (Optimized Instant Deletion)
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`정말 도면 파일 '${fileName}' 및 연관 변환 데이터를 삭제하시겠습니까?`)) {
      return;
    }

    // 1. Instant Optimistic UI Clear (< 0.01s)
    setData((prev: any) => {
      if (!prev) return prev;
      const remainingFiles = (prev.files || []).filter((f: any) => f.id !== fileId && f.derived_from_file_id !== fileId);
      if (remainingFiles.length === 0) {
        return {
          ...prev,
          files: [],
          drawings: [],
          cadObjects: [],
          bomAreas: [],
          rawBomItems: [],
          flattenedBomItems: [],
          normalizedItems: [],
          finalBomItems: [],
          case: { ...prev.case, status: 'REGISTERED', quote_readiness: 'PENDING_BOM' }
        };
      }
      return { ...prev, files: remainingFiles };
    });

    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }

    // 2. Perform background delete request
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/files/${fileId}`, {
        method: 'DELETE'
      });
      const resJson = await res.json();
      if (!res.ok) {
        alert(resJson.error || '파일 삭제 실패');
      }
      await fetchData();
    } catch (err: any) {
      alert('삭제 중 오류: ' + err.message);
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Approve Item (PROMPT 13)
  const handleApproveItem = async (
    normalizedItemId: string,
    decisionType: string,
    master: any = null,
    reason: string = ''
  ) => {
    const targetNorm = normalizedItems.find((n: any) => n.id === normalizedItemId) || selectedNormItem;
    if (!targetNorm) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/approve-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalizedItemId,
          decisionType,
          selectedMasterId: master?.master_id || master?.id || null,
          selectedMasterCode: master?.master_code || null,
          finalName: master?.standard_name || targetNorm.normalized_name,
          finalSpec: master?.specification || targetNorm.spec_candidate,
          finalMaterial: master?.material || targetNorm.material_candidate,
          finalQuantity: targetNorm.quantity,
          finalUnit: targetNorm.unit,
          decisionReason: reason || `${decisionType} 사용자 승인`
        })
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Bulk Approve (PROMPT 13) - Supports approving all normalized items
  const handleBulkApprove = async (approveAll: boolean = true) => {
    const confirmMsg = approveAll
      ? `추천 마스터 및 도면 가공품을 포함하여 견적 대상 ${quoteIncCount}개 품목을 일괄 승인하고, 견적서에 바로 반영하시겠습니까?`
      : '1순위 추천 마스터와 일치하는 미승인 품목만 승인하시겠습니까?';
    if (!confirm(confirmMsg)) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/bulk-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approveAll, onlyMatched: !approveAll })
      });
      if (res.ok) {
        if (approveAll) {
          // 일괄 승인 후 자동으로 124개 전체 품목 기준 새 견적서 생성 및 3단계로 이동
          const qRes = await apiFetch(`/api/quotation-cases/${id}/create-quote`, {
            method: 'POST'
          });
          if (qRes.ok) {
            await fetchData();
            setActiveTab('quote');
            return;
          }
        }
        await fetchData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 4-2. Unapprove Item (단일 품목 승인 취소)
  const handleUnapproveItem = async (normalizedItemId: string, itemName?: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/unapprove-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalizedItemId })
      });
      setSelectedApprovalIds((prev) => prev.filter((itId) => itId !== normalizedItemId));
      await fetchData();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '승인 취소 처리 실패');
      }
    } catch (e: any) {
      console.error(e);
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // 4-3. Bulk Unapprove (전체 승인 일괄 초기화 or 선택 항목 일괄 취소)
  const handleBulkUnapprove = async (targetItemIds?: string[]) => {
    const isSelectedOnly = Array.isArray(targetItemIds) && targetItemIds.length > 0;
    const confirmMsg = isSelectedOnly
      ? `선택한 ${targetItemIds.length}개 품목의 승인을 취소하고 검토 대기 상태로 되돌리시겠습니까?`
      : `현재 승인 완료된 모든 품목(${approvedItemsCount}건)의 승인을 취소하고, 초기 검토 상태로 되돌리시겠습니까?`;

    if (!confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/bulk-unapprove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: isSelectedOnly ? targetItemIds : undefined })
      });
      if (res.ok) {
        if (isSelectedOnly) {
          setSelectedApprovalIds((prev) => prev.filter((itId) => !targetItemIds.includes(itId)));
        } else {
          setSelectedApprovalIds([]);
        }
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '일괄 승인 취소 실패');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 4-4. Bulk Approve Selected Items (선택 항목만 일괄 승인)
  const handleBulkApproveSelected = async (targetItemIds: string[]) => {
    if (!targetItemIds || targetItemIds.length === 0) return;
    setActionLoading(true);
    try {
      for (const itemId of targetItemIds) {
        const norm = normalizedItems.find((n: any) => n.id === itemId);
        if (!norm) continue;
        const cand = candidates.find((c: any) => c.normalized_item_id === itemId && c.rank === 1);
        const sug = norm.standard_schema_suggestion;
        const decisionType = cand ? 'EXISTING_MASTER' : (sug ? 'STANDARD_SCHEMA' : 'NEW_ITEM_CANDIDATE');
        await apiFetch(`/api/quotation-cases/${id}/approve-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            normalizedItemId: itemId,
            decisionType,
            selectedMasterId: cand?.master_id || sug?.matched_master_id || null,
            selectedMasterCode: cand?.master_code || sug?.matched_master_code || null,
            finalName: cand?.standard_name || sug?.standard_name || norm.drawing_name || norm.normalized_name,
            finalSpec: cand?.specification || sug?.dimension_str || norm.drawing_scale || norm.spec_candidate || '-',
            finalMaterial: cand?.material || sug?.standard_material || norm.drawing_material || norm.material_candidate || 'SS400',
            finalQuantity: norm.quantity,
            finalUnit: norm.unit || 'EA',
            decisionReason: cand ? '1순위 마스터 추천 선택 승인' : '표준 데이터 규격 및 유사도 검증 승인'
          })
        });
      }
      setSelectedApprovalIds([]);
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // 4-5. Bulk Approve High Confidence Items (고신뢰도 90% 이상 품목 일괄 표준화 승인)
  const handleBulkApproveHighConfidence = async () => {
    const highConfItems = normalizedItems.filter((ni: any) => 
      !approvedItemIds.has(ni.id) && 
      ni.is_quote_included !== 0 &&
      (ni.standard_schema_suggestion?.confidence_grade === 'HIGH' || (ni.standard_schema_suggestion?.similarity_score || 0) >= 90)
    );
    if (highConfItems.length === 0) {
      alert('고신뢰도(90% 이상) 미승인 품목이 없습니다.');
      return;
    }
    const confirmMsg = `유사도 90% 이상의 고신뢰도 검증 품목 ${highConfItems.length}건을 표준 규격으로 일괄 승인하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    await handleBulkApproveSelected(highConfItems.map((it: any) => it.id));
  };

  // 5. Create Quote (PROMPT 14)
  const handleCreateQuote = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/create-quote`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
        setActiveTab('quote');
      } else {
        const err = await res.json();
        alert(err.error || '견적서 생성 실패');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 5-2. Auto-Approve & Create Quote in One-Click (BOM 견적 즉시 산출)
  const handleAutoApproveAndCreateQuote = async () => {
    setActionLoading(true);
    try {
      // 1. Bulk approve AI 1st recommended master items
      await apiFetch(`/api/quotation-cases/${id}/bulk-approve`, {
        method: 'POST'
      });
      // 2. Create quote with approved items
      const res = await apiFetch(`/api/quotation-cases/${id}/create-quote`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
        setActiveTab('quote');
      } else {
        const err = await res.json();
        alert(err.error || '견적서 생성 실패');
      }
    } catch (err: any) {
      alert('견적서 자동 산출 중 오류: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 5-3. Save Inline Unit Price Directly (원클릭 직접 단가 입력 & 즉시 자동 저장)
  const handleSaveInlinePrice = async (itemId: string, priceValue: string, autoAdvance: boolean = false) => {
    if (isSavingInlineRef.current) return;
    const cleanStr = String(priceValue || '').replace(/[^0-9]/g, '');
    if (cleanStr === '') {
      setInlineEditId(null);
      return;
    }
    const numPrice = Number(cleanStr);
    if (isNaN(numPrice) || numPrice < 0) {
      setInlineEditId(null);
      return;
    }

    // If unchanged and not advancing, just close
    const currentItem = data?.quoteItems?.find((q: any) => q.id === itemId);
    if (currentItem && currentItem.unit_price === numPrice && !autoAdvance) {
      setInlineEditId(null);
      return;
    }

    isSavingInlineRef.current = true;
    setSavingPriceId(itemId);

    // Auto-advance: find next unregistered item if user pressed Enter/Tab
    let nextUnregisteredId: string | null = null;
    if (autoAdvance && data?.quoteItems) {
      const currentIdx = data.quoteItems.findIndex((q: any) => q.id === itemId);
      if (currentIdx >= 0) {
        const nextItem = data.quoteItems.slice(currentIdx + 1).find((q: any) => !q.unit_price || q.unit_price <= 0);
        if (nextItem) {
          nextUnregisteredId = nextItem.id;
        }
      }
    }

    try {
      const res = await apiFetch(`/api/quote-items/${itemId}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitPrice: numPrice,
          remark: '직접 단가 입력',
          isIncluded: numPrice > 0
        })
      });
      const resJson = await res.json();
      if (res.ok && resJson.success) {
        // Optimistic UI Update (0ms instant response)
        setData((prev: any) => {
          if (!prev) return prev;
          const updatedItems = (prev.quoteItems || []).map((item: any) => {
            if (item.id === itemId) {
              return {
                ...item,
                unit_price: numPrice,
                amount: Math.round(item.quantity * numPrice),
                price_source: 'MANUAL_PRICE',
                price_status: 'READY',
                is_included: numPrice > 0 ? 1 : item.is_included
              };
            }
            return item;
          });
          return {
            ...prev,
            quoteItems: updatedItems,
            latestQuote: prev.latestQuote ? {
              ...prev.latestQuote,
              subtotal: resJson.subtotal,
              tax_amount: resJson.taxAmount,
              total_amount: resJson.totalAmount
            } : prev.latestQuote
          };
        });

        if (nextUnregisteredId) {
          setInlineEditId(nextUnregisteredId);
          setInlineEditValue('');
        } else {
          setInlineEditId(null);
          setInlineEditValue('');
        }

        fetchData();
      } else {
        alert(resJson.error || '단가 저장에 실패했습니다.');
      }
    } catch (err: any) {
      alert('통신 오류: ' + err.message);
    } finally {
      setSavingPriceId(null);
      setTimeout(() => {
        isSavingInlineRef.current = false;
      }, 150);
    }
  };

  // 6. Manual Price & Price Master Handlers
  const handleOpenManualPriceModal = async (item: any, initialTab: 'MASTER' | 'MANUAL' | 'DIRECT' = 'MASTER') => {
    setManualPriceModal(item);
    setManualPriceInput(item.unit_price > 0 ? Number(item.unit_price).toLocaleString() : '');
    setManualPriceReason(item.remark || '');
    setSelectedHistoryId(null);
    setSelectedMasterId(item.master_id || null);
    setSelectedPriceSource(item.price_source === 'MANUAL_PRICE' ? 'MANUAL_PRICE' : 'PRICE_MASTER');
    setModalActiveTab(initialTab || (item.price_source === 'MANUAL_PRICE' ? 'MANUAL' : 'MASTER'));
    setApplyScope('SINGLE'); // Default to SINGLE (Safe mode: only this 1 item)
    setAutoIncludeInQuote(true);
    setLoadingHistory(true);
    try {
      const res = await apiFetch(`/api/manual-prices?name=${encodeURIComponent(item.item_name)}`);
      if (res.ok) {
        const json = await res.json();
        const manualList = json.manualPrices || json.list || [];
        const masterList = json.priceMasters || [];
        setManualPriceHistory(manualList);
        setPriceMasterList(masterList);
        if (item.unit_price > 0) {
          const matchedManual = manualList.find((h: any) => h.unit_price === item.unit_price);
          if (matchedManual) setSelectedHistoryId(matchedManual.id);
          const matchedMaster = masterList.find((m: any) => m.unit_price === item.unit_price || m.master_id === item.master_id);
          if (matchedMaster) setSelectedMasterId(matchedMaster.master_id || matchedMaster.price_master_id);
        }
      } else {
        setManualPriceHistory([]);
        setPriceMasterList([]);
      }
    } catch {
      setManualPriceHistory([]);
      setPriceMasterList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDirectApplyPrice = async (
    numPrice: number,
    reason: string,
    source: 'PRICE_MASTER' | 'MANUAL_PRICE' = 'MANUAL_PRICE',
    masterId?: string | null,
    masterCode?: string | null
  ) => {
    if (!manualPriceModal || actionLoading) return;
    if (isNaN(numPrice) || numPrice < 0) return;

    const currentModal = manualPriceModal;
    const applyToSame = applyScope === 'ALL_SAME';
    const willInclude = autoIncludeInQuote && numPrice > 0;
    setActionLoading(true);

    // Close modal immediately for smooth response
    setManualPriceModal(null);
    setManualPriceInput('');
    setManualPriceReason('');
    setManualPriceHistory([]);
    setPriceMasterList([]);
    setSelectedHistoryId(null);
    setSelectedMasterId(null);

    // Optimistic UI Update (0ms instant response)
    setData((prev: any) => {
      if (!prev || !prev.quoteItems) return prev;
      const updatedItems = prev.quoteItems.map((item: any) => {
        const isTarget = item.id === currentModal.id || (applyToSame && item.item_name === currentModal.item_name);
        if (isTarget) {
          const amt = Math.round(item.quantity * numPrice);
          return {
            ...item,
            unit_price: numPrice,
            amount: amt,
            price_source: source,
            price_status: 'READY',
            master_id: masterId || item.master_id,
            master_code: masterCode || item.master_code,
            is_included: willInclude ? 1 : (autoIncludeInQuote ? item.is_included : 0),
            remark: reason || (source === 'PRICE_MASTER' ? 'Price Master 적용' : 'Manual Price 적용')
          };
        }
        return item;
      });

      const activeSubtotal = updatedItems
        .filter((qi: any) => qi.is_included === 1)
        .reduce((sum: number, qi: any) => sum + (Number(qi.amount) || 0), 0);
      const taxRate = prev.quotes?.[0]?.tax_rate ?? 0.10;
      const taxAmount = Math.round(activeSubtotal * taxRate);
      const totalAmount = activeSubtotal + taxAmount;

      const updatedQuotes = (prev.quotes || []).map((q: any, idx: number) => {
        if (idx === 0) {
          return { ...q, is_locked: 0, status: 'DRAFT', subtotal: activeSubtotal, tax_amount: taxAmount, total_amount: totalAmount };
        }
        return q;
      });

      return {
        ...prev,
        quoteItems: updatedItems,
        quotes: updatedQuotes,
        latestQuote: prev.latestQuote ? {
          ...prev.latestQuote,
          is_locked: 0,
          status: 'DRAFT',
          subtotal: activeSubtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount
        } : prev.latestQuote
      };
    });

    try {
      const res = await apiFetch(`/api/quote-items/${currentModal.id}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitPrice: numPrice,
          remark: reason || (source === 'PRICE_MASTER' ? 'Price Master 적용' : 'Manual Price 적용'),
          isIncluded: willInclude,
          applyToSameItems: applyToSame,
          priceSource: source,
          masterId: masterId || currentModal.master_id,
          masterCode: masterCode || currentModal.master_code
        })
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || '단가 적용에 실패했습니다.');
        await fetchData();
      }
    } catch (err: any) {
      alert(err.message);
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveManualPrice = async () => {
    if (!manualPriceModal) return;
    const cleanStr = String(manualPriceInput || '').replace(/[^0-9]/g, '');
    if (cleanStr === '') {
      alert('적용할 단가 금액을 입력해 주세요.');
      return;
    }
    const numPrice = Number(cleanStr);
    await handleDirectApplyPrice(
      numPrice,
      manualPriceReason || (selectedPriceSource === 'PRICE_MASTER' ? 'Price Master 적용' : '수기 단가 직접 입력'),
      selectedPriceSource,
      selectedMasterId
    );
  };

  // 7. Approve Quote & Lock / Unlock Handlers
  const handleApproveQuote = async (quoteId: string) => {
    if (!confirm('이 견적서를 최종 승인하고 수정을 잠그시겠습니까?')) return;
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || '승인 실패');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUnlockQuote = async (quoteId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/unlock`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        setData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            latestQuote: prev.latestQuote ? { ...prev.latestQuote, is_locked: 0, status: 'DRAFT' } : prev.latestQuote
          };
        });
        await fetchData();
      } else {
        alert(json.error || '잠금 해제에 실패했습니다.');
      }
    } catch (err: any) {
      alert('통신 오류: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 8. Clone Quote Version (PROMPT 14)
  const handleCloneVersion = async (quoteId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/clone-version`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setApprovalFeedback({
          type: 'success',
          text: `새 견적 버전(${data.newQuoteNo})이 생성되었습니다. 이제 원본 보호 상태에서 독립적으로 자유롭게 수정할 수 있습니다.`
        });
        await fetchData();
        setActiveTab('quote');
      } else {
        alert(data.error || '견적 버전 복제에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 8-1. Toggle Quote Drawing Inclusion (도면별 견적 체크박스 실시간 연동)
  const handleToggleQuoteDrawing = async (drawingNos: string[], isIncluded: boolean, reason?: string) => {
    // Optimistic UI Update (0ms instant response)
    setData((prev: any) => {
      if (!prev) return prev;
      const noSet = new Set(drawingNos);
      const incVal = isIncluded ? 1 : 0;

      // 1. Update Drawings
      const updatedDrawings = (prev.drawings || []).map((dwg: any) => {
        if (noSet.has(dwg.drawing_no_raw) || noSet.has(dwg.drawing_no_normalized)) {
          return {
            ...dwg,
            is_quote_included: incVal,
            exclude_reason: isIncluded ? null : (reason !== undefined ? reason : dwg.exclude_reason)
          };
        }
        return dwg;
      });

      // 2. Update Quote Items
      const updatedItems = (prev.quoteItems || []).map((qi: any) => {
        if (noSet.has(qi.drawing_no) || noSet.has(qi.item_name)) {
          return { ...qi, is_included: incVal };
        }
        return qi;
      });

      // 3. Update Normalized BOM items
      const updatedBom = (prev.normalizedItems || []).map((bi: any) => {
        if (noSet.has(bi.drawing_no) || noSet.has(bi.raw_name) || noSet.has(bi.normalized_name)) {
          return {
            ...bi,
            is_quote_included: incVal,
            exclude_reason: isIncluded ? null : (reason !== undefined ? reason : bi.exclude_reason)
          };
        }
        return bi;
      });

      const activeSubtotal = updatedItems
        .filter((qi: any) => qi.is_included === 1)
        .reduce((sum: number, qi: any) => sum + (Number(qi.amount) || 0), 0);
      const taxRate = prev.quotes?.[0]?.tax_rate ?? 0.10;
      const taxAmount = Math.round(activeSubtotal * taxRate);
      const totalAmount = activeSubtotal + taxAmount;

      const updatedQuotes = (prev.quotes || []).map((q: any, idx: number) => {
        if (idx === 0) {
          return { ...q, is_locked: 0, subtotal: activeSubtotal, tax_amount: taxAmount, total_amount: totalAmount };
        }
        return q;
      });

      return {
        ...prev,
        drawings: updatedDrawings,
        quoteItems: updatedItems,
        normalizedItems: updatedBom,
        quotes: updatedQuotes,
        latestQuote: prev.latestQuote ? {
          ...prev.latestQuote,
          is_locked: 0,
          subtotal: activeSubtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount
        } : prev.latestQuote
      };
    });

    // Also synchronize selectedApprovalIds for Tab 2 checkboxes
    setSelectedApprovalIds((prev) => {
      const itemsToMatch = (data?.normalizedItems || []).filter((ni: any) => 
        drawingNos.includes(ni.drawing_no) || drawingNos.includes(ni.raw_name) || drawingNos.includes(ni.normalized_name)
      );
      const idsToChange = new Set(itemsToMatch.map((m: any) => m.id));
      if (isIncluded) {
        return Array.from(new Set([...prev, ...idsToChange])) as string[];
      } else {
        return prev.filter((prevId) => !idsToChange.has(prevId));
      }
    });

    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/toggle-quote-drawing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingNos, isIncluded, reason })
      });
      if (res.ok) {
        const resJson = await res.json();
        setData((prev: any) => {
          if (!prev || !prev.quotes) return prev;
          const updatedQuotes = prev.quotes.map((q: any, idx: number) => {
            if (idx === 0) {
              return {
                ...q,
                is_locked: 0,
                subtotal: resJson.subtotal,
                tax_amount: resJson.taxAmount,
                total_amount: resJson.totalAmount
              };
            }
            return q;
          });
          return {
            ...prev,
            quotes: updatedQuotes,
            latestQuote: prev.latestQuote ? {
              ...prev.latestQuote,
              is_locked: 0,
              subtotal: resJson.subtotal,
              tax_amount: resJson.taxAmount,
              total_amount: resJson.totalAmount
            } : prev.latestQuote
          };
        });
      }
    } catch (err) {
      console.error('Failed to sync toggle quote drawing:', err);
    }
  };

  // 8-2. Toggle All Quote Drawings Inclusion
  const handleToggleAllQuoteDrawings = async (isIncluded: boolean) => {
    setQuoteDropdownOpen(false);

    const incVal = isIncluded ? 1 : 0;
    setData((prev: any) => {
      if (!prev) return prev;
      const updatedDrawings = (prev.drawings || []).map((d: any) => ({
        ...d,
        is_quote_included: incVal,
        exclude_reason: isIncluded ? null : '일괄 제외'
      }));
      const updatedItems = (prev.quoteItems || []).map((qi: any) => ({ ...qi, is_included: incVal }));
      const updatedBom = (prev.normalizedItems || []).map((bi: any) => ({
        ...bi,
        is_quote_included: incVal,
        exclude_reason: isIncluded ? null : '일괄 제외'
      }));

      const activeSubtotal = isIncluded
        ? updatedItems.reduce((sum: number, qi: any) => sum + (Number(qi.amount) || 0), 0)
        : 0;
      const taxRate = prev.quotes?.[0]?.tax_rate ?? 0.10;
      const taxAmount = Math.round(activeSubtotal * taxRate);
      const totalAmount = activeSubtotal + taxAmount;

      const updatedQuotes = (prev.quotes || []).map((q: any, idx: number) => {
        if (idx === 0) {
          return { ...q, is_locked: 0, subtotal: activeSubtotal, tax_amount: taxAmount, total_amount: totalAmount };
        }
        return q;
      });

      return {
        ...prev,
        drawings: updatedDrawings,
        quoteItems: updatedItems,
        normalizedItems: updatedBom,
        quotes: updatedQuotes,
        latestQuote: prev.latestQuote ? {
          ...prev.latestQuote,
          is_locked: 0,
          subtotal: activeSubtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount
        } : prev.latestQuote
      };
    });

    // Synchronize selectedApprovalIds for Tab 2 checkboxes
    setSelectedApprovalIds(isIncluded ? (data?.normalizedItems || []).map((n: any) => n.id) : []);

    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/toggle-quote-drawing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, isIncluded })
      });
      if (res.ok) {
        const resJson = await res.json();
        setData((prev: any) => {
          if (!prev || !prev.quotes) return prev;
          const updatedQuotes = prev.quotes.map((q: any, idx: number) => {
            if (idx === 0) {
              return {
                ...q,
                is_locked: 0,
                subtotal: resJson.subtotal,
                tax_amount: resJson.taxAmount,
                total_amount: resJson.totalAmount
              };
            }
            return q;
          });
          return {
            ...prev,
            quotes: updatedQuotes,
            latestQuote: prev.latestQuote ? {
              ...prev.latestQuote,
              is_locked: 0,
              subtotal: resJson.subtotal,
              tax_amount: resJson.taxAmount,
              total_amount: resJson.totalAmount
            } : prev.latestQuote
          };
        });
      }
    } catch (err) {
      console.error('Failed to sync toggle all quote drawings:', err);
    }
  };

  // 8-3. Select Priced Items Only (단가 있는 품목만 선택)
  const handleSelectPricedOnly = async () => {
    setQuoteDropdownOpen(false);

    setData((prev: any) => {
      if (!prev || !prev.quoteItems) return prev;
      const updatedItems = prev.quoteItems.map((qi: any) => {
        const isPriced = Number(qi.unit_price) > 0;
        return { ...qi, is_included: isPriced ? 1 : 0 };
      });
      const activeSubtotal = updatedItems.reduce(
        (sum: number, qi: any) => (qi.is_included !== 0 ? sum + (Number(qi.amount) || 0) : sum),
        0
      );
      const taxRate = prev.quotes?.[0]?.tax_rate ?? 0.10;
      const taxAmount = Math.round(activeSubtotal * taxRate);
      const totalAmount = activeSubtotal + taxAmount;

      const updatedQuotes = (prev.quotes || []).map((q: any, idx: number) => {
        if (idx === 0) {
          return { ...q, is_locked: 0, subtotal: activeSubtotal, tax_amount: taxAmount, total_amount: totalAmount };
        }
        return q;
      });

      return {
        ...prev,
        quoteItems: updatedItems,
        quotes: updatedQuotes,
        latestQuote: prev.latestQuote ? {
          ...prev.latestQuote,
          is_locked: 0,
          subtotal: activeSubtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount
        } : prev.latestQuote
      };
    });

    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/toggle-quote-drawing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricedOnly: true })
      });
      if (res.ok) {
        const resJson = await res.json();
        setData((prev: any) => {
          if (!prev || !prev.quotes) return prev;
          const updatedQuotes = prev.quotes.map((q: any, idx: number) => {
            if (idx === 0) {
              return {
                ...q,
                is_locked: 0,
                subtotal: resJson.subtotal,
                tax_amount: resJson.taxAmount,
                total_amount: resJson.totalAmount
              };
            }
            return q;
          });
          return {
            ...prev,
            quotes: updatedQuotes,
            latestQuote: prev.latestQuote ? {
              ...prev.latestQuote,
              is_locked: 0,
              subtotal: resJson.subtotal,
              tax_amount: resJson.taxAmount,
              total_amount: resJson.totalAmount
            } : prev.latestQuote
          };
        });
      }
    } catch (err) {
      console.error('Failed to sync select priced only:', err);
    }
  };

  // 8-4. Exclude Duplicate Drawings (중복 도면 2번째 이후 일괄 제외)
  const handleExcludeDuplicates = async () => {
    setData((prev: any) => {
      if (!prev) return prev;
      const seen = new Set<string>();
      const updatedDrawings = (prev.drawings || []).map((dwg: any) => {
        const rawNo = (dwg.drawing_no_raw || '').trim();
        if (!rawNo) return dwg;
        if (seen.has(rawNo)) {
          return { ...dwg, is_quote_included: 0, exclude_reason: '중복 도면' };
        } else {
          seen.add(rawNo);
          return dwg;
        }
      });

      return {
        ...prev,
        drawings: updatedDrawings
      };
    });

    try {
      const res = await apiFetch(`/api/quotation-cases/${id}/toggle-quote-drawing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeDuplicates: true })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to sync exclude duplicate drawings:', err);
    }
  };

  // 9. Export to Excel (PROMPT 15)
  const handleExportExcel = async (quoteId: string, customOptions?: any) => {
    setActionLoading(true);
    setExportResult(null);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: customOptions ? JSON.stringify(customOptions) : undefined
      });
      const json = await res.json();
      if (res.ok) {
        setExportResult(json);
        await fetchData();
      } else {
        alert(json.error || '엑셀 출력 실패');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 💎 9-1. Export Step 2 Quote Items to XLS / XLSX / CSV
  const handleExportQuoteItems = async (format: 'xls' | 'xlsx' | 'csv' = step2ExportFormat) => {
    if (quoteItems.length === 0) return;
    setStep2ExportLoading(true);
    try {
      const XLSX = await import('xlsx');

      const headers = [
        'No',
        '견적 구분',
        '제외 사유',
        '마스터 코드',
        '도면 번호',
        '품명 (Standard Name)',
        '규격',
        '재질',
        '수량',
        '단위',
        '단가 (원)',
        '금액 (원)',
        '단가 출처',
        '매칭 신뢰도'
      ];

      const targetItems = quoteFilterTab === 'INCLUDED'
        ? quoteItems.filter((q: any) => q.is_included !== 0)
        : quoteFilterTab === 'EXCLUDED'
        ? quoteItems.filter((q: any) => q.is_included === 0)
        : quoteItems;

      const rows = targetItems.map((qi: any, i: number) => [
        i + 1,
        qi.is_included !== 0 ? '포함' : '제외',
        qi.exclude_reason || (qi.is_included !== 0 ? '' : '견적 제외'),
        qi.master_item_code || '',
        qi.drawing_no || '',
        qi.item_name || '',
        qi.specification || '',
        qi.material || '',
        Number(qi.quantity || 1),
        qi.unit || 'EA',
        Number(qi.unit_price || 0),
        Number(qi.amount || 0),
        qi.price_source || 'AI_PREDICTED',
        qi.match_confidence ? `${Math.round(qi.match_confidence * 100)}%` : '-'
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 10 }, // 견적 구분
        { wch: 14 }, // 제외 사유
        { wch: 16 }, // 마스터 코드
        { wch: 18 }, // 도면 번호
        { wch: 28 }, // 품명
        { wch: 16 }, // 규격
        { wch: 12 }, // 재질
        { wch: 8 },  // 수량
        { wch: 8 },  // 단위
        { wch: 14 }, // 단가
        { wch: 16 }, // 금액
        { wch: 16 }, // 단가 출처
        { wch: 12 }  // 신뢰도
      ];

      for (let r = 1; r <= rows.length; r++) {
        const uCell = XLSX.utils.encode_cell({ r, c: 10 });
        if (ws[uCell]) ws[uCell].z = '#,##0';
        const aCell = XLSX.utils.encode_cell({ r, c: 11 });
        if (ws[aCell]) ws[aCell].z = '#,##0';
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '견적품목목록');

      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const baseName = `견적품목목록_${latestQuote?.quote_no || id}_${dateStr}_${timeStr}`;

      const triggerDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      if (format === 'xls') {
        const out = XLSX.write(wb, { bookType: 'biff8', type: 'array' });
        const blob = new Blob([out], { type: 'application/vnd.ms-excel' });
        triggerDownload(blob, `${baseName}.xls`);
      } else if (format === 'xlsx') {
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerDownload(blob, `${baseName}.xlsx`);
      } else {
        const csvContent = '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `${baseName}.csv`);
      }
    } catch (err: any) {
      alert('엑셀 내보내기 오류: ' + err.message);
    } finally {
      setStep2ExportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <div className="text-slate-600 font-semibold text-sm">견적 워크벤치 로딩 중...</div>
      </div>
    );
  }

  const qc = data?.case;

  if (!qc) {
    return (
      <div className="max-w-xl mx-auto my-24 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center space-y-5">
        <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-900">견적의뢰 건을 불러올 수 없습니다</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {fetchError || '요청하신 견적건 ID가 존재하지 않거나, 조회 권한이 필요합니다.'}
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            다시 시도
          </button>
          <Link
            href="/cases"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            견적의뢰 메인 목록으로
          </Link>
        </div>
      </div>
    );
  }
  const rawFiles = data?.files || [];
  // User-facing primary source drawings only (exclude internal conversion artifacts like DERIVED and VECTOR_SVG)
  const files = rawFiles.filter((f: any) => 
    f.file_role !== 'VECTOR_SVG' && 
    f.file_type !== 'SVG' && 
    f.file_role !== 'DERIVED' && 
    !f.original_file_name.endsWith('.svg') &&
    !f.original_file_name.endsWith('.dwg.dxf')
  );
  const hasFiles = files.length > 0 || (data?.drawings && data.drawings.length > 0);
  const latestParseRun = hasFiles ? data?.latestParseRun : null;
  const analyzedFileId = latestParseRun?.source_file_id || (files.length > 0 ? files[0]?.id : null);
  const allDrawings = data?.drawings || [];

  // Check if a file is analyzed directly or via its derived DXF
  const isFileAnalyzed = (file: any) => {
    if (!file || allDrawings.length === 0) return false;
    if (file.id === analyzedFileId) return true;
    if (file.has_derived_dxf) return true;
    if (file.derived_from_file_id && file.derived_from_file_id === analyzedFileId) return true;
    const derived = (data?.allFiles || []).find((other: any) => other.derived_from_file_id === file.id);
    if (derived && derived.id === analyzedFileId) return true;
    if (latestParseRun && file.original_file_name) {
      const baseName = file.original_file_name.replace(/\.(dwg|dxf)$/i, '');
      const analyzedFile = (data?.allFiles || files).find((f: any) => f.id === analyzedFileId);
      if (analyzedFile && analyzedFile.original_file_name.startsWith(baseName)) return true;
    }
    return allDrawings.some((d: any) => d.source_file_id === file.id || !d.source_file_id);
  };
  
  // Resolve currently active file (always prefer primary source drawing)
  let activeFile = null;
  if (selectedFileId) {
    activeFile = files.find((f: any) => f.id === selectedFileId) || null;
  }
  if (!activeFile) {
    activeFile = files.find((f: any) => isFileAnalyzed(f)) || files[0] || null;
  }

  // Active drawings: show selected file's drawings when SINGLE mode, or all drawings when ALL mode
  let drawings = allDrawings;
  if (fileViewMode === 'SINGLE' && activeFile) {
    const filtered = allDrawings.filter((d: any) => d.source_file_id === activeFile.id);
    if (filtered.length > 0) {
      drawings = filtered;
    }
  }

  const rawBomItems = hasFiles ? (data?.rawBomItems || []) : [];
  const flattenedBomItems = hasFiles ? (data?.flattenedBomItems || []) : [];
  const normalizedItems = hasFiles ? (data?.normalizedItems || []) : [];
  const candidates = hasFiles ? (data?.candidates || []) : [];
  const finalBomItems = hasFiles ? (data?.finalBomItems || []) : [];
  const latestQuote = hasFiles ? data?.latestQuote : null;
  const quoteItems = hasFiles ? (data?.quoteItems || []) : [];

  // 💎 Filtered and Counted Normalized Items for Tab 2 (Calculated inline without hook to avoid early-return violation)
  const approvedItemIds = new Set(finalBomItems.map((f: any) => f.normalized_item_id));
  const pendingItemsCount = normalizedItems.filter((ni: any) => !approvedItemIds.has(ni.id) && ni.is_quote_included !== 0).length;
  const approvedItemsCount = normalizedItems.filter((ni: any) => approvedItemIds.has(ni.id)).length;
  const quoteIncCount = normalizedItems.filter((ni: any) => ni.is_quote_included !== 0).length;
  const quoteExcCount = normalizedItems.filter((ni: any) => ni.is_quote_included === 0).length;

  // 💎 Similarity Analysis Counts (고신뢰도, 확인권장, 미등록)
  const highConfidenceCount = normalizedItems.filter((ni: any) => 
    (ni.standard_schema_suggestion?.confidence_grade === 'HIGH' || (ni.standard_schema_suggestion?.similarity_score || 0) >= 90)
  ).length;
  const mediumConfidenceCount = normalizedItems.filter((ni: any) => {
    const s = ni.standard_schema_suggestion?.similarity_score || 0;
    return (ni.standard_schema_suggestion?.confidence_grade === 'MEDIUM' || (s >= 70 && s < 90));
  }).length;
  const lowConfidenceCount = normalizedItems.filter((ni: any) => {
    const s = ni.standard_schema_suggestion?.similarity_score || 0;
    return (ni.standard_schema_suggestion?.confidence_grade === 'LOW' || s < 70);
  }).length;

  const filteredNormalizedItems = normalizedItems.filter((ni: any) => {
    const isApproved = approvedItemIds.has(ni.id);
    if (approvalFilterTab === 'PENDING' && (isApproved || ni.is_quote_included === 0)) return false;
    if (approvalFilterTab === 'APPROVED' && !isApproved) return false;
    if (approvalFilterTab === 'QUOTE_INCLUDED' && ni.is_quote_included === 0) return false;
    if (approvalFilterTab === 'QUOTE_EXCLUDED' && (ni.is_quote_included === undefined || ni.is_quote_included === 1)) return false;

    // Similarity Grade Filter
    if (similarityFilter === 'HIGH') {
      const s = ni.standard_schema_suggestion?.similarity_score || 0;
      if (s < 90 && ni.standard_schema_suggestion?.confidence_grade !== 'HIGH') return false;
    } else if (similarityFilter === 'MEDIUM') {
      const s = ni.standard_schema_suggestion?.similarity_score || 0;
      if (s < 70 || s >= 90) return false;
    } else if (similarityFilter === 'LOW') {
      const s = ni.standard_schema_suggestion?.similarity_score || 0;
      if (s >= 70) return false;
    }

    if (approvalSearchText.trim()) {
      const query = approvalSearchText.trim().toLowerCase();
      const dwgNo = (ni.drawing_no || '').toLowerCase();
      const name = (ni.drawing_name || ni.normalized_name || '').toLowerCase();
      const rawName = (ni.raw_name || '').toLowerCase();
      const mat = (ni.drawing_material || ni.material_candidate || '').toLowerCase();
      const proj = (ni.project_name || '').toLowerCase();
      return dwgNo.includes(query) || name.includes(query) || rawName.includes(query) || mat.includes(query) || proj.includes(query);
    }
    return true;
  });

  // 💎 Live Real-Time Statistics for Quote Items (Calculated inline without hook to avoid early-return violation)
  let totalAllQty = 0;
  let totalIncludedQty = 0;
  let liveActiveSubtotal = 0;
  quoteItems.forEach((qi: any) => {
    const q = Number(qi.quantity) || 0;
    totalAllQty += q;
    if (qi.is_included !== 0) {
      totalIncludedQty += q;
      liveActiveSubtotal += Number(qi.amount) || 0;
    }
  });
  const totalQtyStats = { totalAll: totalAllQty, totalIncluded: totalIncludedQty };
  const liveTaxRate = latestQuote?.tax_rate ?? 0.10;
  const liveActiveTax = Math.round(liveActiveSubtotal * liveTaxRate);
  const liveActiveTotal = liveActiveSubtotal + liveActiveTax;

  // 💎 Permission & Ownership Resolution
  const permission = data?.permission;
  const isOwner = permission ? permission.isOwner : (user?.userId === qc?.created_by_user_id);
  const canEdit = permission ? permission.canEdit : true;
  const requiresApproval = permission ? permission.requiresApproval : false;
  const approvalStatus = permission?.approvalStatus || 'NONE';
  const ownerName = permission?.ownerName || qc?.created_by_name || '담당자';

  return (
    <div className="space-y-6 px-3 sm:px-4 py-3">
      {/* Top Breadcrumb & Return to Main Navigation Bar */}
      <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center space-x-3">
          <Link
            href="/cases"
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-all shadow-2xs group cursor-pointer"
            title="견적의뢰 관리 메인 목록(대시보드)으로 돌아가기"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600 transition-transform group-hover:-translate-x-1" />
            <span>견적의뢰 메인 목록으로</span>
          </Link>
          <span className="text-slate-300">|</span>
          <nav className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
            <Link href="/cases" className="hover:text-blue-600 flex items-center space-x-1">
              <Home className="w-3.5 h-3.5" />
              <span>메인</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <Link href="/cases" className="hover:text-blue-600 font-semibold text-slate-600">
              견적의뢰 관리
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 font-bold font-mono">{qc.case_no}</span>
            <span className="text-slate-500 truncate max-w-[220px]">({qc.case_name})</span>
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          {/* Active User Quick Status */}
          <div className="hidden md:flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs">
            <span className="text-[11px] text-slate-400">현재 접속자:</span>
            <span className="font-bold text-slate-800">
              {user ? user.name : '비로그인 게스트'}
            </span>
            {user?.role === 'SUPER_ADMIN' ? (
              <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                최고관리자
              </span>
            ) : user ? (
              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                {user.department || '영업담당'}
              </span>
            ) : null}
            <Link
              href="/login"
              className="ml-1 text-[11px] text-blue-600 hover:text-blue-800 underline font-semibold"
            >
              담당자 변경
            </Link>
          </div>
        </div>
      </div>

      {/* ⚠️ Company Unassigned / Logo Detected Notice Banner */}
      {(qc?.company_id === 'comp_unassigned' || qc?.company_name === '고객사 미지정') && (
        <div className="no-print print:hidden p-4 bg-amber-500/10 border-2 border-amber-500/60 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-amber-900 shadow-xs animate-in fade-in">
          <div className="flex items-start space-x-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-amber-900 flex items-center gap-2">
                <span>⚠️ 도면 표제란 회사명 미검출 (로고 이미지 또는 약식 표제란 감지)</span>
                <span className="bg-amber-200 text-amber-950 px-2 py-0.5 rounded text-[10px] font-bold">설계자 판단 필요</span>
              </div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                CAD 도면 표제란에 텍스트 회사명이 감지되지 않았습니다 (로고 이미지 또는 기재 생략).<br className="hidden sm:inline" />
                회사명이 없을 경우 고객사를 직접 지정하거나, 미지정 상태로 견적을 계속 진행하실 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            <button
              onClick={handleOpenCompanyModal}
              className="btn-hover-effect px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>고객사 직접 입력 / 선택</span>
            </button>
          </div>
        </div>
      )}

      {/* 📦 Archived Case Notice Banner */}
      {qc?.lifecycle_status === 'ARCHIVED' && (
        <div className="no-print print:hidden p-4 bg-purple-50 border-2 border-purple-300 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-purple-900 shadow-xs animate-in fade-in">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-300 flex items-center justify-center shrink-0 text-purple-700 mt-0.5">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-purple-900 flex items-center gap-2">
                <span>📦 보관 처리된 견적건입니다</span>
                <span className="bg-purple-200 text-purple-950 px-2 py-0.5 rounded text-[10px] font-bold">
                  사유: {qc.archive_reason || '보류/이력'}
                </span>
                {qc.archived_at && (
                  <span className="text-purple-600 text-[11px] font-normal">
                    (보관일: {new Date(qc.archived_at).toLocaleDateString('ko-KR')})
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                현재 보관함에 보관 중인 상태입니다. 이어서 견적을 진행하거나 내용을 수정하시려면 <strong>‘작업 활성 상태로 복원’</strong>을 클릭하세요.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            <button
              onClick={handleRestoreCase}
              disabled={detailLifecycleLoading}
              className="btn-hover-effect px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{detailLifecycleLoading ? '처리 중...' : '작업 활성 상태로 복원'}</span>
            </button>
            <button
              onClick={handleTrashCase}
              disabled={detailLifecycleLoading}
              className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>휴지통으로</span>
            </button>
          </div>
        </div>
      )}

      {/* 🗑️ Trashed Case Notice Banner */}
      {qc?.lifecycle_status === 'TRASHED' && (
        <div className="no-print print:hidden p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-rose-900 shadow-xs animate-in fade-in">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0 text-rose-700 mt-0.5">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-rose-900 flex items-center gap-2">
                <span>🗑️ 휴지통에 보관된 견적건입니다</span>
                <span className="bg-rose-200 text-rose-950 px-2 py-0.5 rounded text-[10px] font-bold">삭제 대기 상태</span>
                {qc.trashed_at && (
                  <span className="text-rose-600 text-[11px] font-normal">
                    (삭제일: {new Date(qc.trashed_at).toLocaleDateString('ko-KR')})
                  </span>
                )}
              </div>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                휴지통에 있는 견적건은 목록 및 검색에서 제외되어 있습니다. 언제든 복원하거나 불필요한 경우 영구 삭제할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            <button
              onClick={handleRestoreCase}
              disabled={detailLifecycleLoading}
              className="btn-hover-effect px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{detailLifecycleLoading ? '처리 중...' : '견적건 복원'}</span>
            </button>
            <button
              onClick={handlePermanentDeleteCase}
              disabled={detailLifecycleLoading}
              className="btn-hover-effect px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <Trash className="w-3.5 h-3.5" />
              <span>완전 영구 삭제</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="no-print print:hidden bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <span className="text-sm font-mono font-bold px-3 py-1 bg-slate-100 text-slate-800 rounded-lg">
              {qc.case_no}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              <span>담당자: {qc.created_by_name || ownerName}</span>
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                qc.quote_readiness === 'READY_FOR_QUOTE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : qc.status === 'ANALYZED'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {qc.quote_readiness === 'READY_FOR_QUOTE'
                ? '견적 산출 준비완료 (READY_FOR_QUOTE)'
                : qc.status === 'ANALYZED'
                ? '도면/BOM 분석완료 (검토 필요)'
                : '도면 등록 대기'}
            </span>

            {/* Permission Badge */}
            {isOwner ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                내 견적 담당건 (자유 수정·승인)
              </span>
            ) : permission?.isSuspended ? (
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  결재 보류 모드 (자유 견적 진행)
                </span>
                {latestQuote && (
                  <button
                    type="button"
                    onClick={() => handleCloneVersion(latestQuote.id)}
                    disabled={actionLoading}
                    className="btn-hover-effect px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50 transition-all"
                    title="타 담당자 원본을 보존하고 내 전용 새 버전(V2)으로 복제하여 작업"
                  >
                    <Copy className="w-3 h-3" />
                    <span>새 버전(V{latestQuote.quote_version + 1})으로 복제</span>
                  </button>
                )}
              </div>
            ) : canEdit ? (
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  최고관리자 승인 완료 (수정 활성)
                </span>
                {latestQuote && (
                  <button
                    type="button"
                    onClick={() => handleCloneVersion(latestQuote.id)}
                    disabled={actionLoading}
                    className="btn-hover-effect px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50 transition-all"
                    title="타 담당자 원본을 보존하고 내 전용 새 버전(V2)으로 복제하여 작업"
                  >
                    <Copy className="w-3 h-3" />
                    <span>새 버전(V{latestQuote.quote_version + 1})으로 복제</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  타 담당자 건 ({ownerName}) - 읽기/참조 모드
                </span>
                {latestQuote && (
                  <button
                    type="button"
                    onClick={() => handleCloneVersion(latestQuote.id)}
                    disabled={actionLoading}
                    className="btn-hover-effect px-3 py-1 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all"
                    title="타 담당자 원본을 덮어쓰지 않고, 안전하게 새 버전으로 복제하여 내 담당으로 수정"
                  >
                    <Copy className="w-3 h-3" />
                    <span>📑 새 버전(V{latestQuote.quote_version + 1})으로 복제하여 수정</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBypassApproval}
                  disabled={actionLoading}
                  className="btn-hover-effect px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-300 hover:border-emerald-300 shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50 transition-all"
                  title="최고관리자 결재 승인 없이 즉시 직접 견적 진행"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>결재 없이 직접진행</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-900">{qc.case_name}</h1>
            {qc.visibility === 'SHARED' && <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">사내 공유중</span>}
            {qc.visibility === 'PRIVATE_PENDING' && <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">공개 불가 심사중</span>}
            {qc.visibility === 'PRIVATE' && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">공개 불가(보안)</span>}
          </div>
          {qc.visibility === 'SHARED' && (user?.userId === qc.created_by_user_id || user?.role === 'SUPER_ADMIN') && (
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="mt-2 text-xs text-slate-500 hover:text-amber-600 underline text-left"
            >
              이 견적건 공개 불가 요청하기
            </button>
          )}
          {qc.visibility === 'PRIVATE_PENDING' && user?.role === 'SUPER_ADMIN' && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-bold text-amber-800 mb-1">비공개 요청 사유:</p>
              <p className="text-sm text-amber-900 mb-3">{qc.visibility_reason}</p>
              <div className="flex space-x-2">
                <button
                  onClick={async () => {
                    if(!confirm('비공개 요청을 승인하시겠습니까?')) return;
                    const res = await apiFetch(`/api/quotation-cases/${id}/visibility`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'APPROVE' })
                    });
                    if (res.ok) fetchData();
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded transition-colors"
                >
                  승인 (비공개)
                </button>
                <button
                  onClick={async () => {
                    if(!confirm('비공개 요청을 반려하시겠습니까?')) return;
                    const res = await apiFetch(`/api/quotation-cases/${id}/visibility`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'REJECT' })
                    });
                    if (res.ok) fetchData();
                  }}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-colors"
                >
                  반려 (공유 유지)
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
            <span className="flex items-center space-x-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {qc.company_id === 'comp_unassigned' || qc.company_name === '고객사 미지정' ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  ⚠️ 고객사 미지정
                  <button
                    onClick={handleOpenCompanyModal}
                    className="text-[11px] text-blue-700 hover:text-blue-900 underline font-bold cursor-pointer"
                  >
                    [지정]
                  </button>
                </span>
              ) : (
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  {qc.company_name}
                  <button
                    onClick={handleOpenCompanyModal}
                    className="text-[10px] text-slate-400 hover:text-blue-600 font-normal cursor-pointer ml-1"
                    title="고객사명 수정"
                  >
                    <Pencil className="w-3 h-3 inline" />
                  </button>
                </span>
              )}
            </span>
            <span className="flex items-center space-x-1">
              <Folder className="w-3.5 h-3.5 text-slate-400" />
              <span>{qc.company_id === 'comp_unassigned' ? '프로젝트 미정' : qc.project_name}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>의뢰일: {qc.request_date}</span>
            </span>
          </div>
        </div>

        {/* Quick Return, Lifecycle Actions & Quick Stats */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            {qc?.lifecycle_status === 'ARCHIVED' ? (
              <button
                type="button"
                onClick={handleRestoreCase}
                disabled={detailLifecycleLoading}
                className="inline-flex items-center space-x-1 px-3 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-xl text-xs font-bold text-purple-700 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                title="작업 활성 상태로 복원"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>복원</span>
              </button>
            ) : qc?.lifecycle_status === 'TRASHED' ? (
              <button
                type="button"
                onClick={handleRestoreCase}
                disabled={detailLifecycleLoading}
                className="inline-flex items-center space-x-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-700 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                title="휴지통에서 복원"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>복원</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDetailArchiveModalOpen(true)}
                  className="inline-flex items-center space-x-1 px-2.5 py-2 bg-white hover:bg-purple-50 border border-purple-200 hover:border-purple-300 rounded-xl text-xs font-bold text-purple-700 transition-all shadow-2xs cursor-pointer"
                  title="견적건 보관함으로 이동 (보류/이력)"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>보관</span>
                </button>
                <button
                  type="button"
                  onClick={handleTrashCase}
                  disabled={detailLifecycleLoading}
                  className="inline-flex items-center space-x-1 px-2.5 py-2 bg-white hover:bg-rose-50 border border-rose-200 hover:border-rose-300 rounded-xl text-xs font-bold text-rose-600 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                  title="견적건 휴지통으로 이동 (삭제)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>삭제</span>
                </button>
              </>
            )}
          </div>

            {/* 📊 수량 정합성 워터폴(Waterfall) 인포 바 */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <div className="text-center px-2 border-r border-slate-200" title="분석 완료된 CAD 도면 장수">
                <div className="text-[10px] text-slate-500 font-medium">총 도면</div>
                <div className="text-sm font-bold text-slate-900 font-mono">{drawings.length}장</div>
              </div>
              <div className="text-center px-2 border-r border-slate-200" title="단일 가공비 계산에서 제외되는 유닛/메인 조립도">
                <div className="text-[10px] text-slate-500 font-medium">조립도(제외)</div>
                <div className="text-sm font-bold text-slate-600 font-mono">
                  {drawings.filter((d: any) => d.drawing_type === 'MAIN_ASSEMBLY' || d.drawing_type === 'SUB_ASSEMBLY').length}장
                </div>
              </div>
              <div className="text-center px-2 border-r border-slate-200" title={`도면 123장 + 도면 없는 규격/구매품 ${Math.max(0, normalizedItems.length - drawings.length)}개`}>
                <div className="text-[10px] text-slate-500 font-medium">정규화 BOM</div>
                <div className="text-sm font-bold text-slate-800 font-mono">
                  {normalizedItems.length || drawings.length}개
                </div>
              </div>
              <div className="text-center px-2" title="실제 2단계 단가 검토 및 견적 대상 (가공품 107 + 규격품 2)">
                <div className="text-[10px] text-indigo-700 font-bold">견적 대상</div>
                <div className="text-sm font-bold text-blue-700 font-mono">
                  {normalizedItems.filter((ni: any) => ni.drawing_type !== 'MAIN_ASSEMBLY' && ni.drawing_type !== 'SUB_ASSEMBLY' && ni.is_quote_included !== 0).length || (drawings.length - 16)}종
                </div>
              </div>
            </div>

          </div>
        </div>

      {/* Approval Feedback Alert */}
      {approvalFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center space-x-2 ${
            approvalFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{approvalFeedback.text}</span>
        </div>
      )}

      {/* Cross-User Permission Notification Banner */}
      {!isOwner && (
        <div>
          {permission?.isSuspended ? (
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border-2 border-indigo-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    <span>⚡ 최고관리자 결재 승인 기능 보류 중 (자유 견적 진행 모드)</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold px-2 py-0.2 rounded-full">
                      수정·승인 자유 진행 활성
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    현재 단계에서는 최고관리자 결재 승인 절차가 보류되어 있어, 타 담당자({ownerName} 님) 건도 결재 대기 없이 모든 담당자({user?.name})가 자유롭게 수정, BOM 승인 및 견적서를 산출할 수 있습니다.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('approval')}
                  className="btn-hover-effect px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>2. 마스터 매칭 & 승인 바로가기 ➡️</span>
                </button>
              </div>
            </div>
          ) : canEdit ? (
            <div className="bg-blue-50/90 border border-blue-300 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <span>최고관리자 결재 승인 완료: 타 담당자({ownerName} 님)의 견적건 수정 권한 활성화됨</span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    최고관리자의 승인이 완료되어 단가 수정, BOM 일괄 승인, 견적서 산출 및 발행 작업을 수행할 수 있습니다.
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg shadow-xs shrink-0">
                수정 권한 활성
              </span>
            </div>
          ) : approvalStatus === 'PENDING' ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                  <Clock className="w-4 h-4 animate-spin text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span>최고관리자 결재 대기 중: 타 담당자({ownerName} 님) 건 수정/승인 권한 심사 중</span>
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    {permission?.requestedAt ? `신청 일시: ${new Date(permission.requestedAt).toLocaleString('ko-KR')} | ` : ''}
                    최고관리자가 승인 결재를 검토 중입니다. 아래 버튼을 눌러 승인 없이 즉시 견적을 진행할 수 있습니다.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-1">
                <span className="px-3 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300 shrink-0">
                  결재 대기 중
                </span>
                <button
                  type="button"
                  onClick={handleBypassApproval}
                  disabled={actionLoading}
                  className="btn-hover-effect px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0"
                  title="최고관리자의 승인 대기를 건너뛰고 결재 승인 없이 즉시 견적 진행(수정/승인/산출)을 시작합니다."
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>최고관리자 결재 승인 없이 견적 진행 🚀</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-amber-50 via-sky-50 to-blue-50 border-2 border-amber-300 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start sm:items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5 sm:mt-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <span>타 담당자({ownerName} 님)의 견적 진행건 (원본 보존 모드)</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                      추천: 새 버전 복제 수정
                    </span>
                    {approvalStatus === 'REJECTED' && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 font-extrabold px-1.5 py-0.5 rounded border border-rose-300">
                        이전 요청 반려됨 {permission?.reviewComment ? `("${permission.reviewComment}")` : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    다른 담당자의 원본 견적서를 안전하게 보존하고 업무 혼선(단가 왜곡 및 책임 공방)을 방지하기 위해 <strong>새 버전으로 복제하여 작업</strong>하는 방식을 권장합니다. 필요한 경우 관리자 결재 없이 즉시 원본 수정도 가능합니다.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {latestQuote && (
                  <button
                    type="button"
                    onClick={() => handleCloneVersion(latestQuote.id)}
                    disabled={actionLoading}
                    className="btn-hover-effect px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0"
                    title="타 담당자 원본을 보존하고 새 버전(V2)으로 복제하여 내 담당으로 즉시 안전하게 수정"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>📑 새 버전(V{latestQuote.quote_version + 1})으로 복제하여 수정 (추천)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBypassApproval}
                  disabled={actionLoading}
                  className="btn-hover-effect px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-emerald-50 hover:text-emerald-700 border border-slate-300 hover:border-emerald-400 rounded-lg shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0"
                  title="원본 견적서를 결재 없이 직접 수정 진행"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>결재 없이 원본 직접진행</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(true)}
                  className="px-2.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors flex items-center justify-center space-x-1 shrink-0 cursor-pointer"
                  title="최고관리자에게 공식 수정 결재 요청"
                >
                  <Send className="w-3 h-3 text-slate-500" />
                  <span>결재 요청</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🚀 CADON v3.0: 5단계 스마트 분석 파이프라인 네비게이터 & 실시간 가이드 (대시보드 100% 일치화) */}
      <div className="no-print print:hidden mb-2 rounded-2xl overflow-hidden border border-slate-200 shadow-2xs">
        <PipelineNavigator 
          caseId={id} 
          currentStep={workflowStep}
          onStepChange={(s) => {
            setWorkflowStep(s);
            if (s === 1) setIsSidebarOpen(true);
          }}
          stats={{
            unconfirmedCount: normalizedItems.filter((ni: any) => ni.drawing_type !== 'MAIN_ASSEMBLY' && ni.drawing_type !== 'SUB_ASSEMBLY' && ni.is_quote_included !== 0).length || (drawings.length - 16),
            hasRevisionDiff: false
          }}
          caseInfo={{
            caseNo: qc?.case_no,
            caseName: qc?.case_name,
            companyName: (qc?.company_name && qc?.company_name !== '고객사 미지정' && qc?.company_name !== 'comp_unassigned') ? qc.company_name : '',
            drawingsCount: drawings.length,
            bomCount: normalizedItems.length || rawBomItems.length || drawings.length,
            quoteItemCount: quoteIncCount || normalizedItems.filter((ni: any) => ni.drawing_type !== 'MAIN_ASSEMBLY' && ni.drawing_type !== 'SUB_ASSEMBLY' && ni.is_quote_included !== 0).length
          }}
        />

        {/* 5단계 실시간 스마트 가이드 팁 */}
        <div className="bg-slate-900 text-slate-200 px-4 sm:px-6 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-blue-600 font-semibold text-[10px] text-white">가이드</span>
            <span className="text-slate-300">
              {workflowStep === 1 && (
                <span>1단계: 좌측 패널에서 고객사로부터 접수된 도면 파일(DWG, DXF)을 등록하고 관리하세요. 완료 후 상단 <strong>[2. AI 도면 파싱]</strong>을 클릭하세요.</span>
              )}
              {workflowStep === 2 && (
                <span>2단계: AI가 파싱한 86개 시트의 2D CAD 벡터 도면 형상, 치수, 도곽을 검토하세요. 검토 후 상단 <strong>[3. 가상 BOM 추출]</strong>을 클릭하세요. (WebGL 60FPS 무랙 가동)</span>
              )}
              {workflowStep === 3 && (
                <span>3단계: 도면 표제란 기반 가상 BOM 부품 목록과 수량을 검토하세요. 검토 완료 후 상단 <strong>[4. 마스터 단가 매칭]</strong>을 클릭하여 3분할 통합 단가 계산을 진행하세요.</span>
              )}
              {workflowStep >= 4 && (
                <span>현재 단가 검토 및 견적서 발행 단계입니다. 상단 네비게이터를 클릭하여 언제든 전 단계로 0초(무랙) 복귀할 수 있습니다.</span>
              )}
            </span>
          </div>
          <span className="text-slate-500 text-[10px] font-mono hidden md:inline">CADON Engine v3.0</span>
        </div>
      </div>

      {/* 등록된 도면이 없는 경우 직관적인 업로드 유도 가이드 배너 */}
      {files.length === 0 && !loading && (
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-xs">
                현재 등록된 도면 파일이 없습니다.
              </p>
              <p className="text-slate-600 text-[11px] mt-0.5">
                좌측의 <strong>[통합 도면 파일 등록]</strong> 영역에 DWG 또는 DXF 도면 파일을 끌어다 놓으시면 AI 도면 분석 및 BOM 전개가 시작됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsSidebarOpen(true);
              document.getElementById('file-upload')?.click();
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shrink-0 transition-colors shadow-xs cursor-pointer flex items-center space-x-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>도면 파일 첨부하기</span>
          </button>
        </div>
      )}

      {/* TAB 1: CAD File Upload & Viewer (PROMPT 03, 04, 05, 06, 18-R1, 18-R2) */}
      <div className={activeTab === 'cad' ? `flex flex-col lg:flex-row ${isSidebarOpen ? 'gap-4' : ''} items-start w-full relative` : "hidden"}>
          {/* Unified Upload & Files Left Panel (Collapsible) */}
          {isSidebarOpen ? (
            <div className="w-full lg:w-[340px] xl:w-[360px] shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 animate-in fade-in slide-in-from-left-2 relative">
              {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 표준화 공통 컴포넌트 (top-1/2 수직 중앙 정렬) */}
              <SidebarBookmarkTab
                mode="collapse"
                onClick={() => setIsSidebarOpen(false)}
                label="접기"
                title="도면 등록 패널 접기"
              />
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>통합 도면 파일 등록</span>
                </h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  title="도면 등록 패널 접기"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Unified Dropzone with Native Drag & Drop */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleProcessFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl ${files.length > 0 ? 'p-3' : 'p-5'} text-center transition-all ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50 scale-[1.02] shadow-md ring-4 ring-blue-100'
                    : 'border-slate-200 hover:border-blue-500 bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  id="file-upload"
                  accept=".dwg,.dxf,.pdf,.xls,.xlsx"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = '';
                  }}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <div className={`${files.length > 0 ? 'w-8 h-8 rounded-xl mb-1.5' : 'w-12 h-12 rounded-2xl mb-2.5'} flex items-center justify-center mx-auto transition-colors ${
                    isDragging ? 'bg-blue-600 text-white animate-bounce' : 'bg-blue-100 text-blue-600'
                  }`}>
                    <Upload className={files.length > 0 ? "w-4 h-4" : "w-6 h-6"} />
                  </div>
                  <span className="text-xs font-bold text-slate-900 block">
                    {isDragging ? '🚀 파일을 놓으면 즉시 분석 시작!' : files.length > 0 ? '+ 추가 도면 파일 드래그 & 드롭' : 'DWG 또는 DXF 도면 드래그 & 드롭'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {files.length > 0 ? '(클릭하여 파일 추가)' : '(클릭하여 파일 선택 가능 / 지원: .dwg, .dxf)'}
                  </span>
                </label>
              </div>

              {(uploading || analyzing) && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl flex items-center space-x-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">
                      {uploading ? '도면 업로드 및 무결성 검증 중...' : 'DWG 자동변환 및 다단계 BOM 분석 중...'}
                    </span>
                    <span className="text-[11px] text-blue-600 block">
                      {uploading ? '서버 스토리지 저장 중' : 'LibreDWG 변환 → ezdxf 파싱 → 다단계 BOM 롤업'}
                    </span>
                  </div>
                </div>
              )}


              {/* Uploaded Files List */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    등록된 도면 파일 목록 ({files.length})
                  </h4>
                  {/* Button 4: Multi-Drawing View Mode Toggle Chip */}
                  {allDrawings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFileViewMode(prev => prev === 'ALL' ? 'SINGLE' : 'ALL')}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all shadow-2xs cursor-pointer ${
                        fileViewMode === 'ALL'
                          ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                      title={fileViewMode === 'ALL' ? '모든 등록 도면의 데이터를 통합하여 보고 있습니다' : '선택한 파일의 도면만 단독으로 보고 있습니다'}
                    >
                      <span>{fileViewMode === 'ALL' ? '📂 전체 도면 통합 보기' : '📄 개별 도면 보기'}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        fileViewMode === 'ALL' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`} title={`CAD 도면 ${drawings.length}장 / 정규화 BOM ${normalizedItems.length}개 품목 연동`}>
                        {fileViewMode === 'ALL' ? `${drawings.length}장` : `${drawings.length}장`}
                      </span>
                    </button>
                  )}
                </div>
                {files.map((f: any) => {
                  const isSelected = (selectedFileId === f.id) || (!selectedFileId && f.id === activeFile?.id);
                  const isCurrentlyAnalyzed = isFileAnalyzed(f);
                  const isThisFileAnalyzing = analyzing && analyzingFileId === f.id;
                  const isDwg = f.file_type === 'DWG' || f.original_file_name.endsWith('.dwg');

                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFileId(f.id)}
                      className={`p-3 rounded-xl border text-xs space-y-2 cursor-pointer transition-all ${
                        isThisFileAnalyzing
                          ? 'bg-amber-50/90 border-amber-500 shadow-md ring-2 ring-amber-400/50 animate-pulse'
                          : isSelected
                          ? 'bg-blue-50/90 border-blue-500 shadow-sm ring-2 ring-blue-400/50'
                          : 'bg-slate-50 hover:bg-slate-100/90 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <div className="flex items-center space-x-2 truncate">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isThisFileAnalyzing
                              ? 'bg-amber-500 animate-ping'
                              : isCurrentlyAnalyzed
                              ? 'bg-emerald-500 ring-2 ring-emerald-300'
                              : isSelected
                              ? 'bg-blue-600'
                              : 'bg-slate-300'
                          }`} />
                          <span className="truncate font-bold text-slate-900">{f.original_file_name}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isDwg ? 'bg-blue-600 text-white' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {isDwg ? '원본 DWG' : 'CAD DXF'}
                          </span>
                          {f.has_derived_dxf && (
                            <span className="px-1.5 py-0.5 rounded font-mono text-[9.5px] font-bold bg-purple-100 text-purple-700 border border-purple-200" title="WebGL 렌더링용 DXF 변환 완료">
                              DXF 변환완료
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(f.id, f.original_file_name);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 transition-colors cursor-pointer"
                            title="도면 파일 삭제"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <span className="font-mono">{(f.file_size / 1024).toFixed(1)} KB</span>
                        {isThisFileAnalyzing ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 font-bold flex items-center space-x-1">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                            <span>현재 분석 진행 중...</span>
                          </span>
                        ) : isCurrentlyAnalyzed ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 font-bold flex items-center space-x-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>분석 완료 ({drawings.length}개 도면)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-600 font-medium">
                            업로드 완료 (대기)
                          </span>
                        )}
                      </div>

                      {/* File Action Toolbar on Selection */}
                      {isSelected && !analyzing && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-blue-200/60">
                          <span className="text-[11px] text-blue-700 font-semibold">
                            {isCurrentlyAnalyzed ? '도면 뷰어 활성화됨' : '선택된 도면'}
                          </span>
                          {!isCurrentlyAnalyzed ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartAnalysis(f.id);
                              }}
                              disabled={analyzing}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>이 도면으로 분석 실행</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center space-x-1">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>{drawings.length}개 도면 표시 중</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* 🔖 버티컬 북마크(책갈피) 견출 탭 - 표준화 공통 컴포넌트 (top-1/2 수직 중앙 정렬) */}
          {!isSidebarOpen && (
            <SidebarBookmarkTab
              mode="expand"
              onClick={() => setIsSidebarOpen(true)}
              label="도면등록"
              icon={Folder}
              title={`도면 등록 패널 열기 (${files.length}개 도면 등록됨)`}
              positionOverride="absolute"
            />
          )}

          {/* 2D Real CAD Vector Viewer (Takes 100% of remaining width!) */}
          <div className="flex-1 w-full min-w-0">
            <CadViewer
              caseId={id}
              cadObjects={data?.cadObjects || []}
              drawings={drawings}
              relationships={data?.relationships || []}
              bomAreas={data?.bomAreas || []}
              rawBomItems={rawBomItems}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              externalFocusIdx={externalFocusIdx}
              onClearExternalFocus={() => setExternalFocusIdx(null)}
              quoteItems={quoteItems}
              latestQuote={latestQuote}
              onToggleQuoteItem={handleToggleQuoteDrawing}
              onToggleAllQuoteDrawings={handleToggleAllQuoteDrawings}
              onExcludeDuplicates={handleExcludeDuplicates}
              selectedFile={activeFile}
              onStartAnalysis={handleStartAnalysis}
              isAnalyzing={analyzing}
              allFiles={files}
              onSelectFile={(fileId) => setSelectedFileId(fileId)}
              onBomUpdated={fetchData}
              controlledViewMode={workflowStep === 3 ? 'SHEET' : 'CAD'}
              onViewModeChange={(m) => setWorkflowStep(m === 'CAD' ? 2 : 3)}
            />
          </div>
      </div>

      {/* TAB 2: Quote Engine & Pricing Workspace (PROMPT 14) */}
      {activeTab === 'quote' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">견적서 작성 및 단가 산출 (Quote Engine)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                승인된 Final BOM 기준으로 Price Master 단가를 매칭하여 품목별 금액, 소계, 부가세(10%), 총 견적금액을 계산합니다.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCreateQuote}
                disabled={actionLoading}
                className="btn-hover-effect px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                title="현재 검수 승인된 전체 Final BOM 품목을 반영하여 최신 견적서를 재산출합니다."
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>{latestQuote ? '최신 승인 BOM으로 견적서 재계산' : 'BOM 견적서 생성'}</span>
              </button>
              {latestQuote && (
                <button
                  onClick={() => handleCloneVersion(latestQuote.id)}
                  className="btn-hover-effect-secondary px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  새 버전 복제 (V{latestQuote.quote_version + 1})
                </button>
              )}
            </div>
          </div>

          {/* Mismatch Warning Alert Banner (If approved items count doesn't match quote items count) */}
          {finalBomItems.filter((f: any) => f.approval_status === 'APPROVED').length !== quoteItems.length && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-xs text-amber-900">
                    최신 승인된 BOM 품목({finalBomItems.filter((f: any) => f.approval_status === 'APPROVED').length}개)이 현재 견적서({quoteItems.length}개)와 일치하지 않습니다.
                  </h4>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    도면 품목 승인 내역을 견적서에 반영하려면 아래 버튼을 클릭하여 견적서를 최신으로 동기화하세요.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCreateQuote}
                disabled={actionLoading}
                className="btn-hover-effect px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 shrink-0 cursor-pointer self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>최신 {finalBomItems.filter((f: any) => f.approval_status === 'APPROVED').length}개 품목으로 견적서 동기화 🔄</span>
              </button>
            </div>
          )}

          {latestQuote ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              {/* Quote Header Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">견적번호</span>
                  <span className="text-sm font-bold font-mono text-slate-900">{latestQuote.quote_no}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">견적상태</span>
                  <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap gap-y-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      latestQuote.is_locked ? 'bg-amber-100 text-amber-850 border border-amber-300' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {latestQuote.status} {latestQuote.is_locked ? '(잠금)' : '(수정가능)'}
                    </span>
                    {latestQuote.is_locked ? (
                      <button
                        type="button"
                        onClick={() => handleUnlockQuote(latestQuote.id)}
                        disabled={actionLoading}
                        className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10.5px] font-bold inline-flex items-center space-x-1 cursor-pointer shadow-2xs transition-colors"
                        title="견적서 잠금을 해제하여 단가 직접 수정 및 변경을 활성화합니다."
                      >
                        <Unlock className="w-2.5 h-2.5 shrink-0" />
                        <span>수정 잠금해제</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">공급가액 (Subtotal)</span>
                  <span className="text-sm font-bold text-slate-900">₩{liveActiveSubtotal.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">총 견적금액 (VAT포함)</span>
                  <span className="text-base font-extrabold text-blue-600">₩{liveActiveTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Quote Filter Tabs & Fast Actions Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setQuoteFilterTab('ALL')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      quoteFilterTab === 'ALL'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    전체 ({quoteItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuoteFilterTab('INCLUDED')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      quoteFilterTab === 'INCLUDED'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    <span>견적 포함</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      quoteFilterTab === 'INCLUDED' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {quoteItems.filter((q: any) => q.is_included !== 0).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuoteFilterTab('EXCLUDED')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      quoteFilterTab === 'EXCLUDED'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <span>견적 제외</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      quoteFilterTab === 'EXCLUDED' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {quoteItems.filter((q: any) => q.is_included === 0).length}
                    </span>
                  </button>
                </div>

                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs shrink-0"
                    title="케이스 전체 도면(DWG/DXF), BOM 정규화 데이터, 프로젝트 매니페스트를 단일 ZIP 압축파일로 다운로드합니다."
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>📦 프로젝트 패키지(ZIP) 다운로드</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExcludeDuplicates}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs shrink-0"
                    title="중복 배치된 도면 품목을 자동으로 감지하여 1건만 포함하고 나머지는 견적에서 일괄 제외합니다."
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>중복본 일괄 제외</span>
                  </button>

                  {/* 💎 Step 2 품목 엑셀 내보내기 (.xls, .xlsx, .csv) */}
                  <div className="relative inline-flex items-stretch rounded-xl shadow-xs shrink-0" ref={step2ExportRef}>
                    <button
                      type="button"
                      onClick={() => handleExportQuoteItems(step2ExportFormat)}
                      disabled={step2ExportLoading}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-l-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50 shadow-2xs"
                      title={`현재 표시된 품목 목록을 .${step2ExportFormat.toUpperCase()} 형식으로 다운로드`}
                    >
                      {step2ExportLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>품목 엑셀 내보내기 (.{step2ExportFormat.toUpperCase()})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep2ShowExportMenu(!step2ShowExportMenu)}
                      disabled={step2ExportLoading}
                      className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-emerald-100 rounded-r-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                      title="내보내기 파일 포맷 선택 (.xls, .xlsx, .csv)"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${step2ShowExportMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {step2ShowExportMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs animate-in fade-in slide-in-from-top-1">
                        <div className="px-3 py-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                          <span>포맷 선택</span>
                          <span className="text-emerald-600 font-mono text-[9.5px]">기본: .xls</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStep2ExportFormat('xls');
                            setStep2ShowExportMenu(false);
                            handleExportQuoteItems('xls');
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer ${
                            step2ExportFormat === 'xls' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-base">📊</span>
                            <div>
                              <div className="font-bold flex items-center space-x-1.5">
                                <span>Excel 97-2003 (.xls)</span>
                                <span className="text-[9px] px-1 py-0.2 bg-emerald-100 text-emerald-800 rounded">추천</span>
                              </div>
                              <div className="text-[10px] text-slate-400">구버전 & 최신 엑셀 완벽 호환</div>
                            </div>
                          </div>
                          {step2ExportFormat === 'xls' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep2ExportFormat('xlsx');
                            setStep2ShowExportMenu(false);
                            handleExportQuoteItems('xlsx');
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer ${
                            step2ExportFormat === 'xlsx' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-base">📗</span>
                            <div>
                              <div className="font-bold">Excel 통합문서 (.xlsx)</div>
                              <div className="text-[10px] text-slate-400">최신 Microsoft Office XML</div>
                            </div>
                          </div>
                          {step2ExportFormat === 'xlsx' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep2ExportFormat('csv');
                            setStep2ShowExportMenu(false);
                            handleExportQuoteItems('csv');
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer ${
                            step2ExportFormat === 'csv' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-base">📄</span>
                            <div>
                              <div className="font-bold">CSV 텍스트 (.csv)</div>
                              <div className="text-[10px] text-slate-400">쉼표 구분 텍스트 (UTF-8 BOM)</div>
                            </div>
                          </div>
                          {step2ExportFormat === 'csv' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quote Items Table */}
              <div className="overflow-x-auto min-h-[260px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-bold border-b-2 border-slate-200">
                      <th className="py-1.5 pl-3 pr-2 border-l-[3.5px] border-l-transparent">No</th>
                      <th className="py-1.5 px-2 text-center w-24 relative select-none">
                        <div ref={quoteDropdownRef} className="inline-block relative">
                          <button
                            type="button"
                            onClick={() => setQuoteDropdownOpen(!quoteDropdownOpen)}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded border text-[11px] font-bold transition-all cursor-pointer ${
                              quoteDropdownOpen
                                ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs'
                            }`}
                            title="견적 체크박스 전체선택 / 전체해제 풀다운 메뉴"
                          >
                            <span>견적</span>
                            <ChevronDown
                              className={`w-3 h-3 transition-transform duration-150 ${
                                quoteDropdownOpen ? 'rotate-180 text-white' : 'text-slate-500'
                              }`}
                            />
                          </button>

                          {/* Pull-down Menu Popover */}
                          {quoteDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-left text-xs animate-in fade-in zoom-in-95">
                              <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                                <span>견적 포함 항목 제어</span>
                                <span className="font-bold font-mono text-blue-600">
                                  {quoteItems.filter((q: any) => q.is_included !== 0).length} / {quoteItems.length}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleToggleAllQuoteDrawings(true)}
                                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2 cursor-pointer font-semibold transition-colors"
                              >
                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                                <div className="leading-tight">
                                  <div className="font-bold text-slate-800">전체 선택 (All)</div>
                                  <div className="text-[10px] text-slate-400 font-normal">모든 품목 견적서 포함</div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleAllQuoteDrawings(false)}
                                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center space-x-2 cursor-pointer font-semibold transition-colors"
                              >
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="leading-tight">
                                  <div className="font-bold text-slate-800">전체 해제 (Clear)</div>
                                  <div className="text-[10px] text-slate-400 font-normal">모든 품목 견적서 제외</div>
                                </div>
                              </button>

                              <div className="border-t border-slate-100 my-1"></div>

                              <button
                                type="button"
                                onClick={handleSelectPricedOnly}
                                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-amber-50 hover:text-amber-800 flex items-center space-x-2 cursor-pointer font-semibold transition-colors"
                              >
                                <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="leading-tight">
                                  <div className="font-bold text-slate-800">단가 있는 품목만 선택</div>
                                  <div className="text-[10px] text-slate-400 font-normal">미단가(0원) 품목 제외</div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setQuoteDropdownOpen(false);
                                  handleExcludeDuplicates();
                                }}
                                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-purple-50 hover:text-purple-800 flex items-center space-x-2 cursor-pointer font-semibold transition-colors border-t border-slate-100"
                              >
                                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                                <div className="leading-tight">
                                  <div className="font-bold text-slate-800">중복 도면 일괄 제외</div>
                                  <div className="text-[10px] text-slate-400 font-normal">중복 배치본 자동 제외</div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                      <th className="py-1.5 px-3">마스터 코드</th>
                      <th className="py-1.5 px-2 text-center w-24">도면 위치</th>
                      <th className="py-1.5 px-3">품명 (Standard Name)</th>
                      <th className="py-1.5 px-3">규격 / 재질</th>
                      <th className="py-1.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end space-x-1.5 whitespace-nowrap">
                          <span>수량</span>
                          <span
                            className="text-[10.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200"
                            title={
                              totalQtyStats.totalIncluded !== totalQtyStats.totalAll
                                ? `견적 포함 수량: ${totalQtyStats.totalIncluded.toLocaleString()} EA / 전체 수량: ${totalQtyStats.totalAll.toLocaleString()} EA`
                                : `총 수량 합계: ${totalQtyStats.totalIncluded.toLocaleString()} EA`
                            }
                          >
                            (합계: {totalQtyStats.totalIncluded.toLocaleString()}
                            {totalQtyStats.totalIncluded !== totalQtyStats.totalAll && (
                              <span className="text-slate-400 font-normal text-[9.5px]">/{totalQtyStats.totalAll.toLocaleString()}</span>
                            )}{' '}
                            EA)
                          </span>
                        </div>
                      </th>
                      <th className="py-1.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end space-x-1.5 whitespace-nowrap">
                          <span>단가 (원)</span>
                          <span
                            className="text-[10.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 inline-flex items-center space-x-0.5"
                            title="단가 셀을 클릭하여 직접 수정하거나 Manual Price로 변경할 수 있습니다"
                          >
                            <Pencil className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                            <span>(수정 가능)</span>
                          </span>
                        </div>
                      </th>
                      <th className="py-1.5 px-3 text-right">금액 (원)</th>
                      <th className="py-1.5 px-3 text-center">단가 출처</th>
                      <th className="py-1.5 px-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {quoteItems
                      .filter((qi: any) => {
                        if (quoteFilterTab === 'INCLUDED') return qi.is_included !== 0;
                        if (quoteFilterTab === 'EXCLUDED') return qi.is_included === 0;
                        return true;
                      })
                      .map((qi: any, idx: number) => {
                      const isStripe = idx % 2 === 1;
                      const isExcluded = qi.is_included === 0;
                      return (
                        <tr
                          key={qi.id}
                          className={`dwell-row-hover ${
                            isExcluded
                              ? 'dwell-row-excluded opacity-40 bg-slate-100/60 text-slate-400'
                              : isStripe
                              ? 'bg-slate-100/80'
                              : 'bg-white'
                          }`}
                        >
                          <td className="dwell-indicator py-1.5 pl-3 pr-2 font-mono font-bold text-slate-500 border-l-[3.5px] border-l-transparent">
                            {qi.item_no}
                          </td>
                          <td className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                handleToggleQuoteDrawing([qi.drawing_no || qi.item_name], checked);
                              }}
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              title={!isExcluded ? '견적 포함 (클릭 시 견적 제외)' : '견적 제외됨 (클릭 시 견적 포함)'}
                            />
                          </td>
                          <td className={`py-1.5 px-3 font-semibold ${isExcluded ? 'text-slate-400' : 'text-slate-900'}`}>
                            <span>{qi.master_code}</span>
                            {isExcluded && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-200 text-slate-600 border border-slate-300">
                                제외됨
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-2 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToCadDrawing(qi);
                              }}
                              className="btn-hover-effect px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10.5px] font-bold inline-flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                              title="1. 도면등록 & 뷰어 탭으로 이동하여 해당 도면/BOM 위치를 줌인합니다."
                            >
                              <Search className="w-3 h-3" />
                              <span>도면 보기</span>
                            </button>
                          </td>
                          <td className={`py-1.5 px-3 font-medium ${isExcluded ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {qi.item_name}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600">
                            {qi.specification} / {qi.material}
                          </td>
                          <td className="py-1.5 px-3 font-bold text-slate-900 text-right">
                            {qi.quantity} {qi.unit}
                          </td>
                          <td
                            className={`py-1 px-3 font-mono text-right text-slate-800 transition-colors ${
                              inlineEditId !== qi.id
                                ? 'cursor-pointer hover:bg-blue-100/70'
                                : ''
                            }`}
                            onClick={() => {
                              if (latestQuote.is_locked) {
                                handleUnlockQuote(latestQuote.id);
                              }
                              if (inlineEditId !== qi.id) {
                                setInlineEditId(qi.id);
                                setInlineEditValue(qi.unit_price > 0 ? Number(qi.unit_price).toLocaleString() : '');
                              }
                            }}
                            title="클릭하여 단가 바로 입력 (Enter/외부 클릭/체크버튼 시 자동 저장)"
                          >
                            {inlineEditId === qi.id ? (
                              <div
                                className="inline-flex items-center justify-end w-full relative space-x-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-blue-600 font-bold text-xs select-none">₩</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoFocus
                                  onFocus={(e) => e.target.select()}
                                  value={inlineEditValue}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                    setInlineEditValue(raw ? Number(raw).toLocaleString() : '');
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      isCancelledRef.current = false;
                                      handleSaveInlinePrice(qi.id, inlineEditValue, true);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      isCancelledRef.current = true;
                                      setInlineEditId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (isCancelledRef.current) {
                                      isCancelledRef.current = false;
                                      return;
                                    }
                                    if (!isSavingInlineRef.current) {
                                      handleSaveInlinePrice(qi.id, inlineEditValue, false);
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-24 sm:w-28 px-2 py-0.5 bg-white border-2 border-blue-500 rounded text-xs font-mono font-bold text-right text-slate-900 focus:outline-hidden ring-2 ring-blue-100 shadow-xs"
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    isCancelledRef.current = false;
                                    handleSaveInlinePrice(qi.id, inlineEditValue, false);
                                  }}
                                  className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer shadow-2xs transition-colors"
                                  title="저장 (Enter)"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    isCancelledRef.current = true;
                                    setInlineEditId(null);
                                  }}
                                  className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer shadow-2xs transition-colors"
                                  title="취소 (Esc)"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : qi.unit_price > 0 ? (
                              <div
                                className="group/price inline-flex items-center justify-end space-x-1.5 font-mono font-bold text-slate-800 hover:text-blue-700 cursor-pointer"
                              >
                                <span>₩{qi.unit_price.toLocaleString()}</span>
                                <span className="text-[9.5px] px-1 py-0.2 rounded bg-blue-50 text-blue-600 border border-blue-200 group-hover/price:bg-blue-600 group-hover/price:text-white transition-colors inline-flex items-center space-x-0.5 font-sans font-medium">
                                  <Pencil className="w-2.5 h-2.5 shrink-0" />
                                  <span>수정</span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <div
                                  className="group/price inline-flex items-center justify-end space-x-1.5 font-mono font-semibold text-rose-500 hover:text-rose-700 cursor-pointer px-1.5 py-0.5 rounded-sm hover:bg-rose-50 transition-colors"
                                >
                                  <span>₩0 (미등록)</span>
                                  <span className="text-[9.5px] px-1 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200 group-hover/price:bg-rose-600 group-hover/price:text-white transition-colors inline-flex items-center space-x-0.5 font-sans font-medium animate-pulse">
                                    <Pencil className="w-2.5 h-2.5 shrink-0" />
                                    <span>입력</span>
                                  </span>
                                </div>
                                {(() => {
                                  const normMatch = (normalizedItems || []).find((n: any) => 
                                    n.normalized_name === qi.item_name || n.drawing_name === qi.item_name || n.raw_name === qi.item_name
                                  );
                                  const learnedVal = normMatch?.standard_schema_suggestion?.learned_unit_price;
                                  if (learnedVal && learnedVal > 0) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDirectApplyPrice(Number(learnedVal), '자가학습 추천 단가 즉시 적용', 'MANUAL_PRICE');
                                        }}
                                        className="mt-1 text-[9.5px] bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-300 inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                        title="과거 도면 검수에서 학습된 단가입니다. 클릭 시 즉시 적용됩니다."
                                      >
                                        <Brain className="w-2.5 h-2.5 text-purple-600" />
                                        <span>추천 ₩{learnedVal.toLocaleString()} 적용</span>
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-bold text-right text-slate-900 group-hover/row:text-blue-950 transition-colors">
                            {isExcluded ? (
                              <span className="text-slate-400 font-normal text-[11px]">₩0 (제외)</span>
                            ) : (
                              `₩${qi.amount.toLocaleString()}`
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {qi.price_source === 'PRICE_MASTER' || qi.price_source === 'STANDARD_PRICE' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenManualPriceModal(qi, 'MASTER')}
                                className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 hover:border-emerald-400 transition-colors cursor-pointer inline-flex items-center space-x-1 shadow-2xs"
                                title="단가 마스터 (PRICE_MASTER) 활성 상태 (클릭 시 마스터 단가 변경 또는 수기 단가 전환)"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                <span>단가 마스터 (활성)</span>
                              </button>
                            ) : qi.price_source === 'MANUAL_PRICE' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenManualPriceModal(qi, 'MANUAL')}
                                className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 hover:border-blue-400 transition-colors cursor-pointer inline-flex items-center space-x-1 shadow-2xs"
                                title="수기 단가 (MANUAL_PRICE) 적용 상태 (클릭 시 단가 재입력 또는 마스터 전환)"
                              >
                                <Pencil className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                <span>수기 단가 (Manual)</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenManualPriceModal(qi, 'DIRECT')}
                                className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 hover:border-amber-400 transition-colors cursor-pointer inline-flex items-center space-x-1 shadow-2xs animate-pulse"
                                title="단가 미등록 상태 (클릭하여 단가 직접 입력 또는 마스터 매칭)"
                              >
                                <AlertCircle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>단가 미등록 (클릭)</span>
                              </button>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  if (latestQuote.is_locked) {
                                    handleUnlockQuote(latestQuote.id);
                                  }
                                  setInlineEditId(qi.id);
                                  setInlineEditValue(qi.unit_price > 0 ? Number(qi.unit_price).toLocaleString() : '');
                                }}
                                className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400 rounded text-[10.5px] font-bold transition-all cursor-pointer shadow-2xs inline-flex items-center space-x-1 shrink-0"
                                title="단가 직접 수정 (행에서 즉시 입력)"
                              >
                                <Pencil className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                <span>단가 수정</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenManualPriceModal(qi, 'MASTER')}
                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded text-[10.5px] font-bold transition-all cursor-pointer shadow-2xs inline-flex items-center space-x-1 shrink-0"
                                title="Price Master 조회 및 수기 단가 이력 풀 매칭"
                              >
                                <Database className="w-2.5 h-2.5 shrink-0" />
                                <span>Price Master / 수기</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {quoteItems.length > 0 && (
                    <tfoot className="bg-slate-50/95 border-t-2 border-slate-300 font-bold text-slate-800">
                      <tr>
                        <td colSpan={6} className="py-2 px-3 text-right font-sans text-slate-600">
                          견적 포함 수량 합계:
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-blue-700 font-bold whitespace-nowrap">
                          {totalQtyStats.totalIncluded.toLocaleString()} EA
                          {totalQtyStats.totalIncluded !== totalQtyStats.totalAll && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              전체 {totalQtyStats.totalAll.toLocaleString()} EA
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400 font-sans text-[11px]">-</td>
                        <td className="py-2 px-3 text-right font-mono text-blue-700 font-bold whitespace-nowrap">
                          ₩{liveActiveSubtotal.toLocaleString()}
                        </td>
                        <td colSpan={2} className="py-2 px-3 text-center text-slate-400 text-[10px] font-sans">
                          공급가액 기준
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div className="flex items-center space-x-2.5">
                  {!latestQuote.is_locked ? (
                    <button
                      onClick={() => handleApproveQuote(latestQuote.id)}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-2 cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      <span>최종 견적 승인 및 잠금 (Lock)</span>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1.5 text-emerald-700 text-xs font-bold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>최종 승인 완료 (수정 잠금 상태)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlockQuote(latestQuote.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-colors"
                        title="견적서 잠금을 해제하여 단가 직접 수정 및 검토를 다시 진행합니다."
                      >
                        <Unlock className="w-4 h-4" />
                        <span>수정 잠금 해제 (DRAFT 복귀)</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setActiveTab('structure')}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                    title="상세 도면 구조 및 다단계 BOM 트리 확인"
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>4. 도면구조 & BOM 상세</span>
                  </button>
                </div>

                <button
                  onClick={() => setActiveTab('excel')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <span>다음: 3. 표준견적서 미리보기 & 출력</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600 shadow-xs">
                <Database className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-slate-900 font-bold text-base">견적서 산출 준비</h4>
                <p className="text-slate-500 text-xs mt-1">
                  도면 분석 결과 추출된 {normalizedItems.length}개 BOM 품목에 대해 단가 마스터를 매칭하여 총 견적 금액을 즉시 계산합니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleAutoApproveAndCreateQuote}
                  disabled={actionLoading}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>🚀 AI 1순위 추천 일괄 승인 & 견적서 즉시 산출</span>
                </button>
                <button
                  onClick={() => setActiveTab('approval')}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>2. 마스터 매칭 직접 검토로 이동</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Fabrication Features & Cost Breakdown (EGDesk Cost Engine) */}
      {activeTab === 'features' && (
        <FabricationFeaturesPanel
          quotationCaseId={id}
          onRefreshCase={fetchData}
        />
      )}

      {/* TAB 4: Standard Quotation Preview & PDF / Excel Export */}
      {activeTab === 'excel' && (
        <QuotationDocumentPreview
          quote={latestQuote}
          quoteItems={quoteItems}
          caseData={data}
          onExportExcel={handleExportExcel}
          exportResult={exportResult}
          actionLoading={actionLoading}
          onDownloadZip={handleDownloadZip}
        />
      )}

      {/* TAB 4: Structure Map & Multi-Level BOM (PROMPT 07, 08, 09, 10) */}
      {activeTab === 'structure' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Drawing Structure Tree */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>도면 구조 계층 (총 {drawings.length}개 도면)</span>
                </h3>
                <span className="text-[11px] font-medium text-slate-400">
                  메인 {drawings.filter((d: any) => d.drawing_type === 'MAIN_ASSEMBLY').length}개 · 서브 {drawings.filter((d: any) => d.drawing_type !== 'MAIN_ASSEMBLY').length}개
                </span>
              </div>

              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {/* Main Assembly Group */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center space-x-1.5 px-1">
                    <Folder className="w-3.5 h-3.5 text-blue-600" />
                    <span>메인 조립도 (Main Assembly)</span>
                  </div>
                  {drawings.filter((d: any) => d.drawing_type === 'MAIN_ASSEMBLY').map((d: any) => (
                    <div
                      key={d.id}
                      onClick={() => handleNavigateToCadDrawing(d)}
                      className="p-3 bg-blue-50/60 hover:bg-blue-100/70 rounded-xl border border-blue-200/80 hover:border-blue-500 text-xs space-y-1.5 cursor-pointer group hover:shadow-md hover:scale-[1.01] transition-all shadow-2xs"
                      title="클릭 시 CAD 뷰어로 이동하여 이 도면을 화면에 꽉 차게 봅니다"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span className="font-mono text-blue-700 group-hover:text-blue-950 transition-colors">{d.drawing_no_raw}</span>
                        <div className="flex items-center space-x-1">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-blue-600 group-hover:bg-blue-700 text-white font-semibold flex items-center space-x-1 shadow-2xs transition-colors">
                            <Search className="w-2.5 h-2.5" />
                            <span>도면 보기</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-slate-800 font-bold text-xs group-hover:text-blue-900 transition-colors">{d.drawing_name_raw}</div>
                      <div className="text-[11px] text-slate-500 pt-1 border-t border-blue-100 flex items-center justify-between">
                        <span>프로젝트: {d.project_name || '-'}</span>
                        <span className="flex items-center space-x-0.5 text-blue-600 font-medium">
                          <span>설계: {d.designer || '-'} | {d.scale || '-'}</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sub Part Group */}
                {drawings.filter((d: any) => d.drawing_type !== 'MAIN_ASSEMBLY').length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-bold text-purple-900 uppercase tracking-wider flex items-center space-x-1.5 px-1">
                      <FileText className="w-3.5 h-3.5 text-purple-600" />
                      <span>단위 부품도 / 서브도면 (Sub-Part Drawings)</span>
                    </div>
                    {drawings.filter((d: any) => d.drawing_type !== 'MAIN_ASSEMBLY').map((d: any) => (
                      <div
                        key={d.id}
                        onClick={() => handleNavigateToCadDrawing(d)}
                        className="p-2.5 bg-slate-50 hover:bg-purple-50/70 rounded-xl border border-slate-200 hover:border-purple-400 text-xs space-y-1.5 cursor-pointer group hover:shadow-md hover:scale-[1.01] transition-all shadow-2xs"
                        title="클릭 시 CAD 뷰어로 이동하여 이 도면을 화면에 꽉 차게 봅니다"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-900">
                          <span className="font-mono text-slate-700 group-hover:text-purple-900 transition-colors">{d.drawing_no_raw}</span>
                          <div className="flex items-center space-x-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 group-hover:bg-purple-600 group-hover:text-white text-purple-800 font-medium flex items-center space-x-1 border border-purple-200 group-hover:border-purple-600 transition-all">
                              <Search className="w-2.5 h-2.5" />
                              <span>도면 보기</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-slate-700 font-medium group-hover:text-purple-950 transition-colors">{d.drawing_name_raw}</div>
                        <div className="text-[10.5px] text-slate-400 flex items-center justify-between pt-0.5">
                          <span>재질: {d.material || '-'} · Rev: {d.revision || '-'}</span>
                          <span className="flex items-center space-x-0.5 text-purple-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Flattened BOM & Multi-Level Rollup Table */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>다단계 BOM 롤업 및 Flattened BOM ({flattenedBomItems.length} 품목)</span>
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  수량 전파 공식: Qty(Effective) = Qty(Root) × Qty(Sub) × Qty(Part)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">도면 품번</th>
                      <th className="py-2.5 px-3">품명 (Raw Name)</th>
                      <th className="py-2.5 px-3">규격</th>
                      <th className="py-2.5 px-3">재질</th>
                      <th className="py-2.5 px-3 text-right">총 소요수량</th>
                      <th className="py-2.5 px-3 text-center">단위</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {flattenedBomItems.map((it: any, idx: number) => {
                      const matchedDwg = drawings.find((d: any) =>
                        (it.part_no && it.part_no !== '-' && d.drawing_no_raw && (d.drawing_no_raw === it.part_no || d.drawing_no_raw.includes(it.part_no))) ||
                        (it.name && d.drawing_name_raw && it.name === d.drawing_name_raw)
                      );
                      return (
                        <tr key={it.id} className="hover:bg-slate-50/80 group">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            <div className="flex items-center justify-between space-x-1">
                              <span className="font-mono">{it.part_no || '-'}</span>
                              {matchedDwg && (
                                <button
                                  onClick={() => handleNavigateToCadDrawing(matchedDwg)}
                                  className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white border border-blue-200 group-hover:border-blue-600 font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-2xs shrink-0"
                                  title={`[${matchedDwg.drawing_no_raw}] CAD 도면으로 이동하여 전체 화면 보기`}
                                >
                                  <Search className="w-2.5 h-2.5" />
                                  <span>도면 보기</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{it.name}</td>
                          <td className="py-2.5 px-3 text-slate-600">{it.specification || '-'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{it.material || '-'}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 text-right">{it.total_quantity}</td>
                          <td className="py-2.5 px-3 text-center text-slate-500">{it.unit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('quote')}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>3. 견적서 산출로 이동</span>
                </button>

                <button
                  onClick={() => setActiveTab('approval')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>2. 마스터 매칭 및 검수자 승인으로 이동</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Master Matching & Reviewer Approval (PROMPT 11, 12, 13) */}
      {activeTab === 'approval' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold font-mono">
                  STEP 2
                </span>
                <h3 className="font-bold text-slate-900 text-base">마스터 매칭 & 검수자 승인 워크벤치</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                도면에서 추출된 BOM 부품을 검토하여 사내 마스터 매칭 또는 신규 가공품으로 확정 승인 후 3단계 견적서로 전달합니다.
              </p>
              <div className="flex items-center space-x-2 mt-2 flex-wrap gap-y-1">
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  전체 도면 {normalizedItems.length}개
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>견적 대상 {quoteIncCount}개</span>
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center space-x-1">
                  <span>📦 AI 중복/상위 자동제외 {quoteExcCount}개</span>
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <button
                onClick={handleBulkApproveHighConfidence}
                disabled={actionLoading}
                className="btn-hover-effect px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="자재 유사도 90% 이상인 고신뢰도 품목들을 표준 규격으로 일괄 승인합니다."
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>⚡ 고신뢰도(90%↑) 일괄 표준화 승인 ({highConfidenceCount}건)</span>
              </button>
              <button
                onClick={() => handleBulkApprove(true)}
                disabled={actionLoading}
                className="btn-hover-effect px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="1단계 표제란에서 견적 대상으로 선택된 품목들을 일괄 승인합니다."
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>견적 대상 품목 일괄 승인 ({quoteIncCount}개)</span>
              </button>
              {approvedItemsCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkUnapprove()}
                  disabled={actionLoading}
                  className="btn-hover-effect-secondary px-3.5 py-2.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 rounded-xl text-xs font-bold border border-rose-300 shadow-2xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="현재 승인 완료된 모든 품목을 검토 대기 상태로 일괄 초기화합니다."
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                  <span>승인 일괄 해제 ({approvedItemsCount}건) ↺</span>
                </button>
              )}
              <button
                type="button"
                onClick={openLearnedPoolModal}
                className="btn-hover-effect-secondary px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-800 rounded-xl text-xs font-bold border border-purple-200 shadow-2xs flex items-center space-x-1.5 transition-all cursor-pointer"
                title="도면 검수 및 견적을 통해 자동으로 학습/축적된 자재/단가 지식풀을 조회합니다."
              >
                <Brain className="w-4 h-4 text-purple-600" />
                <span>🧠 자가학습 지식풀</span>
              </button>
              <button
                type="button"
                onClick={handleArchiveSnapshot}
                disabled={archivingSnapshot}
                className="btn-hover-effect-secondary px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 shadow-2xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="현재 정규화된 BOM 분석 데이터 전체를 버전별 영구 스냅샷으로 안전하게 보관합니다."
              >
                <Archive className={`w-4 h-4 text-slate-600 ${archivingSnapshot ? 'animate-bounce' : ''}`} />
                <span>{archivingSnapshot ? '보관 처리 중...' : '💾 BOM 데이터 보관'}</span>
              </button>
              <button
                onClick={handleCreateQuote}
                disabled={actionLoading}
                className="btn-hover-effect px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>승인 반영 ➔ 3. 견적서 산출로 이동</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Normalized Items List (1-Row Excel Sheet Mode / Card Mode) */}
            <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 flex flex-col">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      <span>정규화 도면 BOM 목록</span>
                    </h4>
                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      {filteredNormalizedItems.length} / {normalizedItems.length}건
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    1행 고밀도 시트 뷰 • 가로 스크롤로 표제란 스펙 확인
                  </p>
                </div>

                {/* View Mode Switcher (Sheet vs Card) */}
                <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setApprovalViewMode('TABLE')}
                    className={`px-2.5 py-1 rounded text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                      approvalViewMode === 'TABLE'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="1행 고밀도 엑셀 시트 모드"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>시트형</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovalViewMode('CARD')}
                    className={`px-2.5 py-1 rounded text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                      approvalViewMode === 'CARD'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="상세 카드 모드"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>카드형</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs and Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                {/* Segmented Status Tabs */}
                <div className="flex items-center space-x-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setApprovalFilterTab('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      approvalFilterTab === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    전체 <span className="text-[10px] opacity-75">({normalizedItems.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovalFilterTab('PENDING')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      approvalFilterTab === 'PENDING'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-amber-700 hover:bg-amber-100/60'
                    }`}
                  >
                    <span>검토필요</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      approvalFilterTab === 'PENDING' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {pendingItemsCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovalFilterTab('APPROVED')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      approvalFilterTab === 'APPROVED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-100/60'
                    }`}
                  >
                    <span>승인완료</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      approvalFilterTab === 'APPROVED' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {approvedItemsCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovalFilterTab('QUOTE_INCLUDED')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      approvalFilterTab === 'QUOTE_INCLUDED'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 hover:bg-blue-100/60'
                    }`}
                  >
                    <span>견적대상</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      approvalFilterTab === 'QUOTE_INCLUDED' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {quoteIncCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovalFilterTab('QUOTE_EXCLUDED')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      approvalFilterTab === 'QUOTE_EXCLUDED'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 hover:bg-rose-100/60'
                    }`}
                  >
                    <span>견적제외</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      approvalFilterTab === 'QUOTE_EXCLUDED' ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {quoteExcCount}
                    </span>
                  </button>
                </div>

                {/* Similarity Grade Filter Tabs */}
                <div className="flex items-center space-x-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0">
                  <span className="text-[10.5px] font-bold text-slate-500 px-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>유사도:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSimilarityFilter('ALL')}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      similarityFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimilarityFilter('HIGH')}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      similarityFilter === 'HIGH'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-100/60'
                    }`}
                    title="자재 유사도 90% 이상 (고신뢰도 매칭)"
                  >
                    <span>🟢 90%↑</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      similarityFilter === 'HIGH' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {highConfidenceCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimilarityFilter('MEDIUM')}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      similarityFilter === 'MEDIUM'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-amber-700 hover:bg-amber-100/60'
                    }`}
                    title="자재 유사도 70~89% (검토 권장)"
                  >
                    <span>🟡 70~89%</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      similarityFilter === 'MEDIUM' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {mediumConfidenceCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimilarityFilter('LOW')}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                      similarityFilter === 'LOW'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 hover:bg-rose-100/60'
                    }`}
                    title="자재 유사도 70% 미만 (신규/미등록)"
                  >
                    <span>🔴 &lt;70%</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      similarityFilter === 'LOW' ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {lowConfidenceCount}
                    </span>
                  </button>
                </div>

                {/* Search Box */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="도면번호, 품명, 재질 검색..."
                    value={approvalSearchText}
                    onChange={(e) => setApprovalSearchText(e.target.value)}
                    className="w-full pl-8 pr-7 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-all"
                  />
                  {approvalSearchText && (
                    <button
                      onClick={() => setApprovalSearchText('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-Selection Batch Action Toolbar */}
              {selectedApprovalIds.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900 shadow-xs animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                    <span className="font-extrabold">선택 품목: {selectedApprovalIds.length}개</span>
                    <span className="text-slate-500 text-[11px]">
                      (승인완료: {selectedApprovalIds.filter(id => finalBomItems.some((f: any) => f.normalized_item_id === id)).length}건 / 미승인: {selectedApprovalIds.filter(id => !finalBomItems.some((f: any) => f.normalized_item_id === id)).length}건)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleBulkApproveSelected(selectedApprovalIds)}
                      disabled={actionLoading}
                      className="btn-hover-effect px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>선택 {selectedApprovalIds.length}개 일괄 승인</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkUnapprove(selectedApprovalIds)}
                      disabled={actionLoading}
                      className="btn-hover-effect-secondary px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-300 rounded-lg font-bold text-xs shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                      <span>선택 승인 해제 ↺</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedApprovalIds([])}
                      className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      선택 해제
                    </button>
                  </div>
                </div>
              )}

              {/* View Mode 1: High-Density 1-Row Excel Sheet View */}
              {approvalViewMode === 'TABLE' ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white flex flex-col">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1280px] text-xs">
                      <thead className="sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-[11px] font-bold border-b border-slate-200">
                        {/* 1단 대분류 헤더 (Tier 1: Side-by-Side Domain Split) */}
                        <tr className="border-b border-slate-200 text-slate-800">
                          <th colSpan={6} className="px-3 py-1.5 bg-slate-100/90 text-left border-r-2 border-slate-300">
                            <div className="flex items-center space-x-1.5 text-slate-800 font-extrabold text-[11px]">
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span>[좌측] 📋 도면 원본 데이터 (Raw Extracted from DWG)</span>
                            </div>
                          </th>
                          <th colSpan={6} className="px-3 py-1.5 bg-blue-50/95 text-left border-r border-blue-200">
                            <div className="flex items-center justify-between text-blue-900 font-extrabold text-[11px]">
                              <span className="flex items-center space-x-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>[우측] ✨ 자재리스트 표준 데이터 규격 & 유사도 분석 (Standard Schema)</span>
                              </span>
                              <span className="text-[10px] font-medium text-blue-700 bg-white/80 px-2 py-0.2 rounded-full border border-blue-200">
                                9대 표준 매핑
                              </span>
                            </div>
                          </th>
                          <th className="px-2 py-1.5 bg-slate-100 text-center sticky right-0 z-30 border-l border-slate-200 text-[10.5px]">
                            위치
                          </th>
                        </tr>

                        {/* 2단 상세 컬럼 헤더 (Tier 2: Detail Columns) */}
                        <tr className="bg-slate-50 text-slate-600 text-[10.5px]">
                          {/* 좌측: 도면 원본 컬럼 6개 */}
                          <th className="w-8 min-w-[34px] max-w-[34px] px-1.5 py-2 text-center sticky left-0 z-30 bg-slate-100 border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={filteredNormalizedItems.length > 0 && filteredNormalizedItems.every((n: any) => selectedApprovalIds.includes(n.id))}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                if (checked) {
                                  const allIds = Array.from(new Set([...selectedApprovalIds, ...filteredNormalizedItems.map((n: any) => n.id)]));
                                  setSelectedApprovalIds(allIds);
                                } else {
                                  const filteredSet = new Set(filteredNormalizedItems.map((n: any) => n.id));
                                  setSelectedApprovalIds(selectedApprovalIds.filter((id) => !filteredSet.has(id)));
                                }
                                const targetDwgNos = filteredNormalizedItems
                                  .map((n: any) => n.drawing_no || n.raw_name)
                                  .filter(Boolean);
                                if (targetDwgNos.length > 0) {
                                  handleToggleQuoteDrawing(targetDwgNos, checked);
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              title="전체 선택 / 전체 해제"
                            />
                          </th>
                          <th className="w-9 min-w-[38px] max-w-[38px] px-1.5 py-2 text-center sticky left-[34px] z-30 bg-slate-100 border-r border-slate-200">
                            No.
                          </th>
                          <th className="min-w-[125px] max-w-[145px] px-2.5 py-2 sticky left-[72px] z-30 bg-slate-100 border-r border-slate-200">
                            도면번호 (DWG)
                          </th>
                          <th className="min-w-[140px] px-2.5 py-2">
                            도면 원문 품명
                          </th>
                          <th className="w-20 min-w-[75px] px-2 py-2">
                            도면 재질
                          </th>
                          <th className="w-16 min-w-[65px] px-2 py-2 text-right border-r-2 border-slate-300">
                            도면 수량
                          </th>

                          {/* 우측: 표준 마스터 규격 & 유사도 컬럼 6개 */}
                          <th className="w-20 min-w-[75px] px-2 py-2 text-center bg-blue-50/40">
                            자재구분
                          </th>
                          <th className="min-w-[120px] px-2.5 py-2 bg-blue-50/40">
                            표준 재질 (비중)
                          </th>
                          <th className="min-w-[145px] px-2.5 py-2 bg-blue-50/40">
                            가공치수 / 예상중량
                          </th>
                          <th className="min-w-[90px] px-2 py-2 bg-blue-50/40">
                            표준 후처리
                          </th>
                          <th className="w-24 min-w-[90px] px-2 py-2 text-center bg-blue-50/40">
                            유사도
                          </th>
                          <th className="w-28 min-w-[105px] px-2 py-2 text-center bg-blue-50/40 border-r border-blue-200">
                            표준화 승인
                          </th>

                          {/* CAD 줌인 고정 컬럼 */}
                          <th className="w-20 min-w-[75px] px-1.5 py-2 text-center sticky right-0 z-30 bg-slate-100 border-l border-slate-200">
                            도면 위치
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredNormalizedItems.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="py-14 text-center text-slate-400">
                              <p className="font-semibold text-xs">일치하는 품목이 없습니다.</p>
                              {approvalSearchText && (
                                <button
                                  type="button"
                                  onClick={() => setApprovalSearchText('')}
                                  className="mt-2 text-[11px] text-blue-600 hover:underline font-bold cursor-pointer"
                                >
                                  검색어 초기화
                                </button>
                              )}
                            </td>
                          </tr>
                        ) : (
                          filteredNormalizedItems.map((ni: any, index: number) => {
                            const finalItem = finalBomItems.find((f: any) => f.normalized_item_id === ni.id);
                            const isSelected = selectedNormItem?.id === ni.id;
                            const sug = ni.standard_schema_suggestion || {};

                            return (
                              <tr
                                key={ni.id}
                                onClick={() => setSelectedNormItem(ni)}
                                className={`group h-10 transition-colors cursor-pointer text-xs ${
                                  isSelected
                                    ? 'bg-blue-100/75 text-blue-950 font-medium ring-1 ring-inset ring-blue-300'
                                    : 'bg-white hover:bg-slate-50/80 text-slate-700'
                                }`}
                              >
                                {/* [좌측 1] Checkbox Column (Frozen 1) */}
                                <td
                                  className={`px-1.5 py-1 text-center sticky left-0 z-10 border-r border-slate-200/80 ${
                                    isSelected ? 'bg-blue-100' : 'bg-white group-hover:bg-slate-50'
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedApprovalIds.includes(ni.id)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      if (checked) {
                                        setSelectedApprovalIds((prev) => Array.from(new Set([...prev, ni.id])));
                                      } else {
                                        setSelectedApprovalIds((prev) => prev.filter((id) => id !== ni.id));
                                      }
                                      handleToggleQuoteDrawing([ni.drawing_no || ni.raw_name], checked);
                                    }}
                                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    title={selectedApprovalIds.includes(ni.id) ? '견적 포함 (클릭 시 견적 제외)' : '견적 제외 (클릭 시 견적 포함)'}
                                  />
                                </td>

                                {/* [좌측 2] No. (Frozen 2) */}
                                <td
                                  className={`px-1.5 py-1 text-center font-mono text-[11px] sticky left-[34px] z-10 border-r border-slate-200/80 ${
                                    isSelected ? 'bg-blue-100 text-blue-900 font-bold' : 'bg-white group-hover:bg-slate-50 text-slate-500'
                                  }`}
                                >
                                  {index + 1}
                                </td>

                                {/* [좌측 3] DWG NO. (Frozen 3) */}
                                <td
                                  className={`px-2.5 py-1 font-mono font-bold text-[11px] sticky left-[72px] z-10 border-r border-slate-200/80 truncate max-w-[145px] ${
                                    isSelected ? 'bg-blue-100 text-blue-900' : 'bg-white group-hover:bg-slate-50 text-blue-700'
                                  }`}
                                  title={ni.drawing_no || '도면번호 미지정'}
                                >
                                  {ni.drawing_no || '도면번호 미지정'}
                                </td>

                                {/* [좌측 4] 도면 원문 품명 */}
                                <td className="px-2.5 py-1 truncate max-w-[160px]" title={ni.drawing_name || ni.normalized_name}>
                                  <span className={`font-semibold ${isSelected ? 'text-blue-950' : 'text-slate-900'}`}>
                                    {ni.drawing_name || ni.normalized_name}
                                  </span>
                                  {ni.is_quote_included === 0 ? (
                                    ni.exclude_reason?.includes('조립') || ni.drawing_type?.includes('ASSY') ? (
                                      <span className="ml-1 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-block shrink-0" title="조립도 상위 도면명칭으로 부품표 자식 부품이 견적에 포함되어 자동 제외됨">
                                        📦 조립도상위
                                      </span>
                                    ) : ni.exclude_reason?.includes('중복') || ni.exclude_reason?.includes('BOM') ? (
                                      <span className="ml-1 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 inline-block shrink-0" title="조립도 BOM에 포함되어 단품도 수량 중복 방지를 위해 결합됨">
                                        🔗 BOM기포함
                                      </span>
                                    ) : (
                                      <span className="ml-1 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-block shrink-0" title={ni.exclude_reason || '견적 제외'}>
                                        제외
                                      </span>
                                    )
                                  ) : (
                                    <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block shrink-0">
                                      견적대상
                                    </span>
                                  )}
                                </td>

                                {/* [좌측 5] 도면 재질 */}
                                <td className="px-2 py-1 truncate max-w-[85px] text-slate-600 text-[11px]" title={ni.drawing_material || ni.material_candidate}>
                                  {ni.drawing_material || ni.material_candidate || 'SS400'}
                                </td>

                                {/* [좌측 6] 도면 수량 (도면 영역 경계선 border-r-2) */}
                                <td className="px-2 py-1 text-right font-extrabold whitespace-nowrap border-r-2 border-slate-300">
                                  <span className={isSelected ? 'text-blue-900' : 'text-slate-900'}>
                                    {ni.quantity}
                                  </span>{' '}
                                  <span className="text-[10px] text-slate-400 font-normal">{ni.unit || 'EA'}</span>
                                </td>

                                {/* [우측 7] 자재구분 (가공품 vs 구매품) */}
                                <td className="px-2 py-1 text-center whitespace-nowrap bg-blue-50/20">
                                  {sug.item_type === 'COMMERCIAL' ? (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                      구매품
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                      가공품
                                    </span>
                                  )}
                                </td>

                                {/* [우측 8] 표준 재질 (비중) */}
                                <td className="px-2.5 py-1 truncate max-w-[130px] bg-blue-50/20 text-[11px]" title={`${sug.standard_material || ni.drawing_material || 'SS400'} (비중: ${sug.density || 7.85})`}>
                                  <span className="font-bold text-slate-900">{sug.standard_material || ni.drawing_material || 'SS400'}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({sug.density || 7.85})</span>
                                </td>

                                {/* [우측 9] 가공치수 / 예상중량 */}
                                <td className="px-2.5 py-1 truncate max-w-[155px] bg-blue-50/20 text-[11px]" title={sug.dimension_str || ni.drawing_scale}>
                                  <span className="font-mono text-slate-700">{sug.dimension_str || '-'}</span>
                                  {sug.calculated_weight_kg > 0 && (
                                    <span className="ml-1 font-bold text-blue-700 text-[10px]">
                                      ({sug.calculated_weight_kg}kg)
                                    </span>
                                  )}
                                </td>

                                {/* [우측 10] 표준 후처리 */}
                                <td className="px-2 py-1 truncate max-w-[90px] bg-blue-50/20 text-[10.5px] text-slate-600">
                                  {sug.treatment_label || '일반'}
                                </td>

                                {/* [우측 11] 유사도 신호등 뱃지 */}
                                <td className="px-2 py-1 text-center whitespace-nowrap bg-blue-50/20">
                                  {(sug.similarity_score || 0) >= 90 ? (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200" title="고신뢰도 매칭 (90% 이상)">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      <span>{sug.similarity_score || 95}%</span>
                                    </span>
                                  ) : (sug.similarity_score || 0) >= 70 ? (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-amber-100 text-amber-800 border border-amber-200" title="확인 권장 (70~89%)">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                      <span>{sug.similarity_score}%</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-rose-100 text-rose-800 border border-rose-200" title="신규/미등록 (<70%)">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                      <span>{sug.similarity_score || 50}%</span>
                                    </span>
                                  )}
                                  {sug.learned_unit_price > 0 && (
                                    <span 
                                      className="block mt-1 text-[9.5px] font-mono text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 truncate"
                                      title={`자가학습 검증 단가: ₩${sug.learned_unit_price.toLocaleString()} (${sug.learned_approval_count || 1}회 승인, ${sug.learned_company_name || '사내'})`}
                                    >
                                      ₩{sug.learned_unit_price.toLocaleString()}
                                    </span>
                                  )}
                                </td>

                                {/* [우측 12] 표준화 승인 / 상태 */}
                                <td className="px-2 py-1 text-center whitespace-nowrap bg-blue-50/20 border-r border-blue-200">
                                  {finalItem ? (
                                    <div className="inline-flex items-center justify-center space-x-1">
                                      <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>승인완료</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUnapproveItem(ni.id, ni.drawing_name || ni.normalized_name);
                                        }}
                                        disabled={actionLoading}
                                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                                        title="승인 취소 (검토 대기 상태로 복귀)"
                                      >
                                        <RotateCcw className="w-3 h-3 text-rose-500" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveItem(
                                          ni.id,
                                          'STANDARD_SCHEMA',
                                          {
                                            standard_name: sug.standard_name || ni.drawing_name || ni.normalized_name,
                                            specification: sug.dimension_str || ni.drawing_scale || '-',
                                            material: sug.standard_material || ni.drawing_material || 'SS400',
                                            master_code: sug.matched_master_code || ni.drawing_no || 'CUSTOM'
                                          },
                                          '표준 데이터 규격 및 유사도 검증 승인'
                                        );
                                      }}
                                      disabled={actionLoading}
                                      className="btn-hover-effect px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10.5px] font-bold inline-flex items-center space-x-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                      title="우측 표준 규격으로 즉시 확정 승인합니다."
                                    >
                                      <Sparkles className="w-3 h-3 text-amber-300" />
                                      <span>표준화 적용</span>
                                    </button>
                                  )}
                                </td>

                                {/* CAD 줌인 (우측 고정) */}
                                <td
                                  className={`px-1.5 py-1 text-center sticky right-0 z-10 border-l border-slate-200/80 whitespace-nowrap ${
                                    isSelected ? 'bg-blue-100' : 'bg-white group-hover:bg-slate-50'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedNormItem(ni);
                                      handleNavigateToCadDrawing(ni);
                                    }}
                                    className="btn-hover-effect px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded text-[10.5px] font-bold inline-flex items-center space-x-1 transition-all cursor-pointer shadow-2xs"
                                    title="1. 도면등록 & 뷰어 탭으로 이동하여 해당 도면/BOM 위치를 줌인합니다."
                                  >
                                    <ExternalLink className="w-3 h-3 text-blue-600" />
                                    <span>줌인 ↗</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-1 text-[10.5px] text-slate-500">
                    <span>💡 행 클릭 시 우측 상세 검토 패널이 열리며, 가로 스크롤로 표제란 전체 스펙을 확인할 수 있습니다.</span>
                    <span className="font-mono font-medium">총 {filteredNormalizedItems.length}개 표시 중</span>
                  </div>
                </div>
              ) : (
                /* View Mode 2: Card View Fallback */
                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {filteredNormalizedItems.length === 0 ? (
                    <div className="py-14 text-center text-slate-400">
                      <p className="font-semibold text-xs">일치하는 품목이 없습니다.</p>
                      {approvalSearchText && (
                        <button
                          type="button"
                          onClick={() => setApprovalSearchText('')}
                          className="mt-2 text-[11px] text-blue-600 hover:underline font-bold cursor-pointer"
                        >
                          검색어 초기화
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredNormalizedItems.map((ni: any) => {
                      const finalItem = finalBomItems.find((f: any) => f.normalized_item_id === ni.id);
                      const isSelected = selectedNormItem?.id === ni.id;

                      return (
                        <div
                          key={ni.id}
                          onClick={() => setSelectedNormItem(ni)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-2 relative group ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-400/30'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50/60 bg-white'
                          }`}
                        >
                          {/* Top Header: Checkbox + Drawing No Badge + Item Name + Status Badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1 flex items-start space-x-2">
                              <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedApprovalIds.includes(ni.id)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    if (checked) {
                                      setSelectedApprovalIds((prev) => Array.from(new Set([...prev, ni.id])));
                                    } else {
                                      setSelectedApprovalIds((prev) => prev.filter((id) => id !== ni.id));
                                    }
                                    handleToggleQuoteDrawing([ni.drawing_no || ni.raw_name], checked);
                                  }}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                  title={selectedApprovalIds.includes(ni.id) ? '견적 포함 (클릭 시 견적 제외)' : '견적 제외 (클릭 시 견적 포함)'}
                                />
                              </div>
                              <div>
                                <div className="flex items-center space-x-1.5 flex-wrap">
                                  <span className="font-mono font-extrabold text-[11px] text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                                    {ni.drawing_no || '도면번호 미지정'}
                                  </span>
                                  <h4 className="font-extrabold text-slate-900 text-xs truncate">
                                    {ni.drawing_name || ni.normalized_name}
                                  </h4>
                                  {ni.is_quote_included === 0 ? (
                                    ni.exclude_reason?.includes('조립') || ni.drawing_type?.includes('ASSY') ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0" title="조립도 상위 도면명칭으로 부품표 자식 부품이 견적에 포함되어 자동 제외됨">
                                        📦 조립도상위
                                      </span>
                                    ) : ni.exclude_reason?.includes('중복') || ni.exclude_reason?.includes('BOM') ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 shrink-0" title="조립도 BOM에 포함되어 단품도 수량 중복 방지를 위해 결합됨">
                                        🔗 BOM기포함
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                        견적 제외{ni.exclude_reason ? ` (${ni.exclude_reason})` : ''}
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                      견적대상
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {finalItem ? (
                              <div className="flex items-center space-x-1 shrink-0">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                  <span>승인완료</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnapproveItem(ni.id, ni.drawing_name || ni.normalized_name);
                                  }}
                                  disabled={actionLoading}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                                  title="승인 취소 (검토 대기 상태로 복귀)"
                                >
                                  <RotateCcw className="w-3 h-3 text-rose-500" />
                                </button>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                검토필요
                              </span>
                            )}
                          </div>

                          {/* Project Name from Drawing Title Block */}
                          <div className="flex items-center space-x-1 text-[11px] text-slate-600 truncate bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <Folder className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-slate-400 font-medium shrink-0">프로젝트:</span>
                            <span className="font-semibold text-slate-700 truncate">
                              {ni.project_name || data?.case?.project_name || '기본 프로젝트'}
                            </span>
                          </div>

                          {/* Title Block Specs Grid (Rev, Material, Scale, Qty) */}
                          <div className="grid grid-cols-4 gap-1 text-[10.5px] bg-slate-50/60 p-1.5 rounded border border-slate-100 text-slate-600">
                            <div className="truncate">
                              <span className="text-slate-400">Rev:</span> <strong className="text-slate-700 font-semibold">{ni.drawing_revision || 'R00'}</strong>
                            </div>
                            <div className="truncate">
                              <span className="text-slate-400">재질:</span> <strong className="text-slate-700 font-semibold">{ni.drawing_material || ni.material_candidate || 'SS400'}</strong>
                            </div>
                            <div className="truncate">
                              <span className="text-slate-400">척도:</span> <strong className="text-slate-700 font-semibold">{ni.drawing_scale || '-'}</strong>
                            </div>
                            <div className="text-right truncate">
                              <span className="text-slate-400">수량:</span> <strong className="text-blue-700 font-extrabold">{ni.quantity} {ni.unit || 'EA'}</strong>
                            </div>
                          </div>

                          {/* Bottom: Raw Text and Action Button to Navigate to CAD Drawing Location */}
                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="text-slate-400 text-[10.5px] truncate">
                              Raw: <span className="font-mono text-slate-600">{ni.raw_name}</span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNormItem(ni);
                                handleNavigateToCadDrawing(ni);
                              }}
                              className="btn-hover-effect px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-xs shrink-0"
                              title="클릭 시 1. 도면등록 & 뷰어 탭으로 이동하여 해당 도면/BOM 위치로 화면을 맞춥니다."
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>도면 위치 줌인 ↗</span>
                            </button>
                          </div>

                          {finalItem && (
                            <div className="text-[11px] text-emerald-700 font-semibold pt-1 border-t border-emerald-100 flex items-center space-x-1">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">승인 마스터: [{finalItem.final_master_code}] {finalItem.final_name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Selected Item & Top 3 Recommendations */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              {selectedNormItem ? (
                <>
                  <div className="border-b border-slate-100 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                        선택 품목 검토
                      </div>
                      <button
                        onClick={() => handleNavigateToCadDrawing(selectedNormItem)}
                        className="btn-hover-effect px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer group"
                        title="CAD 뷰어로 이동하여 이 품목이 그려진 도면과 표제란 위치를 줌인합니다."
                      >
                        <ExternalLink className="w-3.5 h-3.5 group-hover:scale-115 transition-transform" />
                        <span>CAD 도면 위치 줌인 ↗</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2 mt-1">
                      <span className="font-mono font-extrabold text-xs text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">
                        {selectedNormItem.drawing_no || '도면번호 미지정'}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {selectedNormItem.drawing_name || selectedNormItem.normalized_name}
                      </h3>
                    </div>

                    {/* Detailed Title Block Spec Card */}
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between text-slate-500 font-semibold border-b border-slate-200 pb-1.5">
                        <span className="flex items-center space-x-1.5 text-blue-700">
                          <FileText className="w-3.5 h-3.5" />
                          <span>도면 표제란(Title Block) 메타데이터</span>
                        </span>
                        <span className="text-[10px] text-slate-400">도면 1:1 동기화 완료</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px]">도면 번호 (DWG No.)</span>
                          <strong className="font-mono font-bold text-slate-900">{selectedNormItem.drawing_no || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">프로젝트명</span>
                          <span className="font-semibold text-slate-800 truncate block" title={selectedNormItem.project_name || data?.case?.project_name}>
                            {selectedNormItem.project_name || data?.case?.project_name || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">고객사 (Customer)</span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {selectedNormItem.company_name || data?.case?.company_name || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">리비전 (Rev)</span>
                          <span className="font-bold text-slate-800">{selectedNormItem.drawing_revision || 'R00'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">재질 (Material)</span>
                          <span className="font-semibold text-slate-800">{selectedNormItem.drawing_material || selectedNormItem.material_candidate || 'SS400'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">척도 (Scale)</span>
                          <span className="font-semibold text-slate-800">{selectedNormItem.drawing_scale || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">규격/사양</span>
                          <span className="font-semibold text-slate-800">{selectedNormItem.spec_candidate || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">산출 수량</span>
                          <span className="font-extrabold text-blue-700">{selectedNormItem.quantity} {selectedNormItem.unit || 'EA'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Standard Schema & Similarity Recommendation Card */}
                    {selectedNormItem.standard_schema_suggestion && (
                      <div className="mt-3 p-3.5 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-emerald-50/40 rounded-xl border border-blue-200 text-xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
                          <span className="flex items-center space-x-1.5 text-blue-900 font-extrabold text-[11.5px]">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>자재리스트 표준 규격 & 유사도 분석 결과</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            selectedNormItem.standard_schema_suggestion.similarity_score >= 90
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : selectedNormItem.standard_schema_suggestion.similarity_score >= 70
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}>
                            유사도: {selectedNormItem.standard_schema_suggestion.similarity_score}%
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-700 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">자재구분</span>
                            <span className={`inline-block font-extrabold px-1.5 py-0.2 rounded text-[10px] ${
                              selectedNormItem.standard_schema_suggestion.item_type === 'COMMERCIAL'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {selectedNormItem.standard_schema_suggestion.item_type_label}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">표준 재질 (비중)</span>
                            <strong className="text-slate-900 font-bold">{selectedNormItem.standard_schema_suggestion.standard_material}</strong>
                            <span className="text-[10px] text-slate-400 ml-1">({selectedNormItem.standard_schema_suggestion.density})</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">가공치수 / 예상중량</span>
                            <span className="font-mono text-slate-900 font-semibold">{selectedNormItem.standard_schema_suggestion.dimension_str}</span>
                            {selectedNormItem.standard_schema_suggestion.calculated_weight_kg > 0 && (
                              <span className="text-blue-700 font-bold block text-[10px]">
                                예상: {selectedNormItem.standard_schema_suggestion.calculated_weight_kg} kg
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">표준 후처리</span>
                            <span className="text-slate-800 font-medium">{selectedNormItem.standard_schema_suggestion.treatment_label}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-slate-400 block text-[10px]">매칭 마스터</span>
                            <span className="font-mono text-blue-900 font-semibold truncate block">
                              {selectedNormItem.standard_schema_suggestion.matched_master_name 
                                ? `[${selectedNormItem.standard_schema_suggestion.matched_master_code}] ${selectedNormItem.standard_schema_suggestion.matched_master_name}`
                                : '신규 가공품 (도면 맞춤 제작)'}
                            </span>
                          </div>
                        </div>

                        {/* Self-Learning Learned Price Card */}
                        {selectedNormItem.standard_schema_suggestion.learned_unit_price && selectedNormItem.standard_schema_suggestion.learned_unit_price > 0 && (
                          <div className="p-2.5 bg-gradient-to-r from-purple-50 to-indigo-50/70 rounded-xl border border-purple-200 text-purple-900 text-[11px] flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Brain className="w-4 h-4 text-purple-600 shrink-0" />
                              <div>
                                <span className="font-extrabold text-[11.5px] block text-purple-950">
                                  자가학습 검증 단가: ₩{Number(selectedNormItem.standard_schema_suggestion.learned_unit_price).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-purple-600">
                                  누적 {selectedNormItem.standard_schema_suggestion.learned_approval_count || 1}회 검증 승인 ({selectedNormItem.standard_schema_suggestion.learned_company_name || '사내 지식풀'})
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200/80 font-bold text-purple-800 shrink-0">
                              자동완성 준비완료
                            </span>
                          </div>
                        )}

                        {/* Similarity Reasons */}
                        {selectedNormItem.standard_schema_suggestion.similarity_reasons?.length > 0 && (
                          <div className="pt-2 border-t border-blue-200/60 text-[10.5px] space-y-1">
                            <span className="font-bold text-slate-600 block">유사도 판정 근거:</span>
                            {selectedNormItem.standard_schema_suggestion.similarity_reasons.map((r: string, rIdx: number) => (
                              <div key={rIdx} className="flex items-center space-x-1.5 text-slate-600">
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Approval Status Banner (If already approved) */}
                  {finalBomItems.find((f: any) => f.normalized_item_id === selectedNormItem.id) && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <strong className="font-bold">검수 승인 완료된 품목입니다</strong>
                          {(() => {
                            const fItem = finalBomItems.find((f: any) => f.normalized_item_id === selectedNormItem.id);
                            return (
                              <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                                [{fItem?.final_master_code || '도면 가공품'}] {fItem?.final_name} • {fItem?.final_quantity} {fItem?.final_unit}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                          승인완료
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUnapproveItem(selectedNormItem.id, selectedNormItem.drawing_name || selectedNormItem.normalized_name)}
                          disabled={actionLoading}
                          className="btn-hover-effect-secondary px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-300 rounded-lg text-xs font-bold flex items-center space-x-1 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                          title="이 품목의 승인을 취소하고 검토 대기 상태로 되돌립니다."
                        >
                          <RotateCcw className="w-3 h-3 text-rose-600" />
                          <span>승인 취소 ↺</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Top 3 Master Recommendation Cards */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>
                        추천 마스터 후보 (
                        {candidates.filter((c: any) => c.normalized_item_id === selectedNormItem.id).length}건)
                      </span>
                    </h4>

                    {candidates.filter((c: any) => c.normalized_item_id === selectedNormItem.id).length > 0 ? (
                      candidates
                        .filter((c: any) => c.normalized_item_id === selectedNormItem.id)
                        .map((cand: any) => {
                          const pos = JSON.parse(cand.positive_evidence_json || '[]');
                          const neg = JSON.parse(cand.negative_evidence_json || '[]');

                          return (
                            <div
                              key={cand.id}
                              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 transition-all space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center">
                                    {cand.rank}
                                  </span>
                                  <span className="font-bold text-slate-900 text-sm">
                                    [{cand.master_code}] {cand.standard_name}
                                  </span>
                                </div>
                                <span className="text-xs font-extrabold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                  점수: {cand.total_score}점
                                </span>
                              </div>

                              {/* Evidence Reasons (PROMPT 12) */}
                              <div className="space-y-1 text-xs">
                                {pos.map((p: string, i: number) => (
                                  <div key={i} className="text-emerald-700 flex items-center space-x-1">
                                    <Check className="w-3.5 h-3.5 shrink-0" />
                                    <span>{p}</span>
                                  </div>
                                ))}
                                {neg.map((n: string, i: number) => (
                                  <div key={i} className="text-red-600 flex items-center space-x-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{n}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Approval Action Buttons (PROMPT 13) */}
                              <div className="flex items-center space-x-2 pt-2 border-t border-slate-200">
                                <button
                                  onClick={() => handleApproveItem(selectedNormItem.id, 'EXISTING_MASTER', cand)}
                                  disabled={actionLoading}
                                  className="btn-hover-effect px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  이 마스터로 승인
                                </button>
                                <button
                                  onClick={() => handleApproveItem(selectedNormItem.id, 'SIMILAR_MASTER', cand, '유사품 규격 차이 승인')}
                                  disabled={actionLoading}
                                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  유사품으로 승인
                                </button>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2.5">
                        <Info className="w-5 h-5 text-slate-400 mx-auto" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">사내 기성 표준품 DB에 일치하는 후보가 없습니다.</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            도면에서 직접 추출된 고유 주문 제작 가공품/어셈블리 부품입니다.
                          </p>
                        </div>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleApproveItem(selectedNormItem.id, 'NEW_ITEM_CANDIDATE', null, '도면 주문가공품 승인')}
                            disabled={actionLoading}
                            className="btn-hover-effect px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>도면 가공품으로 확정 승인</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Exception Decisions (PROMPT 13) */}
                  <div className="flex items-center space-x-2 pt-3 border-t border-slate-100 flex-wrap gap-y-2">
                    {candidates.filter((c: any) => c.normalized_item_id === selectedNormItem.id).length > 0 && (
                      <button
                        onClick={() => handleApproveItem(selectedNormItem.id, 'NEW_ITEM_CANDIDATE', null, '신규 마스터 등록 후보')}
                        disabled={actionLoading}
                        className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        신규 마스터 후보 지정
                      </button>
                    )}
                    <button
                      onClick={() => handleApproveItem(selectedNormItem.id, 'EXCLUDED', null, '견적 제외 품목')}
                      disabled={actionLoading}
                      className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      견적 제외 (EXCLUDED)
                    </button>
                    {finalBomItems.find((f: any) => f.normalized_item_id === selectedNormItem.id) && (
                      <button
                        type="button"
                        onClick={() => handleUnapproveItem(selectedNormItem.id, selectedNormItem.drawing_name || selectedNormItem.normalized_name)}
                        disabled={actionLoading}
                        className="btn-hover-effect-secondary px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                        title="이 품목의 승인을 취소하고 검토 대기 상태로 되돌립니다."
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                        <span>승인 취소 (검토 대기로 복귀)</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-slate-400 text-sm">품목을 선택해주세요.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Price Modal (방안 A: 수기 단가 추천 이력 & 자동 누적 풀) */}
      {/* Privacy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">공개 불가 요청</h3>
            <p className="text-sm text-slate-600 mb-4">
              기본적으로 모든 견적은 사내에 공유됩니다. 보안 등 특별한 사유로 본인만 열람해야 하는 경우 사유를 작성해 주세요. (최고 승인권자의 결재 후 비공개 처리됩니다.)
            </p>
            <textarea
              className="w-full border border-slate-300 rounded p-3 text-sm h-24 mb-4"
              placeholder="공개 불가 사유를 입력하세요..."
              value={privacyReason}
              onChange={e => setPrivacyReason(e.target.value)}
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const res = await apiFetch(`/api/quotation-cases/${id}/visibility`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'REQUEST_PRIVATE', reason: privacyReason })
                  });
                  if (res.ok) {
                    setShowPrivacyModal(false);
                    fetchData();
                  } else {
                    alert('요청 중 오류가 발생했습니다.');
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors"
              >
                요청하기
              </button>
            </div>
          </div>
        </div>
      )}

      {manualPriceModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-md">
                    Price Master & Manual Price
                  </span>
                  <h3 className="text-base font-bold text-slate-900">단가 마스터 조회 & 수기 단가 설정</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  표준 Price Master(단가 마스터)에서 선택하거나, 과거 수기 단가 이력 조회 및 신규 단가를 직접 입력하여 적용합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualPriceModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Item Info Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{manualPriceModal.item_name}</span>
                <span className="font-mono text-slate-600 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                  마스터코드: {manualPriceModal.master_code || '미등록'}
                </span>
              </div>
              <div className="text-slate-600 flex items-center space-x-3 text-[11px] flex-wrap gap-y-1">
                <span>규격: <strong className="text-slate-800">{manualPriceModal.specification || '-'}</strong></span>
                <span>재질: <strong className="text-slate-800">{manualPriceModal.material || '-'}</strong></span>
                <span>수량: <strong className="text-slate-800 font-mono">{manualPriceModal.quantity} {manualPriceModal.unit}</strong></span>
                <span>현재단가: <strong className="text-blue-700 font-mono font-bold">₩{Number(manualPriceModal.unit_price || 0).toLocaleString()}</strong></span>
                <span>현재출처: <strong className="text-slate-700 font-bold">{manualPriceModal.price_source || '미지정'}</strong></span>
              </div>
            </div>

            {/* Tab Navigation: MASTER vs MANUAL vs DIRECT */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setModalActiveTab('MASTER');
                  setSelectedPriceSource('PRICE_MASTER');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  modalActiveTab === 'MASTER'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>📊 표준 단가 마스터 ({priceMasterList.length}건)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalActiveTab('MANUAL');
                  setSelectedPriceSource('MANUAL_PRICE');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  modalActiveTab === 'MANUAL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>📚 수기 단가 이력 ({manualPriceHistory.length}건)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalActiveTab('DIRECT')}
                className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  modalActiveTab === 'DIRECT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>✏️ 신규 단가 직접 입력</span>
              </button>
            </div>

            {/* Tab 1: Price Master List */}
            {modalActiveTab === 'MASTER' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>등록된 Price Master 단가 목록</span>
                  </h4>
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    클릭: 선택 / 더블클릭: 즉시 단가 마스터 적용 및 닫기
                  </span>
                </div>

                {loadingHistory ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl flex items-center justify-center space-x-2 border border-slate-100">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Price Master 불러오는 중...</span>
                  </div>
                ) : priceMasterList.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 p-1">
                    {priceMasterList.map((m: any) => {
                      const isSelected = selectedMasterId === (m.master_id || m.price_master_id);
                      return (
                        <div
                          key={m.price_master_id || m.id}
                          onClick={() => {
                            setSelectedMasterId(m.master_id || m.price_master_id);
                            setSelectedPriceSource('PRICE_MASTER');
                            setManualPriceInput(Number(m.unit_price).toLocaleString());
                            setManualPriceReason(`Price Master [${m.master_code}] 표준 단가 적용`);
                          }}
                          onDoubleClick={() => {
                            handleDirectApplyPrice(
                              Number(m.unit_price),
                              `Price Master [${m.master_code}] 표준 단가 적용`,
                              'PRICE_MASTER',
                              m.master_id,
                              m.master_code
                            );
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group select-none ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                              : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 bg-white hover:shadow-2xs'
                          }`}
                          title="클릭 시 선택 및 입력창 반영 | 더블클릭 시 이 마스터 단가로 즉시 적용하고 창 닫기"
                        >
                          <div className="space-y-1 min-w-0 flex-1 mr-3">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                                {m.master_code}
                              </span>
                              <span className={`font-bold text-xs ${isSelected ? 'text-emerald-950 font-extrabold' : 'text-slate-900 group-hover:text-emerald-700'}`}>
                                {m.standard_name}
                              </span>
                              {m.specification && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  {m.specification}
                                </span>
                              )}
                              {m.material && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  {m.material}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              분류: {m.category || '표준가공품'} | 단가 유형: {m.price_type || 'STANDARD'}
                            </p>
                          </div>

                          <div className="text-right shrink-0 flex flex-col items-end space-y-1">
                            <div className="flex items-center space-x-1.5">
                              {isSelected ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white flex items-center space-x-1 shadow-2xs">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>선택됨 (더블클릭 즉시적용)</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  더블클릭 즉시적용 ➔
                                </span>
                              )}
                              <span className={`font-mono text-sm ${
                                isSelected
                                  ? 'font-extrabold text-emerald-700'
                                  : 'font-bold text-emerald-600 group-hover:text-emerald-700'
                              }`}>
                                ₩{Number(m.unit_price).toLocaleString()}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              단위: {m.unit || 'EA'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    등록된 Price Master 단가가 없습니다. 수기 단가 또는 직접 입력을 이용하세요.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Manual Price History List */}
            {modalActiveTab === 'MANUAL' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-600" />
                    <span>과거 적용된 Manual Price 추천 이력 ({manualPriceHistory.length}건)</span>
                  </h4>
                  <span className="text-[11px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    클릭: 선택 / 더블클릭: 즉시 수기 단가 적용 및 닫기
                  </span>
                </div>

                {loadingHistory ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl flex items-center justify-center space-x-2 border border-slate-100">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>추천 리스트 불러오는 중...</span>
                  </div>
                ) : manualPriceHistory.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 p-1">
                    {manualPriceHistory.map((item: any) => {
                      const isSelected = selectedHistoryId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedHistoryId(item.id);
                            setSelectedPriceSource('MANUAL_PRICE');
                            setManualPriceInput(Number(item.unit_price).toLocaleString());
                            setManualPriceReason(item.remark || '과거 Manual Price 이력 적용');
                          }}
                          onDoubleClick={() => {
                            handleDirectApplyPrice(Number(item.unit_price), item.remark || '과거 Manual Price 이력 적용', 'MANUAL_PRICE');
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group select-none ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/90 ring-2 ring-blue-500/25 shadow-xs'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 bg-white hover:shadow-2xs'
                          }`}
                          title="클릭 시 선택 및 입력창 반영 | 더블클릭 시 이 단가로 즉시 적용하고 창 닫기"
                        >
                          <div className="space-y-1 min-w-0 flex-1 mr-3">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className={`font-bold text-xs ${isSelected ? 'text-blue-900 font-extrabold' : 'text-slate-900 group-hover:text-blue-700'}`}>
                                {item.item_name}
                              </span>
                              {item.specification && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  {item.specification}
                                </span>
                              )}
                              {item.material && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  {item.material}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-slate-500'}`}>
                              사유: {item.remark || '-'}
                            </p>
                          </div>

                          <div className="text-right shrink-0 flex flex-col items-end space-y-1">
                            <div className="flex items-center space-x-1.5">
                              {isSelected ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white flex items-center space-x-1 shadow-2xs">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>선택됨 (더블클릭 즉시적용)</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  더블클릭 즉시적용 ➔
                                </span>
                              )}
                              <span className={`font-mono text-sm ${
                                isSelected
                                  ? 'font-extrabold text-blue-700'
                                  : 'font-bold text-blue-600 group-hover:text-blue-700'
                              }`}>
                                ₩{Number(item.unit_price).toLocaleString()}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {item.created_at?.slice(0, 10)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    등록된 과거 Manual Price 이력이 없습니다. 아래에서 직접 입력하시면 풀(Pool)에 자동 저장됩니다.
                  </div>
                )}
              </div>
            )}

            {/* Input Form & Confirmation Section */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">단가 적용 설정:</span>
                <div className="flex items-center space-x-2 text-xs font-bold">
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="selectedPriceSource"
                      value="PRICE_MASTER"
                      checked={selectedPriceSource === 'PRICE_MASTER'}
                      onChange={() => setSelectedPriceSource('PRICE_MASTER')}
                      className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className={selectedPriceSource === 'PRICE_MASTER' ? 'text-emerald-700 font-bold' : 'text-slate-600'}>
                      ✨ Price Master로 저장
                    </span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="selectedPriceSource"
                      value="MANUAL_PRICE"
                      checked={selectedPriceSource === 'MANUAL_PRICE'}
                      onChange={() => setSelectedPriceSource('MANUAL_PRICE')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className={selectedPriceSource === 'MANUAL_PRICE' ? 'text-blue-700 font-bold' : 'text-slate-600'}>
                      ✏️ Manual Price로 저장
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    적용 단가 (원) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold text-xs">₩</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualPriceInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setManualPriceInput(raw ? Number(raw).toLocaleString() : '');
                      }}
                      placeholder="예: 45,000"
                      className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    적용 사유 / 비고
                  </label>
                  <input
                    type="text"
                    value={manualPriceReason}
                    onChange={(e) => setManualPriceReason(e.target.value)}
                    placeholder="예: Price Master 표준 단가 적용, 임가공비 협의가 등"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Scope selection & Quote inclusion */}
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoIncludeInQuote}
                    onChange={(e) => setAutoIncludeInQuote(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="flex items-center space-x-1.5 flex-wrap">
                    <span className="text-slate-900 font-bold">견적 선택 체크 자동 활성화</span>
                    <span className="text-slate-500 text-[11px] font-normal">(단가 적용 시 해당 품목을 견적서에 자동 포함)</span>
                  </span>
                </label>

                {(() => {
                  const sameCount = (quoteItems || []).filter((q: any) => q.item_name === manualPriceModal?.item_name).length;
                  return (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="text-[11px] font-bold text-slate-600">적용 범위:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label
                          className={`flex items-start space-x-2 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                            applyScope === 'SINGLE'
                              ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500/20 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                          }`}
                        >
                          <input
                            type="radio"
                            name="applyScope"
                            value="SINGLE"
                            checked={applyScope === 'SINGLE'}
                            onChange={() => setApplyScope('SINGLE')}
                            className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="text-xs leading-tight">
                            <div className="font-bold flex items-center space-x-1">
                              <span>현재 품목 1건만 적용</span>
                              <span className="text-[10px] px-1 py-0.2 bg-blue-100 text-blue-800 rounded font-semibold">기본</span>
                            </div>
                            <div className="text-[10.5px] text-slate-500 font-normal mt-1">
                              No. {manualPriceModal?.item_no} ({manualPriceModal?.quantity} {manualPriceModal?.unit})에만 적용
                            </div>
                          </div>
                        </label>

                        {sameCount > 1 ? (
                          <label
                            className={`flex items-start space-x-2 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                              applyScope === 'ALL_SAME'
                                ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500/20 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                            }`}
                          >
                            <input
                              type="radio"
                              name="applyScope"
                              value="ALL_SAME"
                              checked={applyScope === 'ALL_SAME'}
                              onChange={() => setApplyScope('ALL_SAME')}
                              className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="text-xs leading-tight">
                              <div className="font-bold text-blue-900">동일 품명 {sameCount}건 일괄 적용</div>
                              <div className="text-[10.5px] text-blue-600 font-normal mt-1">
                                {manualPriceModal?.item_name} 전체에 동시 적용
                              </div>
                            </div>
                          </label>
                        ) : (
                          <div className="p-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[11px] flex items-center justify-center">
                            동일한 다른 부품 없음 (단일 부품)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setManualPriceModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveManualPrice}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>단가 확정 및 견적서 반영</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Request Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="font-bold flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4" />
                <span>타 담당자 견적건 수정/승인 결재 요청</span>
              </div>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-amber-700">대상 견적건:</span>
                  <strong className="text-amber-950 font-mono">{qc?.case_no}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700">원 견적 담당자:</span>
                  <strong className="text-amber-950">{ownerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700">신청자 (현재 로그인):</span>
                  <strong className="text-amber-950">{user?.name || '견적 담당자'}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  수정/승인 권한 요청 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="예: 원 담당자(김견적 과장) 부재로 인한 긴급 고객 단가 수정 및 BOM 승인 대행"
                  rows={3}
                  className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <p className="text-[10.5px] text-slate-500 mt-1">
                  * 요청 사유를 제출하면 최고관리자의 [승인권한 설정 및 결재함]으로 즉시 전달되어 결재 후 수정이 가능해집니다.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(false)}
                  disabled={requestingApproval}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleRequestApproval}
                  disabled={requestingApproval}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {requestingApproval ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{requestingApproval ? '요청 제출 중...' : '최고관리자에게 승인 요청'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🧠 Self-Learning Knowledge Pool Modal */}
      {showLearnedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl xl:max-w-7xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header (1행 단일 라인 배치) */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-b border-purple-200 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <div className="flex items-center space-x-3 truncate">
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 shrink-0">
                    <span>도면 분석 자재·단가 자가학습(Self-Learning) 지식풀</span>
                    <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                      총 {learnedPoolList.length}건 누적
                    </span>
                  </h3>
                  <span className="text-slate-300 hidden md:inline">|</span>
                  <p className="text-[11px] text-slate-500 truncate hidden md:inline">
                    도면 검수 및 견적 입력 시 자동 축적되며, 다음 도면 분석 시 95% 이상 신뢰도로 단가를 자동완성합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLearnedModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search & Stats Toolbar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="부품명, 표준명, 규격, 재질, 고객사 검색..."
                  value={learnedPoolSearch}
                  onChange={(e) => setLearnedPoolSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {learnedPoolSearch && (
                  <button
                    type="button"
                    onClick={() => setLearnedPoolSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2 text-[11px] shrink-0">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 font-semibold shadow-2xs">
                  총 검증 횟수: <strong className="text-purple-700 font-bold">{learnedPoolList.reduce((sum, it) => sum + (it.approval_count || 1), 0)}회</strong>
                </span>
                <button
                  type="button"
                  onClick={openLearnedPoolModal}
                  className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold inline-flex items-center space-x-1 cursor-pointer shadow-2xs transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 text-purple-600 ${loadingLearnedPool ? 'animate-spin' : ''}`} />
                  <span>새로고침</span>
                </button>
              </div>
            </div>

            {/* Modal Table Content (1행 기준 깔끔한 시트 레이아웃) */}
            <div className="p-4 overflow-y-auto max-h-[64vh]">
              {loadingLearnedPool ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                  <p className="text-xs font-semibold">자가학습 지식풀 불러오는 중...</p>
                </div>
              ) : learnedPoolList.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Brain className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-xs text-slate-600">아직 학습된 자재 데이터가 없습니다.</p>
                  <p className="text-[11px] text-slate-400 mt-1">2단계에서 도면 부품을 승인하거나 3단계에서 단가를 입력하면 자동으로 누적됩니다.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-center w-12">No.</th>
                        <th className="px-4 py-2.5">표준 부품명</th>
                        <th className="px-3 py-2.5 text-slate-500">도면 원문 표기</th>
                        <th className="px-3 py-2.5">표준 규격</th>
                        <th className="px-3 py-2.5">표준 재질</th>
                        <th className="px-4 py-2.5 text-right">최근 단가</th>
                        <th className="px-3 py-2.5 text-center">검증 승인 횟수</th>
                        <th className="px-3 py-2.5">출처 / 고객사</th>
                        <th className="px-3 py-2.5 text-slate-500 text-center">최근 적용일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-sans">
                      {learnedPoolList
                        .filter((item: any) => {
                          if (!learnedPoolSearch) return true;
                          const q = learnedPoolSearch.toLowerCase();
                          return (
                            item.item_name?.toLowerCase().includes(q) ||
                            item.standard_name?.toLowerCase().includes(q) ||
                            item.specification?.toLowerCase().includes(q) ||
                            item.material?.toLowerCase().includes(q) ||
                            item.company_name?.toLowerCase().includes(q)
                          );
                        })
                        .map((item: any, idx: number) => (
                          <tr key={item.id} className="hover:bg-purple-50/40 transition-colors h-10">
                            <td className="px-3 py-2 text-center font-mono text-slate-400 text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-900">
                              <span className="text-purple-950">{item.standard_name || item.item_name}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">
                              {item.standard_name && item.item_name !== item.standard_name ? item.item_name : '-'}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600 text-[11px]">
                              {item.specification || '-'}
                            </td>
                            <td className="px-3 py-2 text-[11px]">
                              <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {item.standard_material || item.material || 'SS400'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-purple-700 text-[12px]">
                              {Number(item.unit_price) > 0 ? `₩${Number(item.unit_price).toLocaleString()}` : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-extrabold text-[10.5px] bg-purple-100 text-purple-800 border border-purple-200">
                                <span>⚡</span>
                                <span>{item.approval_count || 1}회 승인</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-700">
                              {item.company_name || '사내 공통'}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500 font-mono text-center">
                              {(item.last_used_at || item.created_at)?.slice(0, 10)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                💡 자가학습 풀은 도면 승인 및 견적 확정 시 실시간으로 동기화됩니다.
              </span>
              <button
                type="button"
                onClick={() => setShowLearnedModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Smart Upload Intent Modal (Buttons 1, 2, 3) */}
      {uploadIntentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    도면 추가 분석 방식 선택
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200">
                      스마트 인텐트 감지
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    기존 도면 데이터 보존 및 최적의 견적 산출 방식을 선택해 주세요.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelUploadIntent}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* File Info Alert */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 truncate">
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-extrabold bg-blue-600 text-white">
                    추가 업로드 파일
                  </span>
                  <span className="font-bold text-slate-900 truncate">
                    {uploadIntentModal.file.name}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    ({(uploadIntentModal.file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 shrink-0 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  무결성 보존 준비됨
                </span>
              </div>

              <div className="text-xs text-slate-600 leading-relaxed font-medium">
                현재 프로젝트에 이미 등록된 도면이 존재합니다. 새로 추가된 도면을 어떻게 처리하시겠습니까?
              </div>

              {/* 3 Option Action Cards */}
              <div className="space-y-3">
                {/* 1. Primary Recommendation: Merge into Current Case (방안 B) */}
                <div
                  onClick={handleIntentMergeCurrentCase}
                  className="p-4 rounded-xl border-2 border-emerald-400 bg-emerald-50/50 hover:border-emerald-600 hover:bg-emerald-100/60 transition-all cursor-pointer group shadow-xs ring-2 ring-emerald-200/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5 shadow-xs">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-emerald-950 text-sm group-hover:text-emerald-800 transition-colors">
                            [추천 1순위] ➕ 현재 견적건에 추가 통합 분석 (방안 B)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-2xs">
                            실무 표준 권장
                          </span>
                        </div>
                        <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                          <strong>기존 도면 데이터를 100% 안전하게 보존</strong>하면서, 이번 도면을 현재 화면에 추가하여 한 견적서로 합산 분석합니다.
                        </p>
                        <div className="flex items-center space-x-2 pt-0.5 text-[11px] text-emerald-700">
                          <span>✓ 동일 프로젝트 세트 도면 · 한 화면에 다중 도면 모아 견적 작성 시 필수 선택</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-1 transition-all shrink-0 mt-2" />
                  </div>
                </div>

                {/* 2. Revision Update (상황 C) */}
                <div
                  onClick={handleIntentRevisionUpdate}
                  className="p-4 rounded-xl border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-50/50 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                        <RotateCcw className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm group-hover:text-purple-700 transition-colors">
                            [설계변경] 🔄 기존 도면 설계변경(Rev-Up) 교체
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            리비전 승계
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          기존 도면의 수정 리비전으로 반영하며, 이미 입력된 부품 단가 및 마스터 매칭 정보를 신규 도면에 자동 승계합니다.
                        </p>
                        <div className="flex items-center space-x-2 pt-0.5 text-[11px] text-slate-400">
                          <span>• 설계 수정 도면 재입고 시 선택 (단가 재입력 방지)</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </div>
                </div>

                {/* 3. Separate Case (방안 A) - Placed at bottom with clear caution */}
                <div
                  onClick={handleIntentSeparateCase}
                  className="p-4 rounded-xl border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50/50 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                            [프로젝트 분리] 🚀 별도 신규 견적건으로 분리 생성 (방안 A)
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            새 창/새 건
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          현재 화면을 벗어나 <strong className="text-blue-900">완전히 새로운 견적 프로젝트를 별도 생성</strong>하여 독립적으로 견적서를 작성합니다.
                        </p>
                        <div className="flex items-center space-x-2 pt-0.5 text-[11px] text-amber-700 font-medium">
                          <span>⚠️ 주의: 현재 화면의 도면과 분리되어 새 프로젝트 화면으로 이동합니다.</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                🛡️ CADON 안전 분리: 선택 전까지 기존 데이터에 아무런 변경을 가하지 않습니다.
              </span>
              <button
                type="button"
                onClick={handleCancelUploadIntent}
                className="px-4 py-2 border border-slate-300 hover:bg-white text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                취소 (업로드 중단)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏢 Company Edit / Manual Input Modal */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">고객사 지정 / 직접 입력 (설계자 판단)</h3>
                  <p className="text-[11px] text-slate-400">도면 표제란 회사명 누락 또는 로고 이미지 대응</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCompanyModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                💡 <strong>안내:</strong> 도면 표제란에 텍스트 회사명이 없거나 회사 로고가 이미지 형태로 삽입된 경우,
                원청 발주처 또는 견적 대상 고객사를 직접 지정하실 수 있습니다.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  고객사명 (직접 입력 또는 선택) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputCompanyName}
                    onChange={(e) => setInputCompanyName(e.target.value)}
                    placeholder="예: (주)현대엘리베이터, 오티스, 미쯔비시, 또는 부품 제조사명"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCompany();
                    }}
                  />
                  {inputCompanyName && (
                    <button
                      type="button"
                      onClick={() => setInputCompanyName('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Select from Existing Companies */}
              {existingCompanies.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                    📋 기존 등록된 고객사 빠른 선택:
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
                    {existingCompanies.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setInputCompanyName(c.company_name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          inputCompanyName === c.company_name
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        {c.company_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Recommendations from Drawing Context */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                  ✨ 도면 파일명/모델 기반 추천 키워드:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['(주)현대엘리베이터', '오티스엘리베이터코리아', '티케이엘리베이터', 'MGK 동기권상기', '자체 제작(외주)'].map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => setInputCompanyName(kw)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                    >
                      + {kw}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowCompanyModal(false)}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                닫기 (미지정 상태 유지)
              </button>
              <button
                type="button"
                onClick={handleSaveCompany}
                disabled={savingCompany || !inputCompanyName.trim()}
                className="btn-hover-effect px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer disabled:opacity-50 transition-colors flex items-center space-x-1.5 shadow-xs"
              >
                {savingCompany ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>고객사 적용 및 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📦 Case Detail Archive Reason Modal */}
      {detailArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-purple-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Archive className="w-5 h-5 text-purple-300" />
                <h3 className="font-bold text-sm">견적건 보관함 이동 (보류/이력 관리)</h3>
              </div>
              <button
                onClick={() => setDetailArchiveModalOpen(false)}
                className="text-purple-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  보관 사유 선택
                </label>
                <div className="space-y-2">
                  {['일정/품의 지연', 'Rev 도면 변경 대기', '견적 완료 이력 보관', '고객사 요청 보류', 'CUSTOM'].map((option) => (
                    <label
                      key={option}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        detailArchiveReasonType === option
                          ? 'bg-purple-50 border-purple-400 text-purple-900 font-bold'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="detailArchiveReason"
                        checked={detailArchiveReasonType === option}
                        onChange={() => setDetailArchiveReasonType(option)}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>{option === 'CUSTOM' ? '기타 사유 직접 입력' : option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {detailArchiveReasonType === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">직접 입력</label>
                  <input
                    type="text"
                    value={detailArchiveCustomReason}
                    onChange={(e) => setDetailArchiveCustomReason(e.target.value)}
                    placeholder="보관 사유를 입력하세요 (예: 11월 재검토 등)"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                💡 <strong>안내:</strong> 보관함으로 이동된 건은 메인 진행 목록에서 숨겨지며, 언제든 상단 <strong>‘작업 활성 상태로 복원’</strong>을 통해 다시 진행할 수 있습니다.
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDetailArchiveModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleArchiveCase}
                disabled={detailLifecycleLoading}
                className="px-4 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{detailLifecycleLoading ? '처리 중...' : '보관함으로 이동'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
