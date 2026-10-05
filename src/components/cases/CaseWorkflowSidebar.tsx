'use client';

import React from 'react';
import Link from 'next/link';
import SidebarBookmarkTab from '@/components/common/SidebarBookmarkTab';
import {
  UploadCloud,
  FileCode2,
  Folder,
  Layers,
  Cpu,
  DollarSign,
  ShieldCheck,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Lock,
  ChevronRight,
  ChevronLeft,
  Plus,
  Copy,
  DownloadCloud,
  Zap,
  ArrowRight
} from 'lucide-react';

export type WorkflowTab =
  | 'ALL'
  | 'PENDING'           // 02. 도면 대기
  | 'ANALYZED'          // 03. AI 분석완료 / 단가 매칭
  | 'READY_FOR_QUOTE'   // 04. 견적 준비 완료
  | 'PRIVATE_APPROVAL'  // 04. 결재 대기 (SUPER_ADMIN)
  | 'SECURE_VAULT'      // 04/05. 보안 견적함 (SUPER_ADMIN)
  | 'ARCHIVED'          // 📦 보관함
  | 'TRASHED';          // 🗑️ 휴지통

interface CaseWorkflowSidebarProps {
  selectedTab: WorkflowTab;
  onSelectTab: (tab: WorkflowTab) => void;
  counts: {
    total: number;
    pending: number;
    analyzed: number;
    ready: number;
    pendingApproval: number;
    secureVault: number;
    archived?: number;
    trashed?: number;
  };
  latestReadyCase?: { id: string; case_no: string; case_name?: string } | null;
  user: {
    userId?: string;
    name?: string;
    role?: string;
  } | null;
  onSingleUploadClick: () => void;
  onBatchUploadClick: () => void;
  isDragging?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onBulkExportExcel?: () => void;
  isExportingExcel?: boolean;
  onOpenInboxView?: () => void;
  onInstantQuoteClick?: () => void;
}

