'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Database,
  Sparkles,
  Calculator,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Percent,
  CheckSquare,
  Square
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { QuoteReviewLine } from './QuoteLineGrid';
import {
  PART_CATEGORIES,
  getPartCategoryBadgeClass,
  getPartCategoryLabel
} from '@/lib/part-categories';

interface BatchMasterItemState {
  id: string;
  partNo: string;
  partName: string;
  partType: string;
  material: string;
  specification: string;
  unitCost: number;
  supplyPrice: number;
  selected: boolean;
  isExistingMaster?: boolean;
}

interface BatchMasterRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  selectedLines: QuoteReviewLine[];
  onSuccess: (updatedItems: { id: string; supplyPrice: number; unitCost: number; partNo: string; partName: string }[]) => void;
}

export default function BatchMasterRegisterModal({
  isOpen,
  onClose,
  caseId,
  selectedLines,
  onSuccess
}: BatchMasterRegisterModalProps) {
  const [items, setItems] = useState<BatchMasterItemState[]>([]);
  const [targetMargin, setTargetMargin] = useState<number>(15);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setItems(
        selectedLines.map((line) => {
          let initialPrice = line.supplyPrice;
          const cost = line.unitCost || 0;

          // 단가가 0원이면서 원가가 있는 경우, 기본 사내 표준 마진(15%) 적용 단가로 제안
          if (initialPrice <= 0 && cost > 0) {
            initialPrice = Math.round((cost / (1 - 0.15)) / 100) * 100;
          }

          return {
            id: line.id,
            partNo: line.partNo || '',
            partName: line.partName || '',
            partType: line.partType || 'MACHINING',
            material: line.material || 'SS400',
            specification: line.specification || '',
            unitCost: cost,
            supplyPrice: initialPrice,
            selected: true,
            isExistingMaster: line.priceSource === 'MASTER_MATCH'
          };
        })
      );
    }
  }, [isOpen, selectedLines]);

  if (!isOpen) return null;

  // 전체 선택 / 해제
  const allSelected = items.length > 0 && items.every((it) => it.selected);
  const toggleSelectAll = () => {
    const nextVal = !allSelected;
    setItems((prev) => prev.map((it) => ({ ...it, selected: nextVal })));
  };

  // 단일 선택 토글
  const toggleSelectItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
    );
  };

  // 개별 품목 공급단가 직접 수동 변경
  const handlePriceChange = (id: string, newPriceStr: string) => {
    const val = parseInt(newPriceStr.replace(/[^0-9]/g, ''), 10) || 0;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, supplyPrice: val } : it))
    );
  };

  // 개별 품목 부품 유형 변경
  const handleUpdateItemPartType = (id: string, newType: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, partType: newType } : it))
    );
  };

  // 📐 사내 단가 적용 기준: 목표 마진율 기반 일괄 단가 계산
  // 공식: 공급단가 = round(산출원가 / (1 - 마진율%) / 100) * 100 (100원 단위 절사/반올림)
  const applyMarginRate = (marginPct: number) => {
    setTargetMargin(marginPct);
    setItems((prev) =>
      prev.map((it) => {
        if (!it.selected) return it;
        if (it.unitCost <= 0) return it; // 원가가 없으면 기존 수기 단가 보존
        const calculatedPrice = Math.round((it.unitCost / (1 - marginPct / 100)) / 100) * 100;
        return {
          ...it,
          supplyPrice: calculatedPrice
        };
      })
    );
  };

  // 통계 계산
  const selectedItems = items.filter((it) => it.selected);
  const totalCost = selectedItems.reduce((acc, it) => acc + it.unitCost, 0);
  const totalSupply = selectedItems.reduce((acc, it) => acc + it.supplyPrice, 0);
  const avgMarginRate =
    totalSupply > 0 && totalCost > 0
      ? (((totalSupply - totalCost) / totalSupply) * 100).toFixed(1)
      : '0.0';

  // 일괄 마스터 등록 및 현재 견적 확정 동기화 제출
  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setErrorMessage('등록할 품목을 1개 이상 선택해 주세요.');
      return;
    }

    const invalidItems = selectedItems.filter((it) => it.supplyPrice <= 0);
    if (invalidItems.length > 0) {
      setErrorMessage(
        `공급단가가 0원인 품목이 ${invalidItems.length}건 있습니다. 단가를 직접 입력하거나 사내 마진율 프리셋을 적용해 주세요.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. 사내 마스터 DB 일괄 등록 API 호출
      const payload = {
        items: selectedItems.map((it) => ({
          partNo: it.partNo,
          partName: it.partName,
          partType: it.partType,
          material: it.material,
          specification: it.specification,
          unitPrice: it.supplyPrice,
          unitCost: it.unitCost,
          remark: `사내 단가 기준 일괄 마스터 등록 (마진율 ${
            it.unitCost > 0
              ? (((it.supplyPrice - it.unitCost) / it.supplyPrice) * 100).toFixed(1)
              : 0
          }%)`
        }))
      };

      const res = await apiFetch(`/api/quotes/${caseId}/save-to-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '사내 마스터 등록 처리 중 오류가 발생했습니다.');
      }

      // 2. 현재 견적 케이스의 해당 라인들을 CONFIRMED 상태 및 새 단가로 일괄 동기화
      await Promise.all(
        selectedItems.map((it) =>
          apiFetch(`/api/quotes/${caseId}/confirm-line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lineId: it.id,
              isConfirmed: true,
              unitPrice: it.supplyPrice,
              unitCost: it.unitCost,
              remark: '[MASTER_REGISTERED]'
            })
          }).catch((err) => console.warn('Line sync warning:', err))
        )
      );

      // 3. 부모 컴포넌트에 통보하여 로컬 상태 즉시 갱신
      onSuccess(
        selectedItems.map((it) => ({
          id: it.id,
          supplyPrice: it.supplyPrice,
          unitCost: it.unitCost,
          partNo: it.partNo,
          partName: it.partName
        }))
      );

      onClose();
    } catch (e: any) {
      console.error('Batch master register failed:', e);
      setErrorMessage(e.message || '사내 마스터 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-2xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  {selectedLines.length > 1 ? '사내 마스터 DB 일괄 등록 및 기준 단가 설정' : '사내 마스터 DB 등록 및 기준 단가 설정'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  선택 {selectedLines.length}건
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedLines.length > 1
                  ? '선택한 품목들의 견적 단가를 사내 마스터 DB 및 기준 단가표에 일괄 적재하고, 현재 견적 라인에 즉시 확정 반영합니다.'
                  : '본 품목의 견적 단가를 사내 마스터 DB 및 기준 단가표에 적재하고, 현재 견적 라인에 즉시 확정 반영합니다.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 📐 사내 단가 적용 기준 툴바 (목표 마진율 프리셋 & 단가 자동 산출) */}
        <div className="px-6 py-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              사내 단가 적용 기준:
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { label: '10% (대량/할인)', rate: 10 },
                { label: '15% (사내 표준)', rate: 15, default: true },
                { label: '20% (정밀 가공)', rate: 20 },
                { label: '25% (소량 시제품)', rate: 25 }
              ].map((preset) => (
                <button
                  key={preset.rate}
                  type="button"
                  onClick={() => applyMarginRate(preset.rate)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    targetMargin === preset.rate
                      ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                      : 'bg-white hover:bg-blue-100/70 text-slate-700 border border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* 사용자 직접 % 입력 */}
            <div className="flex items-center gap-1 ml-1 bg-white px-2 py-0.5 rounded-lg border border-slate-300">
              <span className="text-[11px] text-slate-500 font-medium">직접입력:</span>
              <input
                type="number"
                min={0}
                max={99}
                value={targetMargin}
                onChange={(e) => setTargetMargin(Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)))}
                className="w-12 text-xs font-bold text-blue-700 text-center outline-none bg-transparent"
              />
              <span className="text-xs text-slate-500 font-bold">%</span>
              <button
                type="button"
                onClick={() => applyMarginRate(targetMargin)}
                className="ml-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200 cursor-pointer"
              >
                적용
              </button>
            </div>
          </div>

          {/* 산출 공식 및 실시간 요약 배지 */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 text-[11px] hidden lg:inline">
              공식: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">원가 ÷ (1 - 마진율)</code> (100원 단위 반올림)
            </span>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-slate-500 text-[11px]">
                평균 마진: <strong className="text-blue-700 font-bold">{avgMarginRate}%</strong>
              </div>
              <div className="w-px h-3 bg-slate-300" />
              <div className="text-slate-500 text-[11px]">
                공급가 합계: <strong className="text-slate-800 font-bold">{totalSupply.toLocaleString()}원</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 에러 메시지 알림 바 */}
        {errorMessage && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 품목 목록 그리드 (직접 단가 수정 가능) */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 select-none">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-500 hover:text-slate-800 transition-colors"
                      title={allSelected ? '전체 선택 해제' : '전체 선택'}
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 w-28">도번</th>
                  <th className="py-2.5 px-3">품명</th>
                  <th className="py-2.5 px-2.5 w-24 text-center">부품유형</th>
                  <th className="py-2.5 px-2.5 w-20">재질</th>
                  <th className="py-2.5 px-2.5 w-24">규격</th>
                  <th className="py-2.5 px-3 w-24 text-right">산출원가</th>
                  <th className="py-2.5 px-3 w-36 text-right text-blue-700 font-bold">
                    공급단가 (수정가능)
                  </th>
                  <th className="py-2.5 px-3 w-20 text-center">마진율</th>
                  <th className="py-2.5 px-3 w-24 text-center">마스터 현황</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <AlertCircle className="w-8 h-8 text-amber-500/80" />
                        <p className="text-xs font-bold text-slate-700">
                          등록 대상 견적 품목이 선택되지 않았습니다.
                        </p>
                        <p className="text-[11px] text-slate-400 max-w-md">
                          견적 검토 테이블에서 마스터 DB에 등록할 품목을 체크하시거나, 부품 행의 [⭐ 마스터 등록] 버튼을 클릭해 주세요.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((row, idx) => {
                    const marginPct =
                      row.supplyPrice > 0 && row.unitCost > 0
                        ? (((row.supplyPrice - row.unitCost) / row.supplyPrice) * 100).toFixed(1)
                        : '0.0';
                    const marginNum = parseFloat(marginPct);

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          !row.selected ? 'opacity-40 bg-slate-50/50' : ''
                        }`}
                      >
                        {/* 체크박스 */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectItem(row.id)}
                            className="text-slate-500 hover:text-blue-600 transition-colors"
                          >
                            {row.selected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* 도번 */}
                        <td className="py-2.5 px-3 font-semibold text-slate-800 font-mono text-[11.5px] truncate max-w-[120px]">
                          {row.partNo || '-'}
                        </td>

                        {/* 품명 */}
                        <td className="py-2.5 px-3 font-medium text-slate-900 truncate max-w-[160px]">
                          {row.partName}
                        </td>

                        {/* 부품유형 (10대 제조 분류) */}
                        <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={row.partType || 'MACHINING'}
                            onChange={(e) => handleUpdateItemPartType(row.id, e.target.value)}
                            disabled={!row.selected}
                            className={`appearance-none px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer border outline-none shadow-2xs ${getPartCategoryBadgeClass(row.partType)}`}
                            title="부품 유형 변경"
                          >
                            {PART_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id} className="bg-white text-slate-800 font-medium">
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 재질 */}
                        <td className="py-2.5 px-2.5 text-slate-600 font-mono text-[11px] truncate">
                          {row.material || '-'}
                        </td>

                        {/* 규격 */}
                        <td className="py-2.5 px-2.5 text-slate-500 font-mono text-[11px] truncate">
                          {row.specification || '-'}
                        </td>

                      {/* 산출원가 */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {row.unitCost > 0 ? `${row.unitCost.toLocaleString()}원` : '-'}
                      </td>

                      {/* 공급단가 (직접 수동 입력) */}
                      <td className="py-2 px-3 text-right">
                        <div className="relative inline-flex items-center">
                          <input
                            type="text"
                            value={row.supplyPrice > 0 ? row.supplyPrice.toLocaleString() : ''}
                            placeholder="0"
                            disabled={!row.selected}
                            onChange={(e) => handlePriceChange(row.id, e.target.value)}
                            className="w-32 px-2.5 py-1 text-right font-mono text-xs font-bold text-blue-700 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          <span className="ml-1 text-[11px] text-slate-400 font-medium">원</span>
                        </div>
                      </td>

                      {/* 마진율 */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] ${
                            marginNum < 10
                              ? 'bg-rose-100 text-rose-700'
                              : marginNum < 18
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {marginPct}%
                        </span>
                      </td>

                      {/* 마스터 현황 */}
                      <td className="py-2.5 px-3 text-center">
                        {row.isExistingMaster ? (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            ★ 마스터 갱신
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            + 신규 등록
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
          </div>
        </div>

        {/* 푸터 액션 바 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2 flex-1 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[11.5px] truncate" title="등록 시 product_masters, price_masters, manual_price_pool에 즉시 영구 적재되어 향후 동일/유사 부품 분석 시 100% 자동 매칭됩니다.">
              등록 시 <strong>product_masters</strong>, <strong>price_masters</strong>에 즉시 영구 적재되어 자동 매칭됩니다.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedItems.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>사내 마스터 DB 일괄 등록 중...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>{selectedItems.length > 1 ? `선택 ${selectedItems.length}건 마스터 DB 일괄 등록 및 견적 반영` : '마스터 DB 등록 및 견적 반영'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
