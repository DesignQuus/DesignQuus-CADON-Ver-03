'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, FileSpreadsheet, CheckCircle2, ArrowRight, X, Info } from 'lucide-react';
import Link from 'next/link';

interface PilotWelcomeModalProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export default function PilotWelcomeModal({
  isOpen: externalIsOpen,
  onOpenChange,
  onClose,
}: PilotWelcomeModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;

  // 1. 초기 마운트 시 localStorage 확인 후 자동 팝업
  useEffect(() => {
    try {
      const isHidden = localStorage.getItem('cadon_hide_pilot_welcome') === 'true';
      if (!isHidden) {
        setInternalIsOpen(true);
      }
    } catch {}
  }, []);

  // 2. 모달이 열릴 때 localStorage의 현재 '다시 보지 않기' 상태와 체크박스 동기화
  useEffect(() => {
    if (isOpen) {
      try {
        const isHidden = localStorage.getItem('cadon_hide_pilot_welcome') === 'true';
        setDontShowAgain(isHidden);
      } catch {}
    }
  }, [isOpen]);

  const handleClose = () => {
    try {
      if (dontShowAgain) {
        localStorage.setItem('cadon_hide_pilot_welcome', 'true');
      } else {
        localStorage.removeItem('cadon_hide_pilot_welcome');
      }
    } catch {}

    if (isControlled && onOpenChange) {
      onOpenChange(false);
    } else {
      setInternalIsOpen(false);
    }
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-slate-800">
        {/* 모달 상단 배너 */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">견적 검토 워크스페이스 안내</h3>
              <p className="text-xs text-blue-100 mt-0.5">평소 업무 방식 그대로 편안하게 견적해 주세요</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 안내 카드 3종 */}
        <div className="p-6 space-y-4 text-xs leading-relaxed">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block text-[13px] mb-0.5">
                1. 일부 품목은 엔진 계산값([참고])이 제안되어 있습니다
              </span>
              <span className="text-slate-600">
                사내 기준정보(마스터 단가)가 아직 등록되지 않은 부품은 도면 기하와 표준 재료비를 바탕으로 산출된 계산값이 제안됩니다.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block text-[13px] mb-0.5">
                2. 현업 관행과 거래처 단가에 맞춰 자유롭게 수정해 주세요
              </span>
              <span className="text-slate-600">
                제안값은 참고용일 뿐입니다. 평소 적용하시던 가공 단가와 거래처 납품가에 맞춰 단가를 자유롭게 입력·확정하시면 됩니다.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block text-[13px] mb-0.5">
                3. 확정하신 단가는 다음 도면에 자동으로 1순위 적용됩니다
              </span>
              <span className="text-slate-600">
                담당자께서 한 번 확정하신 단가는 사내 단가 지식풀에 안전하게 축적되어, 다음 유사 도면 견적 시 우선순위 1순위로 자동 추천됩니다.
              </span>
            </div>
          </div>

          {/* 엑셀 일괄 업로드 바로가기 배너 */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <span className="font-bold text-amber-950 block text-[12.5px]">기존 사내 단가표 엑셀이 있으신가요?</span>
                <span className="text-amber-800 text-[11px]">기준정보 관리에서 엑셀을 업로드하면 마스터 단가가 즉시 연동됩니다.</span>
              </div>
            </div>
            <Link
              href="/admin/masters"
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 font-bold rounded-lg border border-amber-300 text-xs flex items-center gap-1 shrink-0 transition-all shadow-2xs"
            >
              <span>업로드 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 하단 컨트롤 바 */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 hover:text-slate-900 select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span className="font-medium">다시 보지 않기</span>
            <span className="text-[11px] text-slate-500 font-normal">
              {dontShowAgain ? '(체크 해제 후 닫으면 다음 방문 시 자동 표시)' : '(체크 시 다음 방문부터 자동 표시 안 함)'}
            </span>
          </label>

          <button
            onClick={handleClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
          >
            견적 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
