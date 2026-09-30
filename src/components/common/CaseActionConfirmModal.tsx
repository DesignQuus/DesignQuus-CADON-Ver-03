'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, RotateCcw, CheckCircle2, Archive } from 'lucide-react';

export const SKIP_CASE_TRASH_CONFIRM_KEY = 'cadon_skip_case_trash_confirm';

export type CaseActionType = 'TRASH' | 'PERMANENT_DELETE' | 'ARCHIVE';

interface CaseActionConfirmModalProps {
  isOpen: boolean;
  actionType: CaseActionType;
  itemCount: number;
  caseTitle?: string;
  onClose: () => void;
  onConfirm: (skipNextTime: boolean) => Promise<void> | void;
  isLoading?: boolean;
}

/**
 * 견적의뢰 대장 전용 화면 정중앙 확인 모달
 */
export function CaseActionConfirmModal({
  isOpen,
  actionType,
  itemCount,
  caseTitle,
  onClose,
  onConfirm,
  isLoading = false,
}: CaseActionConfirmModalProps) {
  const [skipNextTime, setSkipNextTime] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSkipNextTime(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isPermanent = actionType === 'PERMANENT_DELETE';
  const isTrash = actionType === 'TRASH';

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-[120] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-action-title"
      >
        {/* 우측 상단 닫기 버튼 */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition disabled:opacity-40 cursor-pointer"
          title="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 상단 경고/안내 헤더 */}
        <div className="flex items-start space-x-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isPermanent
                ? 'bg-rose-100 text-rose-600 border-rose-200'
                : isTrash
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}
          >
            {isPermanent ? (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            ) : isTrash ? (
              <Trash2 className="w-5 h-5 text-amber-600" />
            ) : (
              <Archive className="w-5 h-5 text-blue-600" />
            )}
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h3 id="case-action-title" className="text-base font-bold text-slate-900">
              {isPermanent ? '견적 건 영구 삭제 확인' : isTrash ? '휴지통 이동 확인' : '보관함 이동 확인'}
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {caseTitle ? (
                <>
                  <span className="font-semibold text-slate-900">[{caseTitle}]</span> 외 {itemCount}건의 견적 건을{' '}
                </>
              ) : (
                <>선택한 <span className="font-bold text-slate-900">{itemCount}건</span>의 견적 건을 </>
              )}
              {isPermanent ? (
                <span className="font-bold text-rose-600">완전 영구 삭제하시겠습니까?</span>
              ) : (
                <span className="font-bold text-amber-700">휴지통으로 이동하시겠습니까?</span>
              )}
            </p>
            <p className="text-[11px] mt-1.5 leading-normal">
              {isPermanent ? (
                <span className="text-rose-600 font-semibold">
                  ⚠️ 모든 도면 파일 및 산출된 BOM 데이터가 복구 불가능하게 삭제됩니다.
                </span>
              ) : (
                <span className="text-slate-500 font-medium">
                  ✓ 30일간 휴지통에 보관 후 자동 삭제되며, 언제든 원래대로 복원할 수 있습니다.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 휴지통 이동 시에만 '다음부터는 확인 없이 이동' 체크박스 노출 (영구 삭제는 안전을 위해 항상 확인) */}
        {isTrash && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <label className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 cursor-pointer select-none hover:bg-slate-100/80 transition">
              <input
                type="checkbox"
                checked={skipNextTime}
                onChange={(e) => setSkipNextTime(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800">다음부터는 확인 없이 즉시 휴지통으로 이동</span>
                <span className="text-slate-500 text-[11px] block mt-0.5">
                  (체크 시 빠른 이동 모드가 적용되며, 알림창에서 언제든 다시 켤 수 있습니다)
                </span>
              </div>
            </label>
          </div>
        )}

        {/* 하단 액션 버튼 */}
        <div className="mt-5 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(skipNextTime)}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 ${
              isPermanent
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {isLoading ? (
              <span>처리 중...</span>
            ) : (
              <>
                {isPermanent ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isPermanent ? '영구 삭제' : '휴지통 이동'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
