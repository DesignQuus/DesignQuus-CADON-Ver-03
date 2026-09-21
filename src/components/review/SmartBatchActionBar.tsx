'use client';

import React from 'react';
import { Sparkles, Wrench, Package, CheckCheck, AlertCircle, ShieldCheck } from 'lucide-react';
import { QuoteReviewLine, InclusionType } from './QuoteLineGrid';

interface SmartBatchActionBarProps {
  lines: QuoteReviewLine[];
  onBatchFastenerExclude: (lineIds: string[]) => void;
  onBatchMasterConfirm: (items: Array<{ id: string; price: number; cost: number; similarity: any }>) => void;
  onBatchSupplyConvert: (lineIds: string[]) => void;
  onBatchZeroExclude: (lineIds: string[]) => void;
  loadingMaster?: boolean;
}

export default function SmartBatchActionBar({
  lines,
  onBatchFastenerExclude,
  onBatchMasterConfirm,
  onBatchSupplyConvert,
  onBatchZeroExclude,
  loadingMaster = false
}: SmartBatchActionBarProps) {
  // 1. 표준 체결구(볼트/너트/와셔 등) 감지
  const fastenerCandidates = lines.filter((l) => {
    if (l.isAssembly) return false;
    if (l.inclusionType && l.inclusionType !== 'INCLUDED') return false;
    const nameLower = (l.partName || '').toLowerCase();
    const specLower = (l.specification || '').toLowerCase();
    const isFastener =
      l.partType === 'COMMERCIAL' ||
      nameLower.includes('볼트') || nameLower.includes('너트') || nameLower.includes('와셔') ||
      nameLower.includes('bolt') || nameLower.includes('nut') || nameLower.includes('washer') ||
      specLower.includes('bolt') || specLower.includes('nut') || specLower.includes('washer') ||
      specLower.includes('pin') || specLower.includes('o-ring');
    return isFastener && (l.supplyPrice === 0 || l.status !== 'CONFIRMED');
  });

  // 2. 고신뢰(90% 이상) 마스터 매칭 미확정 품목 감지
  const highConfidenceMasterCandidates = lines.filter((l) => {
    if (l.isAssembly) return false;
    if (l.inclusionType && l.inclusionType !== 'INCLUDED') return false;
    const score = l.similarityBreakdown?.totalScore || 0;
    const matchedPrc = l.similarityBreakdown?.matchedUnitPrice || l.masterPrice || 0;
    return score >= 90 && matchedPrc > 0 && (l.status !== 'CONFIRMED' || l.supplyPrice === 0);
  });

  // 3. 잔여 0원(단가 미확보) 품목 감지 (체결구 제외)
  const remainingZeroCandidates = lines.filter((l) => {
    if (l.isAssembly) return false;
    if (l.inclusionType && l.inclusionType !== 'INCLUDED') return false;
    const isFastener = fastenerCandidates.some((fc) => fc.id === l.id);
    return !isFastener && l.supplyPrice <= 0;
  });

  const totalActionable =
    fastenerCandidates.length + highConfidenceMasterCandidates.length + remainingZeroCandidates.length;

  // 액션 가능한 항목이 전혀 없으면 스마트 배너 숨김
  if (totalActionable === 0) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 flex items-center justify-between text-xs text-emerald-800 shrink-0">
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>지능형 사전 검토 완료: 모든 품목의 단가 확정 또는 사급/제외 처리가 정상 반영되었습니다.</span>
        </div>
        <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
          결재 상신 준비 완료
        </span>
      </div>
    );
  }

  return (
    <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-indigo-800/50 px-5 py-2.5 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
      {/* 좌측: AI 분석 상태 요약 */}
      <div className="flex items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 font-bold">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>AI 지능형 대량 처리기</span>
        </div>
        <span className="text-slate-300 font-medium">
          도면 분석 결과 <strong className="text-amber-300 font-mono">{totalActionable}건</strong>의 빠른 일괄 액션이 권장됩니다:
        </span>
      </div>

      {/* 우측: 3가지 원클릭 일괄 액션 칩 */}
      <div className="flex items-center gap-2 text-xs">
        {/* 1. 표준 체결구 일괄 제외 버튼 */}
        {fastenerCandidates.length > 0 && (
          <button
            onClick={() => onBatchFastenerExclude(fastenerCandidates.map((f) => f.id))}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 shadow-sm border border-indigo-400/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
            title="볼트, 너트, 와셔 등 기성 체결구를 견적 대상에서 일괄 제외(0원 정상) 처리합니다."
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-300" />
            <span>🔩 표준 체결구 {fastenerCandidates.length}건 일괄 제외</span>
          </button>
        )}

        {/* 2. 고신뢰 마스터 일괄 확정 버튼 */}
        {highConfidenceMasterCandidates.length > 0 && (
          <button
            onClick={() =>
              onBatchMasterConfirm(
                highConfidenceMasterCandidates.map((h) => ({
                  id: h.id,
                  price: h.similarityBreakdown?.matchedUnitPrice || h.masterPrice || 0,
                  cost: Math.round((h.similarityBreakdown?.matchedUnitPrice || h.masterPrice || 0) * 0.82),
                  similarity: h.similarityBreakdown
                }))
              )
            }
            disabled={loadingMaster}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm border border-emerald-400/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
            title="마스터 기준단가 일치율이 90% 이상인 품목의 공급단가를 즉시 확정합니다."
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
            <span>⭐ 마스터(90%↑) {highConfidenceMasterCandidates.length}건 일괄 확정</span>
          </button>
        )}

        {/* 3. 잔여 0원 품목 일괄 사급품 지정 버튼 */}
        {remainingZeroCandidates.length > 0 && (
          <button
            onClick={() => onBatchSupplyConvert(remainingZeroCandidates.map((r) => r.id))}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 shadow-sm border border-amber-400/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
            title="단가가 미확보된 신규 품목들을 고객사 제공 '사급품(단가 0원 정상)'으로 일괄 지정합니다."
          >
            <Package className="w-3.5 h-3.5 text-amber-200" />
            <span>📦 잔여 0원 {remainingZeroCandidates.length}건 사급품 지정</span>
          </button>
        )}
      </div>
    </div>
  );
}
