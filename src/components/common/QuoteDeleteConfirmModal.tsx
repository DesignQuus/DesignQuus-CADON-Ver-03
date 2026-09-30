'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, RotateCcw, CheckCircle2 } from 'lucide-react';

export const SKIP_CONFIRM_KEY = 'cadon_skip_quote_delete_confirm';

interface QuoteDeleteConfirmModalProps {
  isOpen: boolean;
  quoteNo: string;
  onClose: () => void;
  onConfirm: (skipNextTime: boolean) => Promise<void> | void;
  isDeleting?: boolean;
}

export function QuoteDeleteConfirmModal({
  isOpen,
  quoteNo,
  onClose,
  onConfirm,
  isDeleting = false,
}: QuoteDeleteConfirmModalProps) {
  const [skipNextTime, setSkipNextTime] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSkipNextTime(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        {/* 우측 닫기 버튼 */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
          title="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 상단 경고 아이콘 */}
        <div className="flex items-start space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
              견적서 삭제 확인
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              견적서 <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">[{quoteNo}]</span>을(를) 정말 삭제하시겠습니까?
            </p>
            <p className="text-xs text-rose-600 font-medium mt-1">
              ⚠️ 삭제된 견적서는 복구할 수 없습니다.
            </p>
          </div>
        </div>

        {/* '다음부터는 확인 없이 삭제' 체크박스 */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <label className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 cursor-pointer select-none hover:bg-slate-100/80 transition">
            <input
              type="checkbox"
              checked={skipNextTime}
              onChange={(e) => setSkipNextTime(e.target.checked)}
              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-800">다음부터는 확인 없이 즉시 삭제</span>
              <span className="text-slate-500 text-[11px] block mt-0.5">
                (체크 시 빠른 삭제 모드가 적용되며, 알림창에서 언제든 다시 켤 수 있습니다)
              </span>
            </div>
          </label>
        </div>

        {/* 하단 버튼 */}
        <div className="mt-5 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(skipNextTime)}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
          >
            {isDeleting ? (
              <span>삭제 중...</span>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제 확인</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 💡 방법 A: 삭제 후 플로팅 토스트 알림 컴포넌트
 * 확인 없이 즉시 삭제되었을 때 우측 상단에 뜨며, [확인창 다시 켜기] 버튼을 통해 1클릭 복원 제공
 */
interface DeleteToastProps {
  message: {
    text: string;
    showRestoreConfirm?: boolean;
    isError?: boolean;
  } | null;
  onClose: () => void;
  onRestoreConfirmDialog: () => void;
}

export function QuoteDeleteToast({
  message,
  onClose,
  onRestoreConfirmDialog,
}: DeleteToastProps) {
  const [isPaused, setIsPaused] = useState(false);

  // 3.5초 후 자동 닫힘 타이머 (호버 시 일시 정지)
  useEffect(() => {
    if (!message || isPaused) return;

    // 에러 메시지는 4.5초, 일반 성공 알림은 3.5초 후 자동 소멸
    const duration = message.isError ? 4500 : 3500;
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, isPaused, onClose]);

  if (!message) return null;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="status"
      aria-live="polite"
      className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[130] w-auto max-w-xl min-w-[360px] text-white px-6 py-4 rounded-2xl shadow-2xl border flex items-center justify-between space-x-4 text-xs backdrop-blur-md transition-all animate-in zoom-in-95 fade-in duration-150 ${
        message.isError
          ? 'bg-rose-950/95 border-rose-700/80 text-rose-100 shadow-rose-950/50 ring-1 ring-rose-500/30'
          : 'bg-slate-900/95 border-slate-700/90 shadow-slate-950/60 ring-1 ring-white/10'
      }`}
    >
      <div className="flex items-center space-x-3 min-w-0 pr-2">
        {message.isError ? (
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        ) : message.showRestoreConfirm ? (
          <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
        <span className="font-medium leading-snug whitespace-normal">{message.text}</span>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {message.showRestoreConfirm && (
          <button
            type="button"
            onClick={onRestoreConfirmDialog}
            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition shadow-xs cursor-pointer"
            title="다음 삭제 시 다시 확인창이 나타나도록 설정을 복원합니다"
          >
            <RotateCcw className="w-3 h-3" />
            <span>확인창 다시 켜기</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