export default function CaseWorkflowSidebar({
  selectedTab,
  onSelectTab,
  counts,
  latestReadyCase,
  user,
  onSingleUploadClick,
  onBatchUploadClick,
  onOpenInboxView,
  onInstantQuoteClick,
  isDragging = false,
  onDragOver,
  onDragLeave,
  onDrop,
  isCollapsed = false,
  onToggleCollapse,
  onBulkExportExcel,
  isExportingExcel = false,
}: CaseWorkflowSidebarProps) {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // 접힌 상태 (완전 접힘 & 좌측 견출 탭으로 대체)
  if (isCollapsed) {
    return null;
  }

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sticky top-4 relative z-20 h-[calc(100vh-5rem)]">
      {/* 버티컬 북마크 견출 탭 (접기) */}
      {onToggleCollapse && (
        <SidebarBookmarkTab
          mode="collapse"
          onClick={onToggleCollapse}
          label="접기"
          title="견적 진행 단계 접기 (테이블 넓게 보기)"
        />
      )}

      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              견적 진행 단계
            </h3>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => onSelectTab('ALL')}
              className={`btn-hover-effect-tab px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                selectedTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs ring-2 ring-blue-300'
                  : 'bg-slate-200/90 text-slate-700 hover:bg-slate-300'
              }`}
              title={`현재 진행중인 견적 (${counts.total}건)`}
            >
              진행중 ({counts.total})
            </button>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                title="사이드바 접기 (테이블 넓게 보기)"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          도면 접수부터 최종 견적 발행까지 순서대로 진행합니다.
        </p>
      </div>

      {/* Vertical Steps List */}
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {/* STEP 01: 도면 접수 및 등록 (슬림형 빠른 실행 & 드롭 가드) */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-lg border transition-all p-3 space-y-2.5 ${
            isDragging
              ? 'border-indigo-600 bg-indigo-50/90 shadow-lg scale-[1.01] ring-4 ring-indigo-500/20'
              : 'border-slate-200 bg-gradient-to-b from-slate-50/80 via-white to-white shadow-2xs hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-extrabold flex items-center justify-center shadow-2xs">
                1
              </span>
              <span className="text-xs font-extrabold text-slate-900">도면 접수 &amp; 등록</span>
            </div>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              신규 등록
            </span>
          </div>

          {/* AI 즉시 견적 (1순위 하이라이트 액션) */}
          {onInstantQuoteClick && (
            <button
              type="button"
              onClick={onInstantQuoteClick}
              className="w-full px-3 py-2 bg-[#E9E9E9] hover:bg-[#DCDCDC] text-slate-800 border border-slate-300 rounded text-xs font-bold transition-all flex items-center justify-between shadow-xs cursor-pointer group"
              title="도면만 넣으면 10초 만에 AI가 도면분석, BOM추출, 단가매칭을 끝내고 초안 견적서를 즉시 산출합니다."
            >
              <span className="flex items-center space-x-1.5">
                <Zap className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
                <span>AI 즉시 견적</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold border border-slate-300">
                10초 완성
              </span>
            </button>
          )}

          {/* Action Buttons for Step 1: 단일/정밀 등록 메인 단일화 & 다중 일괄 연계 */}
          <div className="space-y-1.5 pt-0.5">
            <button
              type="button"
              onClick={onSingleUploadClick}
              className="btn-hover-effect w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs group"
              title="도면 파일(.dwg, .dxf)을 업로드하여 정밀 AI 분석을 시작합니다."
            >
              <FileCode2 className="w-3.5 h-3.5 text-blue-200 group-hover:scale-110 transition-transform" />
              <span>도면 등록 (정밀 분석)</span>
            </button>
            <div className="flex items-center justify-between text-[10.5px] px-1 text-slate-500">
              <span>단일 CAD 도면 (.dwg, .dxf)</span>
              <button
                type="button"
                onClick={onBatchUploadClick}
                className="text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                title="여러 도면 파일(ZIP 파일 포함)을 한 번에 일괄 업로드합니다."
              >
                <Folder className="w-3 h-3 text-blue-500" />
                <span>다중/ZIP 일괄 등록</span>
              </button>
            </div>
          </div>
        </div>

        {/* STEP 02: CAD 도면 & AI 분석 */}
        <div className="rounded-md border border-slate-200 p-2.5 space-y-1.5 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-extrabold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-slate-900">CAD 도면 AI 분석</span>
            </div>
            <span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
              조회 필터
            </span>
          </div>

          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => onSelectTab('PENDING')}
              title="도면 등록 및 AI 분석 대기 상태인 견적 건만 목록 필터링"
              className={`btn-hover-effect-tab w-full px-2.5 py-2 rounded text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                selectedTab === 'PENDING'
                  ? 'bg-amber-500 text-white font-bold shadow-xs border-amber-600 ring-2 ring-amber-300/50'
                  : 'text-slate-700 hover:bg-amber-50 hover:text-amber-900 border-transparent hover:border-amber-200'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>도면 대기 / 분석 대기</span>
              </span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${
                  selectedTab === 'PENDING' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {counts.pending}
              </span>
            </button>
          </div>
        </div>

        {/* STEP 03: 부품 추출 & 단가 매칭 */}
        <div className="rounded-md border border-slate-200 p-2.5 space-y-1.5 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-extrabold flex items-center justify-center">
                3
              </span>
              <span className="text-xs font-bold text-slate-900">부품·단가 최적화</span>
            </div>
            <span className="text-[9.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
              조회 필터
            </span>
          </div>

          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => onSelectTab('ANALYZED')}
              title="BOM 추출 및 단가 매칭 진행 중인 견적 건만 목록 필터링"
              className={`btn-hover-effect-tab w-full px-2.5 py-2 rounded text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                selectedTab === 'ANALYZED'
                  ? 'bg-blue-600 text-white font-bold shadow-xs border-blue-700 ring-2 ring-blue-300/50'
                  : 'text-slate-700 hover:bg-blue-50 hover:text-blue-900 border-transparent hover:border-blue-200'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span>BOM 추출 / 단가 매칭중</span>
              </span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${
                  selectedTab === 'ANALYZED' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {counts.analyzed}
              </span>
            </button>
          </div>
        </div>

        {/* STEP 04: 견적 산출 & 최종 발행 */}
        <div className="rounded-md border border-slate-200 p-2.5 space-y-1.5 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-extrabold flex items-center justify-center">
                4
              </span>
              <span className="text-xs font-bold text-slate-900">견적 산출 & 발행</span>
            </div>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              최종 단계
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <button
              onClick={() => onSelectTab('READY_FOR_QUOTE')}
              className={`btn-hover-effect-tab w-full px-2.5 py-2 rounded text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                selectedTab === 'READY_FOR_QUOTE'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs border-emerald-700 ring-2 ring-emerald-300/50'
                  : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 border-transparent hover:border-emerald-200'
              }`}
            >
              <span className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>견적 준비 완료 (산출완료)</span>
              </span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${
                  selectedTab === 'READY_FOR_QUOTE' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {counts.ready}
              </span>
            </button>

            {/* Admin Exclusive Approvals & Vault */}
            {isSuperAdmin && (
              <>
                <button
                  onClick={() => onSelectTab('PRIVATE_APPROVAL')}
                  className={`btn-hover-effect-tab w-full px-2.5 py-2 rounded text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                    selectedTab === 'PRIVATE_APPROVAL'
                      ? 'bg-red-600 text-white font-bold shadow-xs border-red-700 ring-2 ring-red-300/50'
                      : 'text-red-700 hover:bg-red-50 border-transparent hover:border-red-200'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-600" />
                    <span>비공개 결재 대기</span>
                  </span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${
                      selectedTab === 'PRIVATE_APPROVAL' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {counts.pendingApproval}
                  </span>
                </button>

                <button
                  onClick={() => onSelectTab('SECURE_VAULT')}
                  className={`btn-hover-effect-tab w-full px-2.5 py-2 rounded text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                    selectedTab === 'SECURE_VAULT'
                      ? 'bg-slate-800 text-white font-bold shadow-xs border-slate-900 ring-2 ring-slate-400/50'
                      : 'text-slate-700 hover:bg-slate-100 border-transparent hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                    <span>🔒 보안 견적함</span>
                  </span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${
                      selectedTab === 'SECURE_VAULT' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {counts.secureVault}
                  </span>
                </button>
              </>
            )}

            {/* 견적 완료 건 CTA */}
            {counts.ready > 0 ? (
              <div className="space-y-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => onSelectTab('READY_FOR_QUOTE')}
                  className="btn-hover-effect-secondary w-full px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-xs font-bold transition-all flex items-center justify-between cursor-pointer group"
                  title="준비완료된 모든 견적건 보기"
                >
                  <span className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-115 transition-transform" />
                    <span>준비완료 ({counts.ready}건) 필터 조회</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
                {onBulkExportExcel && (
                  <button
                    type="button"
                    onClick={onBulkExportExcel}
                    disabled={isExportingExcel}
                    className="btn-hover-effect-primary w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all flex items-center justify-between shadow-xs cursor-pointer group disabled:opacity-50"
                    title={`준비완료된 ${counts.ready}건의 모든 견적서를 엑셀로 자동 변환하여 ZIP으로 일괄 다운로드`}
                  >
                    <span className="flex items-center space-x-1.5">
                      <DownloadCloud className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                      <span>{isExportingExcel ? 'ZIP 패키징 중...' : `일괄 엑셀 다운로드 (${counts.ready}건)`}</span>
                    </span>
                    <span className="text-[10px] bg-emerald-700 px-1.5 py-0.5 rounded text-white font-mono font-bold">ZIP</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className="w-full px-3 py-2 bg-slate-50 text-slate-400 border border-slate-200 rounded text-[11px] font-medium flex items-center justify-between mt-1 select-none"
                title="견적 준비 완료(READY_FOR_QUOTE) 상태인 건이 없습니다."
              >
                <span className="flex items-center space-x-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                  <span>견적 준비건 없음</span>
                </span>
                <span className="text-[10.5px] font-bold text-slate-400">0건</span>
              </div>
            )}
          </div>
        </div>

        {/* 보관 및 휴지통 서브 내비게이션 */}
        <div className="pt-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTab('ARCHIVED')}
              className={`w-full px-2 py-1.5 rounded text-[11px] font-bold transition-all flex items-center justify-between border cursor-pointer ${
                selectedTab === 'ARCHIVED'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
              }`}
              title="보류/이력 건 보관함"
            >
              <span>📦 보관함</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] ${selectedTab === 'ARCHIVED' ? 'bg-purple-800 text-white' : 'bg-purple-200 text-purple-900'}`}>
                {counts.archived ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('TRASHED')}
              className={`w-full px-2 py-1.5 rounded text-[11px] font-bold transition-all flex items-center justify-between border cursor-pointer ${
                selectedTab === 'TRASHED'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
              }`}
              title="삭제된 건 휴지통"
            >
              <span>🗑️ 휴지통</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] ${selectedTab === 'TRASHED' ? 'bg-rose-800 text-white' : 'bg-rose-200 text-rose-900'}`}>
                {counts.trashed ?? 0}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}