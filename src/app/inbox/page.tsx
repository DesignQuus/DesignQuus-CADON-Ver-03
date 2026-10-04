'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import Navigation from '@/components/Navigation';
import {
  UploadCloud,
  FileCode2,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  FolderArchive,
  Layers,
  Sparkles,
  ArrowRight,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Merge,
  Split,
  CheckSquare,
  Square,
  X
} from 'lucide-react';

interface BatchItem {
  id: string;
  batch_id: string;
  uploaded_file_id: string;
  quotation_case_id: string;
  file_name: string;
  file_size: number;
  status: 'PENDING' | 'ANALYZING' | 'READY' | 'ON_HOLD' | 'COMPLETED' | 'ERROR';
  progress: number;
  error_message: string | null;
  retry_count: number;
  sort_order: number;
  created_at: string;
  case_no?: string;
  case_name?: string;
  case_status?: string;
  company_name?: string;
  batch_name?: string;
}

interface BatchStats {
  total: number;
  pending: number;
  analyzing: number;
  ready: number;
  on_hold: number;
  error: number;
}

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [stats, setStats] = useState<BatchStats>({ total: 0, pending: 0, analyzing: 0, ready: 0, on_hold: 0, error: 0 });
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // 수동 그룹핑 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [mergeCaseName, setMergeCaseName] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // 드래그앤드롭 리오더링 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFetchingRef = useRef<boolean>(false);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 사일런트 갱신 (Silent Background Polling)
  const fetchInboxData = useCallback(async (isSilent = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const url = selectedStatus === 'ALL'
        ? '/api/inbox'
        : `/api/inbox?status=${selectedStatus}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      if (!isSilent) {
        showToast('접수함 목록을 불러오지 못했습니다.', 'error');
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [selectedStatus]);

  useEffect(() => {
    fetchInboxData(false);
    const interval = setInterval(() => {
      // 드래그 중이거나 모달이 떠있을 때는 폴링으로 인한 순서 꼬임 방지
      if (draggedIndex === null && !showMergeModal) {
        fetchInboxData(true);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [fetchInboxData, draggedIndex, showMergeModal]);

  // 다중 파일 업로드 처리
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (['.dwg', '.dxf', '.pdf', '.xlsx', '.xls'].includes(ext)) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      showToast('지원되는 파일 형식(.dwg, .dxf, .pdf, .xlsx)이 없습니다.', 'error');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    validFiles.forEach(f => formData.append('files', f));

    try {
      const res = await apiFetch('/api/inbox/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`${validFiles.length}건의 도면 파일이 접수되어 분석 큐에 등록되었습니다.`, 'success');
        fetchInboxData(false);
      } else {
        const err = await res.json();
        showToast(err.error || '업로드에 실패했습니다.', 'error');
      }
    } catch {
      showToast('서버 통신 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 체크박스 선택 토글
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(it => it.id)));
    }
  };

  // 수동 그룹핑 병합 (Merge)
  const openMergeModal = () => {
    if (selectedIds.size < 2) {
      showToast('병합할 도면을 2개 이상 선택해주세요.', 'error');
      return;
    }
    const firstSelected = items.find(it => selectedIds.has(it.id));
    setMergeCaseName(firstSelected ? `[통합 견적] ${firstSelected.file_name} 외 ${selectedIds.size - 1}건` : '통합 견적');
    setShowMergeModal(true);
  };

  const handleMergeSubmit = async () => {
    setIsMerging(true);
    try {
      const res = await apiFetch('/api/inbox/group/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: Array.from(selectedIds),
          targetCaseName: mergeCaseName
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(data.message || '병합이 완료되었습니다.', 'success');
        setSelectedIds(new Set());
        setShowMergeModal(false);
        fetchInboxData(false);
      } else {
        const err = await res.json();
        showToast(err.error || '병합에 실패했습니다.', 'error');
      }
    } catch {
      showToast('병합 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  // 개별 분리 (Split)
  const handleSplit = async (itemId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`[${fileName}] 도면을 별도 독립 견적건으로 분리하시겠습니까?`)) return;

    try {
      const res = await apiFetch('/api/inbox/group/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(data.message || '분리되었습니다.', 'success');
        fetchInboxData(false);
      } else {
        const err = await res.json();
        showToast(err.error || '분리 실패', 'error');
      }
    } catch {
      showToast('분리 처리 중 오류 발생', 'error');
    }
  };

  // 하이브리드 리오더링: 위/아래 이동 및 드래그앤드롭
  const reorderItems = (newItems: BatchItem[]) => {
    setItems(newItems);

    // 350ms 디바운스 후 서버에 순서 동기화 (표준 하이브리드 리오더링 규칙)
    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
    }

    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        const orders = newItems.map((it, idx) => ({ id: it.id, sort_order: idx + 1 }));
        await apiFetch('/api/inbox/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders })
        });
      } catch (err) {
        console.warn('Reorder sync error:', err);
      }
    }, 350);
  };

  const moveItem = (index: number, direction: 'UP' | 'DOWN', e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === items.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const nextList = [...items];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, moved);
    reorderItems(nextList);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const nextList = [...items];
    const [draggedItem] = nextList.splice(draggedIndex, 1);
    nextList.splice(targetIndex, 0, draggedItem);
    setDraggedIndex(targetIndex);
    reorderItems(nextList);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // 재시도 액션
  const handleRetry = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/inbox/${itemId}/retry`, { method: 'POST' });
      if (res.ok) {
        showToast('재시도가 접수되었습니다.', 'success');
        fetchInboxData(true);
      } else {
        const err = await res.json();
        showToast(err.error || '재시도 실패', 'error');
      }
    } catch {
      showToast('재시도 요청 실패', 'error');
    }
  };

  // 보류/재개 액션
  const handleToggleHold = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/inbox/${itemId}/hold`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || '상태가 변경되었습니다.', 'info');
        fetchInboxData(true);
      }
    } catch {
      showToast('보류 처리 실패', 'error');
    }
  };

  // 삭제 액션
  const handleDelete = async (itemId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`[${fileName}] 항목을 접수함에서 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/inbox/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('항목이 삭제되었습니다.', 'info');
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        fetchInboxData(true);
      }
    } catch {
      showToast('삭제 실패', 'error');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 동일한 견적건에 속한 파일 수 카운트 맵 (분리 버튼 노출 여부 판별)
  const caseFileCountMap = items.reduce((acc, it) => {
    if (it.quotation_case_id) {
      acc[it.quotation_case_id] = (acc[it.quotation_case_id] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navigation />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 transition-all duration-300 transform translate-y-0">
          <div className={`px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2.5 border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}>
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-200" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-200" />}
            {toastMessage.type === 'info' && <RefreshCw className="w-4 h-4 text-slate-300 animate-spin" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 수동 그룹핑 병합 모달 */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Merge className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">선택한 도면 병합 (그룹핑)</h3>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              선택하신 <span className="font-bold text-indigo-600">{selectedIds.size}개 도면</span>을 하나의 견적건으로 통합합니다.
              통합된 견적건은 동일 도면번호 및 품명에 대해 BOM 수량이 자동으로 합산(Roll-up)됩니다.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">통합 견적건 명칭</label>
              <input
                type="text"
                value={mergeCaseName}
                onChange={(e) => setMergeCaseName(e.target.value)}
                placeholder="예: [통합 견적] 샤프트 라인 부품 세트"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleMergeSubmit}
                disabled={isMerging || !mergeCaseName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
              >
                {isMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                병합 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Multi-Select Action Bar (수동 그룹핑 플로팅 바) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span><strong className="text-indigo-300">{selectedIds.size}개</strong> 도면 선택됨</span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <button
              onClick={openMergeModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold rounded-lg transition-colors shadow-xs"
            >
              <Merge className="w-3.5 h-3.5" />
              하나의 견적건으로 병합
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              선택 해제
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">도면 일괄 접수함</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                수동 그룹핑 &amp; 대기열 순서 관리
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              여러 도면을 일괄 접수하고, 직접 선택하여 견적건으로 병합·분할하며, 우선순위 순서를 드래그/버튼으로 변경합니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInboxData(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  도면 일괄 등록
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".dwg,.dxf,.pdf,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
              }}
            />
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            onClick={() => setSelectedStatus('ALL')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium opacity-80">전체 접수</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </div>

          <div
            onClick={() => setSelectedStatus('PENDING')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'PENDING'
                ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium flex items-center gap-1.5 opacity-80">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              대기 중
            </div>
            <div className="text-2xl font-bold mt-1 text-slate-600">{stats.pending}</div>
          </div>

          <div
            onClick={() => setSelectedStatus('ANALYZING')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'ANALYZING'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-blue-800 border-slate-200 hover:border-blue-200'
            }`}
          >
            <div className="text-xs font-medium flex items-center gap-1.5 opacity-90">
              <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              분석 중
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-600">{stats.analyzing}</div>
          </div>

          <div
            onClick={() => setSelectedStatus('READY')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'READY'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-emerald-800 border-slate-200 hover:border-emerald-200'
            }`}
          >
            <div className="text-xs font-medium flex items-center gap-1.5 opacity-90">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              검토 준비
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.ready}</div>
          </div>

          <div
            onClick={() => setSelectedStatus('ON_HOLD')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'ON_HOLD'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-white text-amber-800 border-slate-200 hover:border-amber-200'
            }`}
          >
            <div className="text-xs font-medium flex items-center gap-1.5 opacity-90">
              <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
              보류
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-600">{stats.on_hold}</div>
          </div>

          <div
            onClick={() => setSelectedStatus('ERROR')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedStatus === 'ERROR'
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                : 'bg-white text-rose-800 border-slate-200 hover:border-rose-200'
            }`}
          >
            <div className="text-xs font-medium flex items-center gap-1.5 opacity-90">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              오류
            </div>
            <div className="text-2xl font-bold mt-1 text-rose-600">{stats.error}</div>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]'
              : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50/50'
          }`}
        >
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              여기로 도면 파일들을 드래그하여 한 번에 접수하세요
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              지원 포맷: <span className="font-semibold text-slate-700">DWG, DXF</span> (자동 변환 및 8-in-1 단일패스 분석)
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
              <Sparkles className="w-3.5 h-3.5" />
              다중 파일 동시 업로드 지원
            </span>
          </div>
        </div>

        {/* Queue Items Table Section */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
              >
                {selectedIds.size === items.length && items.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                전체선택
              </button>
              <div className="h-3 w-px bg-slate-300" />
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-sm">접수 및 분석 대기열</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-200 text-slate-700">
                  {items.length}건
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>하이브리드 순서 변경 (⋮⋮ 드래그 / ▲▼ 버튼)</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <FileCode2 className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">접수된 도면 파일이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">상단의 업로드 영역에 도면 파일을 드래그하여 시작하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 text-xs font-semibold">
                    <th className="py-3 px-3 w-10 text-center">선택</th>
                    <th className="py-3 px-2 w-16 text-center">순서</th>
                    <th className="py-3 px-3 w-12 text-center">No.</th>
                    <th className="py-3 px-4">도면 파일명</th>
                    <th className="py-3 px-4 w-28">크기</th>
                    <th className="py-3 px-4 w-48">견적건 / 고객사</th>
                    <th className="py-3 px-4 w-32 text-center">상태</th>
                    <th className="py-3 px-4 w-44">진행률</th>
                    <th className="py-3 px-4 w-40 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const isSelected = selectedIds.has(item.id);
                    const isAnalyzing = item.status === 'ANALYZING';
                    const isReady = item.status === 'READY' || item.status === 'COMPLETED';
                    const isError = item.status === 'ERROR';
                    const isHold = item.status === 'ON_HOLD';
                    const hasSiblingFiles = item.quotation_case_id && (caseFileCountMap[item.quotation_case_id] || 0) > 1;

                    return (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/50'
                            : isAnalyzing
                            ? 'bg-blue-50/20'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* 1. 선택 체크박스 */}
                        <td className="py-3 px-3 text-center" onClick={(e) => toggleSelect(item.id, e)}>
                          <button type="button" className="text-slate-400 hover:text-indigo-600">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>

                        {/* 2. 하이브리드 리오더링 컨트롤 (드래그 핸들 + ▲▼ 버튼) */}
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-600 p-0.5" title="드래그하여 순서 변경">
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <div className="flex flex-col">
                              <button
                                onClick={(e) => moveItem(idx, 'UP', e)}
                                disabled={idx === 0}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-20 p-0.5"
                                title="위로 이동"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => moveItem(idx, 'DOWN', e)}
                                disabled={idx === items.length - 1}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-20 p-0.5"
                                title="아래로 이동"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 3. 행번호 (No.) */}
                        <td className="py-3 px-3 text-center text-xs font-mono font-medium text-slate-500">
                          {idx + 1}
                        </td>

                        {/* 4. 도면 파일명 (말줄임 + 툴팁) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCode2 className={`w-4 h-4 shrink-0 ${
                              item.file_name.endsWith('.dwg') ? 'text-indigo-600' : 'text-blue-600'
                            }`} />
                            <div className="min-w-0">
                              <span
                                className="font-semibold text-slate-800 text-xs sm:text-sm block truncate max-w-xs md:max-w-md"
                                title={item.file_name}
                              >
                                {item.file_name}
                              </span>
                              {item.batch_name && (
                                <span className="text-[11px] text-slate-400 block truncate" title={item.batch_name}>
                                  배치: {item.batch_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 5. 파일 크기 */}
                        <td className="py-3 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                          {formatFileSize(item.file_size)}
                        </td>

                        {/* 6. 견적건 / 고객사 / 분리 버튼 */}
                        <td className="py-3 px-4 text-xs">
                          {item.quotation_case_id ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-slate-700 block truncate">
                                  {item.case_no || item.quotation_case_id}
                                </span>
                                {hasSiblingFiles && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="여러 파일이 함께 묶인 통합 견적건">
                                    통합({caseFileCountMap[item.quotation_case_id]}건)
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 block truncate" title={item.company_name}>
                                {item.company_name || '고객사 미지정'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* 7. 상태 배지 */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <Clock className="w-3 h-3 text-slate-400" />
                              대기 중
                            </span>
                          )}
                          {isAnalyzing && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                              분석 중
                            </span>
                          )}
                          {isReady && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              검토 준비
                            </span>
                          )}
                          {isHold && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                              <PauseCircle className="w-3 h-3 text-amber-600" />
                              보류
                            </span>
                          )}
                          {isError && (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 cursor-help"
                              title={item.error_message || '분석 중 오류 발생'}
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              오류 ({item.retry_count}회)
                            </span>
                          )}
                        </td>

                        {/* 8. 진행률 바 */}
                        <td className="py-3 px-4">
                          <div className="w-full">
                            <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                              <span className="text-slate-500 font-sans">
                                {isAnalyzing
                                  ? item.progress < 40
                                    ? 'DXF 변환/로딩...'
                                    : item.progress < 80
                                    ? 'CAD 엔티티 파싱...'
                                    : 'BOM 추출/마스터 매칭...'
                                  : isReady
                                  ? '분석 완료'
                                  : isError
                                  ? '분석 중단'
                                  : '대기열 대기'}
                              </span>
                              <span className="font-bold text-slate-700">{item.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                  isError
                                    ? 'bg-rose-500'
                                    : isReady
                                    ? 'bg-emerald-500'
                                    : isHold
                                    ? 'bg-amber-400'
                                    : 'bg-indigo-600'
                                }`}
                                style={{ width: `${Math.max(item.progress, item.status === 'PENDING' ? 5 : 0)}%` }}
                              />
                            </div>
                            {item.error_message && (
                              <div
                                className="text-[11px] text-rose-600 mt-1 truncate max-w-xs"
                                title={item.error_message}
                              >
                                {item.error_message}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 9. 작업 액션 버튼들 */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {isReady && item.quotation_case_id && (
                              <Link
                                href={`/cases/${item.quotation_case_id}?from=inbox`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition-colors"
                              >
                                검토하기
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}

                            {/* 통합 견적건 분리 버튼 */}
                            {hasSiblingFiles && (
                              <button
                                onClick={(e) => handleSplit(item.id, item.file_name, e)}
                                title="이 도면을 단독 견적건으로 분리"
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                              >
                                <Split className="w-4 h-4" />
                              </button>
                            )}

                            {isError && (
                              <button
                                onClick={(e) => handleRetry(item.id, e)}
                                title="재시도"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}

                            {(item.status === 'PENDING' || isHold) && (
                              <button
                                onClick={(e) => handleToggleHold(item.id, e)}
                                title={isHold ? '대기열로 복귀' : '분석 보류'}
                                className={`p-1.5 rounded-md transition-colors ${
                                  isHold ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                                }`}
                              >
                                {isHold ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                              </button>
                            )}

                            <button
                              onClick={(e) => handleDelete(item.id, item.file_name, e)}
                              title="삭제"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
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
        </div>
      </main>
    </div>
  );
}
