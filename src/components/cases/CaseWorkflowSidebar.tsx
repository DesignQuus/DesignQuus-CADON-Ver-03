'use client';

import React from 'react';
import Link from 'next/link';
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
}

export default function CaseWorkflowSidebar({
  selectedTab,
  onSelectTab,
  counts,
  latestReadyCase,
  user,
  onSingleUploadClick,
  onBatchUploadClick,
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

  // 접힌 상태 (Slim Icon Mode)
  if (isCollapsed) {
    return (
      <aside className="w-16 shrink-0 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col items-center py-3 space-y-4 select-none">
        {/* Expand Button */}
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors cursor-pointer"
          title="파이프라인 사이드바 펼치기"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Quick Upload Icon */}
        <button
          onClick={onSingleUploadClick}
          className="w-10 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
          title="도면 파일 업로드 (원스톱 쾌속)"
        >
          <UploadCloud className="w-5 h-5" />
        </button>

        <div className="w-8 border-t border-slate-200 my-1"></div>

        {/* Tab 1: 전체 */}
        <button
          onClick={() => onSelectTab('ALL')}
          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
            selectedTab === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
          title={`전체 견적의뢰 (${counts.total}건)`}
        >
          <Layers className="w-4 h-4" />
          <span className="text-[9px] font-bold mt-0.5">{counts.total}</span>
        </button>

        {/* Tab 2: 도면 대기 */}
        <button
          onClick={() => onSelectTab('PENDING')}
          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
            selectedTab === 'PENDING' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
          }`}
          title={`도면 대기 / 분석 대기 (${counts.pending}건)`}
        >
          <Clock className="w-4 h-4" />
          <span className="text-[9px] font-bold mt-0.5">{counts.pending}</span>
        </button>

        {/* Tab 3: 분석완료 / 매칭중 */}
        <button
          onClick={() => onSelectTab('ANALYZED')}
          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
            selectedTab === 'ANALYZED' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
          }`}
          title={`BOM 분석완료 / 단가 매칭중 (${counts.analyzed}건)`}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-[9px] font-bold mt-0.5">{counts.analyzed}</span>
        </button>

        {/* Tab 4: 견적준비완료 (단일 건 시 즉시 직행) */}
        {counts.ready === 1 && latestReadyCase ? (
          <Link
            href={`/cases/${latestReadyCase.id}?tab=quote`}
            className="w-10 h-10 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col items-center justify-center relative cursor-pointer transition-all shadow-xs group"
            title={`[${latestReadyCase.case_no}] 견적서 즉시 발행 화면으로 직행`}
          >
            <Zap className="w-4 h-4 text-emerald-100 group-hover:scale-115 transition-transform" />
            <span className="text-[8.5px] font-extrabold mt-0.5">발행</span>
          </Link>
        ) : (
          <button
            onClick={() => onSelectTab('READY_FOR_QUOTE')}
            className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
              selectedTab === 'READY_FOR_QUOTE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
            title={`견적 준비 완료 (${counts.ready}건)`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[9px] font-bold mt-0.5">{counts.ready}</span>
          </button>
        )}

        <div className="w-8 border-t border-slate-200 my-1"></div>

        {/* 보관함 */}
        <button
          onClick={() => onSelectTab('ARCHIVED')}
          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
            selectedTab === 'ARCHIVED' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-600 hover:bg-purple-50'
          }`}
          title={`보관함 (${counts.archived ?? 0}건)`}
        >
          <span className="text-xs">📦</span>
          <span className="text-[9px] font-bold mt-0.5">{counts.archived ?? 0}</span>
        </button>

        {/* 휴지통 */}
        <button
          onClick={() => onSelectTab('TRASHED')}
          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors ${
            selectedTab === 'TRASHED' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-600 hover:bg-rose-50'
          }`}
          title={`휴지통 (${counts.trashed ?? 0}건)`}
        >
          <span className="text-xs">🗑️</span>
          <span className="text-[9px] font-bold mt-0.5">{counts.trashed ?? 0}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col overflow-hidden transition-all duration-200">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              작업 파이프라인
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
            >
              전체 ({counts.total})
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
        {/* STEP 01: 도면 접수 및 등록 (세로형 Drag & Drop 드롭존 통합) */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-lg border-[3px] transition-all p-3 space-y-2.5 ${
            isDragging
              ? 'border-blue-600 bg-blue-50/90 shadow-lg scale-[1.01] ring-4 ring-blue-500/20'
              : 'border-blue-500 bg-gradient-to-b from-blue-50/60 via-white to-white shadow-xs hover:border-blue-600 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-2xs">
                1
              </span>
              <span className="text-xs font-extrabold text-slate-900">도면 접수 & 등록</span>
            </div>
            <span className="text-[10px] font-bold text-blue-800 bg-blue-100/90 px-2 py-0.5 rounded-full border border-blue-200 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
              <span>원스톱 쾌속 시작</span>
            </span>
          </div>

          {/* Visual Drag & Drop Target Area */}
          <div className="py-3 px-2 bg-white/90 rounded border border-dashed border-blue-200 flex flex-col items-center justify-center text-center space-y-1.5 shadow-2xs">
            <div className="w-11 h-11 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900 leading-tight">
                DWG 도면 파일을 여기에 끌어다 놓으세요
              </p>
              <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                (Drag & Drop)
              </p>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-snug px-1">
              도면을 드롭하면 <strong className="text-slate-800 font-semibold">신규 프로젝트 자동 생성 ➔ 도면 업로드 ➔ AI BOM 추출 파이프라인</strong>이 즉시 시작됩니다.
            </p>
          </div>

          {/* Action Buttons for Step 1 (Enhanced Hover Highlights) */}
          <div className="space-y-2 pt-0.5">
            <button
              onClick={onSingleUploadClick}
              className="btn-hover-effect w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-xs group"
              title="로컬 PC에서 단일 도면 파일(.dwg, .dxf)을 선택하여 즉시 업로드"
            >
              <FileCode2 className="w-4 h-4 text-blue-200 group-hover:scale-115 group-hover:rotate-6 transition-transform" />
              <span>도면 파일 선택</span>
            </button>

            <button
              onClick={onBatchUploadClick}
              className="btn-hover-effect-secondary w-full px-3 py-2.5 bg-white text-blue-700 border border-blue-300 rounded text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs group"
              title="여러 장의 도면(ZIP 파일 포함)을 일괄 선택하여 통합/개별 처리"
            >
              <Folder className="w-4 h-4 text-blue-500 group-hover:scale-115 group-hover:-translate-y-0.5 transition-transform" />
              <span>다중 도면 일괄 등록</span>
            </button>

            <button
              type="button"
              onClick={() => alert('기존 견적 복제는 견적 목록 테이블 각 행 우측의 복제 아이콘을 클릭하여 내 담당으로 즉시 복제하실 수 있습니다.')}
              className="btn-hover-effect-secondary w-full px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded text-[11px] font-semibold transition-all flex items-center justify-between cursor-pointer group"
              title="기존 견적을 복제하여 신규 견적으로 생성 (테이블 행 메뉴에서 지원)"
            >
              <span className="flex items-center space-x-1.5">
                <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:scale-115 transition-transform" />
                <span>기존 유사 견적 복제</span>
              </span>
              <span className="text-[9.5px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold border border-blue-200">
                행 메뉴 지원
              </span>
            </button>
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

            {/* [1단계/4단계 조치] 스마트 맥락 인지(Context-Aware) 견적서 즉시 발행 CTA 및 엑셀 일괄 다운로드 */}
            {counts.ready === 1 && latestReadyCase ? (
              <div className="space-y-1.5 mt-1.5">
                <Link
                  href={`/cases/${latestReadyCase.id}?tab=quote`}
                  className="btn-hover-effect-primary w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all flex items-center justify-between shadow-xs group cursor-pointer"
                  title={`[${latestReadyCase.case_no}] 최종 견적서 즉시 산출 및 발행 화면으로 직행`}
                >
                  <span className="flex items-center space-x-1.5 min-w-0">
                    <Zap className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="truncate font-extrabold">[{latestReadyCase.case_no}] 견적서 발행</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-200 group-hover:translate-x-1 transition-transform shrink-0" />
                </Link>
                {onBulkExportExcel && (
                  <button
                    type="button"
                    onClick={onBulkExportExcel}
                    disabled={isExportingExcel}
                    className="w-full px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                    title={`[${latestReadyCase.case_no}] 견적 BOM 엑셀 다운로드 (ZIP)`}
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isExportingExcel ? '엑셀 압축 중...' : '엑셀 견적서 다운로드 (ZIP)'}</span>
                  </button>
                )}
              </div>
            ) : counts.ready > 1 ? (
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
                  <span>견적 준비 대기건 없음</span>
                </span>
                <span className="text-[10px] text-slate-400">0건</span>
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