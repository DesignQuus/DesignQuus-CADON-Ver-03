'use client';

import React from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Search, 
  ArrowRight, 
  Boxes,
  FileCheck
} from 'lucide-react';

export interface PreflightInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  unreviewedItems: Array<{ id: string; name: string; count?: number; spec?: string }>;
  reviewedCount: number;
  totalCount: number;
  onFocusItem: (name: string) => void;
  onStartFixing: () => void;
  onConfirmProceed: () => void;
}

export default function PreflightInspectionModal({
  isOpen,
  onClose,
  unreviewedItems = [],
  reviewedCount = 0,
  totalCount = 0,
  onFocusItem,
  onStartFixing,
  onConfirmProceed
}: PreflightInspectionModalProps) {
  if (!isOpen) return null;

  const isAllClear = unreviewedItems.length === 0 && totalCount > 0;
  const progressPercent = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isAllClear ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-rose-950/40 border-rose-500/30'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
              isAllClear ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-600/20 text-rose-400 border border-rose-500/40'
            }`}>
              {isAllClear ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isAllClear ? '견적 사전 검사: 검토 완료 (All Clear)' : '견적 사전 검사: 누락 주의 경고'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAllClear ? '모든 도면 부품의 검토가 100% 완료되었습니다.' : `확인되지 않은 미검토 도면 부품이 ${unreviewedItems.length}건 남아 있습니다.`}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Progress Status Bar */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-300">검토 진척률</span>
              <span className="font-mono font-bold text-teal-300">{progressPercent}% ({reviewedCount}/{totalCount} EA)</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${isAllClear ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Detailed Message or List */}
          {isAllClear ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                <FileCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">휴먼 에러 위험 0건</h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                도면 내 모든 블록과 형상이 견적 레이어에 완벽히 반영되었습니다. 안심하고 견적서를 생성 및 제출하셔도 좋습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>미검토 누락 후보 부품 ({unreviewedItems.length}건):</span>
                <span className="text-[10px] text-slate-500">클릭 시 해당 부품으로 이동</span>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 bg-slate-950/70 rounded-xl border border-slate-800">
                {unreviewedItems.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onFocusItem(item.name);
                      onClose();
                    }}
                    className="p-2 bg-slate-900/80 hover:bg-slate-850 rounded-lg border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-mono text-xs font-bold text-slate-200 truncate group-hover:text-teal-300 transition-colors">
                        {item.name}
                      </span>
                      {item.count && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          x{item.count}EA
                        </span>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
          {isAllClear ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onConfirmProceed();
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center space-x-1.5"
              >
                <FileCheck className="w-4 h-4" />
                <span>최종 견적서 발행하기</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartFixing();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center space-x-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>X-Ray 켜고 누락 부품 바로 검토</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('미검토 부품이 남아 있습니다. 무시하고 계속 진행하시겠습니까?')) {
                    onClose();
                    onConfirmProceed();
                  }
                }}
                className="px-3 py-2 text-slate-400 hover:text-slate-200 text-xs font-medium"
              >
                경고 무시하고 진행
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
