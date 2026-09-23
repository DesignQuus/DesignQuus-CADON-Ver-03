'use client';

import React, { useState } from 'react';
import { Coins, AlertTriangle, Layers, Calculator, Database, Save, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { QuoteReviewLine } from './QuoteLineGrid';
import { apiFetch } from '@/lib/api';
import { stringifyRemark } from '@/lib/remark-cost-helper';

interface CostBreakdownPanelProps {
  line: QuoteReviewLine | null;
  caseId?: string;
  topMasterPrice?: number;
  onUpdateLine: (updated: Partial<QuoteReviewLine>) => void;
  onConfirmLine?: (lineId: string) => Promise<void>;
  onAddNoiseBlacklist?: (keyword: string) => void;
  onCalculateSingleEngineering?: (lineId: string) => Promise<void>;
  isCalculatingSingle?: boolean;
}

export default function CostBreakdownPanel({
  line,
  caseId,
  topMasterPrice,
  onUpdateLine,
  onConfirmLine,
  onAddNoiseBlacklist,
  onCalculateSingleEngineering,
  isCalculatingSingle
}: CostBreakdownPanelProps) {
  const [savingMaster, setSavingMaster] = useState(false);
  const [masterSaved, setMasterSaved] = useState(false);

  if (!line) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
        상단 목록에서 행을 선택하면 상세 원가 산출 내역이 표시됩니다.
      </div>
    );
  }

  // 🚀 사급품 또는 견적 제외(조립도, 체결구, 수동제외) 품목에 대한 전용 가이드 뷰 제공
  const incType = line.inclusionType || (line.isAssembly ? 'EXCLUDED' : line.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');

  if (line.isAssembly || incType !== 'INCLUDED') {
    const isSupplied = incType === 'CUSTOMER_SUPPLIED';
    const isFastener = incType === 'FASTENER_EXCLUDED';
    const isNoise = incType === 'ANNOTATION_NOISE';

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm h-full flex flex-col justify-between text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
              line.isAssembly ? 'bg-purple-100 text-purple-700 border-purple-200' :
              isNoise ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse' :
              isSupplied ? 'bg-cyan-100 text-cyan-800 border-cyan-300' :
              isFastener ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
              'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
              {line.isAssembly ? '조립도 자동 제외' :
               isNoise ? '🧹 도면 주석/표제란 노이즈 격리' :
               isSupplied ? '📦 고객 사급품 (단가 0원 정상)' :
               isFastener ? '🔩 표준 체결구 제외' : '🚫 견적 제외'}
            </span>
            <span className="font-bold text-slate-800 text-xs truncate max-w-[200px]">
              [No.{line.itemNo}] {line.partName} <span className="font-mono text-slate-500 font-normal">({line.partNo})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
              수량 {line.quantity} EA
            </span>
            {isNoise && onAddNoiseBlacklist && (
              <button
                onClick={() => onAddNoiseBlacklist(line.partName || line.partNo)}
                className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="이 키워드를 사내 노이즈 사전 DB에 영구 등록하여 다음 파싱부터 자동 제외합니다"
              >
                <span>⭐ 사내 노이즈 학습</span>
              </button>
            )}
            {!line.isAssembly && (
              <button
                onClick={() => onUpdateLine({ inclusionType: 'INCLUDED', isIncluded: true })}
                className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10.5px] transition-colors cursor-pointer"
              >
                견적 포함으로 복원
              </button>
            )}
          </div>
        </div>

        <div className="my-auto text-center py-5 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 space-y-2">
          <div className="text-2xl">
            {line.isAssembly ? '📦' : isNoise ? '🧹' : isSupplied ? '🤝' : isFastener ? '🔩' : '🚫'}
          </div>
          <p className="font-bold text-slate-800 text-xs">
            {line.isAssembly ? '해당 도면은 완제품/모듈 단위 조립도(Assembly)입니다.' :
             isNoise ? '도면 표제란, 도면 주기(Note), 또는 깨진 텍스트로 판정된 [노이즈 격리] 항목입니다.' :
             isSupplied ? '본 품목은 고객사에서 무상 지급하는 [사급품]입니다.' :
             isFastener ? '본 품목은 볼트/너트/와셔 등 [표준 체결구]로 견적 대상에서 제외되었습니다.' :
             '본 품목은 담당자에 의해 [견적 제외] 처리되었습니다.'}
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-md mx-auto">
            {line.isAssembly ? '조립도는 하위 단품 가공품들이 조립된 최종 도면이므로 중복 견적 방지를 위해 가공비가 자동 0원(배제) 처리됩니다.' :
             isNoise ? (line.excludeReason ? `격리 사유: ${line.excludeReason}. 실제 가공 부품이 아니므로 견적 대상에서 안전하게 격리되어 결재 상신을 방해하지 않습니다.` : '도면 텍스트 노이즈로 분류되어 견적 대상에서 안전하게 격리되었습니다.') :
             isSupplied ? '사급품은 고객사가 직접 제공하므로 자사 가공비 및 공급단가가 0원으로 정상 처리되며, 결재 상신이 허용됩니다.' :
             isFastener ? '기성 규격 체결구는 별도 견적 항목에서 제외 처리되어 공급단가 0원으로 정상 반영됩니다.' :
             '견적 대상에서 제외된 품목은 결재 상신 및 총액 계산에서 제외됩니다. 필요시 우측 상단 복원 버튼을 클릭하세요.'}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-400 text-[11px]">
          <span>상태: {isNoise ? '🧹 도면 노이즈 격리 완료 (0원 정상 허용)' : isSupplied ? '사급품 등록 완료 (0원 정상)' : '견적 제외 완료'}</span>
          <span>부품유형: {line.partType}</span>
        </div>
      </div>
    );
  }

  const marginRate = line.supplyPrice > 0 && line.unitCost > 0
    ? Math.round(((line.supplyPrice - line.unitCost) / line.supplyPrice) * 1000) / 10
    : 0;

  const isMarginWarning = marginRate < 12.0;

  // 💡 사내 마스터 표준 단가 대조 상태 계산 (개선안 1, 3, 4 통합)
  const isPriceMasterMatched = !!(topMasterPrice && topMasterPrice > 0 && line.supplyPrice === topMasterPrice);
  const isPriceMasterDiff = !!(topMasterPrice && topMasterPrice > 0 && line.supplyPrice !== topMasterPrice);
  const priceDiff = topMasterPrice ? line.supplyPrice - topMasterPrice : 0;
  const priceDiffPct = topMasterPrice && topMasterPrice > 0
    ? Math.round(((line.supplyPrice - topMasterPrice) / topMasterPrice) * 1000) / 10
    : 0;
  const masterMarginPct = topMasterPrice && line.unitCost > 0
    ? Math.round(((topMasterPrice - line.unitCost) / topMasterPrice) * 1000) / 10
    : null;
  const isExtremeDiff = topMasterPrice && topMasterPrice > 0 && line.supplyPrice > 0 && Math.abs(priceDiffPct) >= 30;
  const isNegativeMargin = line.supplyPrice > 0 && line.unitCost > 0 && line.supplyPrice < line.unitCost;

  // 💡 목표 마진율(Target Margin) 공식 기반 공급단가 산출 (100원 단위 반올림)
  // 공식: 공급단가 = 원가 / (1 - 마진율/100)
  const applyTargetMargin = (targetMarginPct: number) => {
    if (!line || line.unitCost <= 0) return;
    const clamped = Math.max(0, Math.min(85, targetMarginPct));
    if (clamped === 0) {
      onUpdateLine({ supplyPrice: line.unitCost, priceSource: 'MARGIN_CALCULATED' });
      return;
    }
    const calculatedPrice = Math.round((line.unitCost / (1 - clamped / 100)) / 100) * 100;
    onUpdateLine({ supplyPrice: calculatedPrice, priceSource: 'MARGIN_CALCULATED' });
  };

  // 1% 단위 스텝퍼 증감 핸들러
  const handleStepMargin = (delta: number) => {
    if (!line || line.unitCost <= 0) return;
    const current = marginRate > 0 ? Math.round(marginRate) : 15;
    applyTargetMargin(current + delta);
  };

  // 마스터 DB 영구 적재/갱신 핸들러
  const handleSaveToMaster = async () => {
    if (!caseId) {
      alert('견적건 ID가 유효하지 않습니다.');
      return;
    }
    if (line.supplyPrice <= 0) {
      alert('0원 이상의 유효한 공급단가를 입력해야 마스터 DB에 등록할 수 있습니다.');
      return;
    }

    // 1. 이미 마스터 표준 단가와 일치하는 경우
    if (isPriceMasterMatched) {
      alert(`현재 공급단가(₩${line.supplyPrice.toLocaleString()})는 이미 사내 표준 마스터 DB 단가와 완벽히 일치합니다.`);
      return;
    }

    // 2. 기존 마스터 단가와 차이가 있는 경우 갱신 확인 컨펌
    if (isPriceMasterDiff) {
      const diffText = priceDiff > 0 ? `+₩${priceDiff.toLocaleString()} 인상` : `-₩${Math.abs(priceDiff).toLocaleString()} 인하`;
      const confirmed = window.confirm(
        `[사내 표준 마스터 단가 갱신 확인]\n\n` +
        `• 품목: [${line.partNo}] ${line.partName}\n` +
        `• 기존 마스터 단가: ₩${topMasterPrice!.toLocaleString()}\n` +
        `• 새로 등록할 단가: ₩${line.supplyPrice.toLocaleString()} (${diffText})\n\n` +
        `기존 마스터 단가를 현재 단가로 갱신하시겠습니까?\n` +
        `(갱신 시 향후 신규 견적에 새 단가가 사내 표준으로 자동 반영됩니다.)`
      );
      if (!confirmed) return;
    }

    setSavingMaster(true);
    try {
      const extraCosts = [];
      if (line.extraCost1Amount) extraCosts.push({ name: line.extraCost1Name || '추가비1', amount: line.extraCost1Amount });
      if (line.extraCost2Amount) extraCosts.push({ name: line.extraCost2Name || '추가비2', amount: line.extraCost2Amount });
      if (line.extraCost3Amount) extraCosts.push({ name: line.extraCost3Name || '추가비3', amount: line.extraCost3Amount });

      const structuredRemark = stringifyRemark(line.memo || '2단계 단가 검토 중 마스터 적재', extraCosts);

      const res = await apiFetch(`/api/quotes/${caseId}/save-to-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partNo: line.partNo,
          partName: line.partName,
          partType: line.partType,
          material: line.material,
          specification: line.specification || '',
          unitPrice: line.supplyPrice,
          unitCost: line.unitCost,
          remark: structuredRemark
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setMasterSaved(true);
        setTimeout(() => setMasterSaved(false), 4000);
        // 단가 출처를 마스터 일치로 동기화
        onUpdateLine({ priceSource: 'MASTER_MATCH' });
        // 품목 상태도 확정으로 자동 연동
        if (onConfirmLine && line.status !== 'CONFIRMED') {
          await onConfirmLine(line.id);
        }
      } else {
        alert(json.error || '마스터 DB 저장 실패');
      }
    } catch (e: any) {
      alert('마스터 DB 저장 오류: ' + (e.message || ''));
    } finally {
      setSavingMaster(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm h-full flex flex-col justify-between text-xs space-y-2">
      {/* 1. 헤더 & 마스터 DB 영구 등록/갱신 액션 */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Calculator className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-bold text-slate-800">
            [No.{line.itemNo}] {line.partName} <span className="font-mono text-slate-500 font-normal">({line.partNo})</span>
          </span>
          {topMasterPrice && topMasterPrice > 0 ? (
            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shrink-0 shadow-2xs">
              📋 마스터 등록품 (₩{topMasterPrice.toLocaleString()})
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0 shadow-2xs">
              🆕 마스터 프라이스 미등록
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
            수량 {line.quantity} EA (구간: {line.quantity <= 9 ? '1~9' : line.quantity <= 99 ? '10~99' : '100~'})
          </span>

          {/* ⚡ 현재 품목 전용 1개 AI 원가 계산 버튼 */}
          {onCalculateSingleEngineering && (
            <button
              onClick={() => onCalculateSingleEngineering(line.id)}
              disabled={isCalculatingSingle}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                isCalculatingSingle
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-wait'
                  : 'bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border border-amber-600'
              }`}
              title="현재 품목에 대해 도면 체적/비중 및 표준 가공비를 적용한 AI 공학원가를 즉시 산출하여 자동 기입합니다."
            >
              {isCalculatingSingle ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-white" />
              )}
              <span>{isCalculatingSingle ? '산출 중...' : '⚡ 이 품목 AI 원가 계산'}</span>
            </button>
          )}

          {/* 🚀 마스터 DB 영구 적재 / 갱신 버튼 */}
          <button
            onClick={handleSaveToMaster}
            disabled={savingMaster || line.supplyPrice <= 0 || isPriceMasterMatched}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-2xs ${
              masterSaved
                ? 'bg-emerald-600 text-white'
                : isPriceMasterMatched
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 opacity-90 cursor-default'
                : isPriceMasterDiff
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 ring-1 ring-amber-200 cursor-pointer'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer'
            }`}
            title={
              isPriceMasterMatched
                ? '현재 공급단가가 이미 사내 표준 마스터 DB 단가와 일치합니다.'
                : isPriceMasterDiff
                ? `기존 마스터 단가(₩${topMasterPrice?.toLocaleString()})를 현재 단가(₩${line.supplyPrice.toLocaleString()})로 갱신합니다.`
                : '이 품목과 확정 단가를 사내 표준 마스터 DB에 신규 등록하여 향후 견적 시 자동 추천되도록 학습시킵니다.'
            }
          >
            {savingMaster ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : masterSaved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : isPriceMasterMatched ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Database className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span>
              {masterSaved
                ? '마스터 등록 완료'
                : isPriceMasterMatched
                ? `✓ 마스터 프라이스 일치 (₩${topMasterPrice?.toLocaleString()})`
                : isPriceMasterDiff
                ? `기존 ₩${topMasterPrice?.toLocaleString()} ➔ ₩${line.supplyPrice.toLocaleString()} 프라이스 갱신`
                : '+ 마스터 프라이스 신규 등록'}
            </span>
          </button>
        </div>
      </div>

      {/* 🚀 [P-3] 원가 엔진 산출 근거 (Engineering Formula Breakdown) */}
      {(() => {
        let formulaData: any = null;
        if (line.memo && line.memo.includes('[ENGINEERING_COST]')) {
          try {
            const rawJson = line.memo.replace(/.*\[ENGINEERING_COST\]\s*/, '').trim();
            formulaData = JSON.parse(rawJson);
          } catch {}
        }

        if (!formulaData && line.priceSource === 'ENGINEERING_COST') {
          formulaData = {
            materialCode: line.material,
            weightKg: line.unitCost > 0 ? (line.unitCost / 5000).toFixed(2) : '1.00',
            materialCost: line.materialCost || Math.round(line.unitCost * 0.45),
            laserCuttingCost: line.processCost || Math.round(line.unitCost * 0.45),
            subtotalCost: line.unitCost,
            finalUnitPrice: line.supplyPrice,
            markupRate: 0.15
          };
        }

        if (!formulaData) return null;

        return (
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                  참고 제안값
                </span>
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                  ⚙️ 원가 엔진 자동 산출 근거 (ENGINEERING_COST)
                </span>
              </div>
              <span className="text-[10px] text-blue-700 font-medium">
                * 검증 전 참고치이므로 자유롭게 수정 가능합니다
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded-lg border border-blue-100 shadow-2xs">
              <div className="space-y-1">
                <div className="text-slate-600 flex justify-between">
                  <span>• 소재비 (스크랩 8%):</span>
                  <span className="font-bold text-slate-800">
                    {formulaData.materialCode || line.material} {formulaData.weightKg ? `${formulaData.weightKg}kg` : ''} = ₩{(formulaData.materialCost || 0).toLocaleString()}
                  </span>
                </div>
                {formulaData.laserCuttingCost > 0 && (
                  <div className="text-slate-600 flex justify-between">
                    <span>• 레이저 절단비:</span>
                    <span className="font-bold text-slate-800">
                      ₩{(formulaData.laserCuttingCost).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                {formulaData.machiningCost > 0 && (
                  <div className="text-slate-600 flex justify-between">
                    <span>• 기계 가공비:</span>
                    <span className="font-bold text-slate-800">
                      ₩{(formulaData.machiningCost).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="text-slate-600 flex justify-between pt-0.5 border-t border-slate-100">
                  <span>• 소계 + 마진({Math.round((formulaData.markupRate || 0.15) * 100)}%):</span>
                  <span className="font-bold text-blue-700">
                    ₩{(formulaData.subtotalCost || line.unitCost || 0).toLocaleString()} → 제안단가: ₩{(formulaData.finalUnitPrice || line.supplyPrice || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. 항목별 내역 (소재비, 가공/공정비, 열처리/후처리비 직접 수정 + 별도 추가비용 1, 2, 3) */}
      {(() => {
        let label1 = '소재비';
        let label2 = '가공/공정비';
        let label3 = '열처리/후처리비';
        let ratio1 = 0.42;
        let ratio2 = 0.48;
        let ratio3 = 0.10;

        if (line.partType === 'SHEET_METAL') {
          label1 = '판재 소재비';
          label2 = '레이저·절곡비';
          label3 = '도장·후처리비';
          ratio1 = 0.45;
          ratio2 = 0.45;
          ratio3 = 0.10;
        } else if (line.partType === 'ELECTRICAL') {
          label1 = '카탈로그 구매가';
          label2 = '조달·검수비';
          label3 = '부대비용';
          ratio1 = 0.88;
          ratio2 = 0.12;
          ratio3 = 0.0;
        } else if (line.partType === 'COMMERCIAL') {
          label1 = '규격품 구매비';
          label2 = '입고검사비';
          label3 = '포장·유통비';
          ratio1 = 0.90;
          ratio2 = 0.10;
          ratio3 = 0.0;
        } else if (line.partType === 'CASTING') {
          label1 = '주물 소재비';
          label2 = '주조·후가공비';
          label3 = '열처리·세척비';
          ratio1 = 0.40;
          ratio2 = 0.50;
          ratio3 = 0.10;
        } else if (line.partType === 'ASSEMBLY') {
          label1 = '하위부품 합산';
          label2 = '조립공수 노임';
          label3 = '성능검사비';
          ratio1 = 0.75;
          ratio2 = 0.20;
          ratio3 = 0.05;
        }

        // 현재 각 세부 원가 항목 (저장된 값 우선, 없으면 단위원가 기준 비율 자동 계산)
        const matCost = line.materialCost !== undefined ? line.materialCost : Math.round(line.unitCost * ratio1);
        const procCost = line.processCost !== undefined ? line.processCost : Math.round(line.unitCost * ratio2);
        const treatCost = line.treatmentCost !== undefined ? line.treatmentCost : Math.round(line.unitCost * ratio3);

        const extra1Name = line.extraCost1Name ?? '치공구/지그비';
        const extra1Amount = line.extraCost1Amount ?? 0;

        const extra2Name = line.extraCost2Name ?? '검사/성적서비';
        const extra2Amount = line.extraCost2Amount ?? 0;

        const extra3Name = line.extraCost3Name ?? '특수포장/운송비';
        const extra3Amount = line.extraCost3Amount ?? 0;

        // 세부 항목 변경 시 단위원가 자동 합산 갱신
        const updateDetailCost = (field: string, val: number | string) => {
          const updatedMat = field === 'materialCost' ? Number(val) || 0 : matCost;
          const updatedProc = field === 'processCost' ? Number(val) || 0 : procCost;
          const updatedTreat = field === 'treatmentCost' ? Number(val) || 0 : treatCost;

          const updatedExtra1 = field === 'extraCost1Amount' ? Number(val) || 0 : extra1Amount;
          const updatedExtra2 = field === 'extraCost2Amount' ? Number(val) || 0 : extra2Amount;
          const updatedExtra3 = field === 'extraCost3Amount' ? Number(val) || 0 : extra3Amount;

          const newTotalUnitCost = updatedMat + updatedProc + updatedTreat + updatedExtra1 + updatedExtra2 + updatedExtra3;

          const updates: Partial<QuoteReviewLine> = {
            [field]: val,
            materialCost: updatedMat,
            processCost: updatedProc,
            treatmentCost: updatedTreat,
            extraCost1Amount: updatedExtra1,
            extraCost2Amount: updatedExtra2,
            extraCost3Amount: updatedExtra3,
            unitCost: newTotalUnitCost
          };

          // 스마트 자동 채우기: 공급단가가 아직 0원(미확보)이고 단위원가가 입력되면 목표 마진 15% 적용 공급단가 자동 세팅 (원가 / 0.85)
          if (line.supplyPrice <= 0 && newTotalUnitCost > 0) {
            updates.supplyPrice = Math.round((newTotalUnitCost / 0.85) / 100) * 100;
          }

          onUpdateLine(updates);
        };

        // 단위원가 직접 수정 시: 추가비용을 제외한 잔여액을 기본 3개 항목에 비율 배분
        const handleDirectUnitCostChange = (newTotal: number) => {
          const totalExtras = extra1Amount + extra2Amount + extra3Amount;
          const remaining = Math.max(newTotal - totalExtras, 0);

          const newMat = Math.round(remaining * ratio1);
          const newProc = Math.round(remaining * ratio2);
          const newTreat = Math.max(remaining - newMat - newProc, 0);

          const updates: Partial<QuoteReviewLine> = {
            unitCost: newTotal,
            materialCost: newMat,
            processCost: newProc,
            treatmentCost: newTreat
          };

          // 스마트 자동 채우기: 공급단가가 아직 0원(미확보)이고 단위원가가 입력되면 목표 마진 15% 적용 공급단가 자동 세팅 (원가 / 0.85)
          if (line.supplyPrice <= 0 && newTotal > 0) {
            updates.supplyPrice = Math.round((newTotal / 0.85) / 100) * 100;
          }

          onUpdateLine(updates);
        };

        const totalExtraSum = extra1Amount + extra2Amount + extra3Amount;

        return (
          <div className="space-y-1.5 bg-slate-50/80 p-2 rounded-xl border border-slate-200">
            {/* 2-1. 기본 3대 제조원가 (직접 수정 가능) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {/* 소재비 */}
              <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[10.5px] font-bold text-slate-600 mb-0.5">{label1} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[11px]">₩</span>
                  <input
                    type="number"
                    value={matCost}
                    onChange={(e) => updateDetailCost('materialCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 가공/공정비 */}
              <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[10.5px] font-bold text-slate-600 mb-0.5">{label2} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[11px]">₩</span>
                  <input
                    type="number"
                    value={procCost}
                    onChange={(e) => updateDetailCost('processCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 열처리/후처리비 */}
              <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[10.5px] font-bold text-slate-600 mb-0.5">{label3} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[11px]">₩</span>
                  <input
                    type="number"
                    value={treatCost}
                    onChange={(e) => updateDetailCost('treatmentCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 최종 단위원가 (자동 합산 ⟷ 직접 수정) */}
              <div className="bg-blue-50/90 p-1.5 rounded-lg border border-blue-300 shadow-2xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10.5px] font-bold text-blue-900">단위원가 (합산)</span>
                  {totalExtraSum > 0 && (
                    <span className="text-[9.5px] text-amber-700 bg-amber-100 px-1 rounded font-bold">
                      +추가비 ₩{totalExtraSum.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-blue-600 font-mono text-[11px] font-bold">₩</span>
                  <input
                    type="number"
                    value={line.unitCost}
                    onChange={(e) => handleDirectUnitCostChange(Number(e.target.value) || 0)}
                    className="w-full text-right font-mono font-bold text-blue-950 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-600 focus:outline-hidden bg-white shadow-2xs"
                    title="기본 제조원가와 별도 추가비용이 자동 합산되며, 직접 수정도 가능합니다."
                  />
                </div>
              </div>
            </div>

            {/* 2-2. 별도 비용추가 1, 2, 3 직접 수정 창 */}
            <div className="pt-1 border-t border-slate-200/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10.5px] font-bold text-slate-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>별도 비용추가 1·2·3 (특수 부대비용 직접 설정)</span>
                </span>
                <span className="text-[9.5px] text-slate-400">
                  지그·치공구비, 시험성적서, 특수포장, 긴급물류비 등을 단위원가에 자동 합산합니다.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {/* 추가비용 1 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra1Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <input
                      type="text"
                      value={extra1Name}
                      placeholder="비용추가 1 명칭"
                      onChange={(e) => onUpdateLine({ extraCost1Name: e.target.value })}
                      className="w-full text-[10.5px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.2"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[10.5px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra1Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost1Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1 py-0.2 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>

                {/* 추가비용 2 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra2Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <input
                      type="text"
                      value={extra2Name}
                      placeholder="비용추가 2 명칭"
                      onChange={(e) => onUpdateLine({ extraCost2Name: e.target.value })}
                      className="w-full text-[10.5px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.2"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[10.5px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra2Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost2Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1 py-0.2 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>

                {/* 추가비용 3 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra3Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <input
                      type="text"
                      value={extra3Name}
                      placeholder="비용추가 3 명칭"
                      onChange={(e) => onUpdateLine({ extraCost3Name: e.target.value })}
                      className="w-full text-[10.5px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.2"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[10.5px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra3Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost3Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1 py-0.2 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. 공급단가 및 1% 단위 마진율 조절 바 (목표 마진율 공식 100% 일치 연동) */}
      <div className="pt-1.5 border-t border-slate-200/80 shrink-0 space-y-1.5">
        {/* 🛡️ 마스터 프라이스 실시간 대조 바 & 세이프가드 가이드 (개선안 1, 3, 4 통합) */}
        {topMasterPrice && topMasterPrice > 0 ? (
          <div className={`px-2.5 py-1 rounded-lg border flex items-center justify-between text-[11px] transition-colors ${
            isExtremeDiff
              ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-2xs'
              : isPriceMasterMatched
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-blue-50/60 border-blue-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold flex items-center gap-1">
                📋 마스터가: <strong className="font-mono text-slate-900">₩{topMasterPrice.toLocaleString()}</strong>
              </span>
              {masterMarginPct !== null && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                  masterMarginPct >= 12 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  (마스터 마진 {masterMarginPct}%)
                </span>
              )}
              <span className="text-slate-300">➔</span>
              <span className="text-slate-600">
                현재가: <strong className="font-mono text-blue-900">₩{line.supplyPrice.toLocaleString()}</strong>
              </span>
              {isPriceMasterMatched ? (
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                  ✓ 마스터 표준 일치
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded font-bold font-mono text-[10px] ${
                  isExtremeDiff
                    ? 'bg-rose-600 text-white animate-pulse'
                    : priceDiff > 0
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-slate-200 text-slate-800'
                }`}>
                  {priceDiff > 0
                    ? `▲ +₩${priceDiff.toLocaleString()} (+${priceDiffPct}% 인상)`
                    : `▼ -₩${Math.abs(priceDiff).toLocaleString()} (${priceDiffPct}% 인하)`}
                </span>
              )}
            </div>

            {!isPriceMasterMatched && (
              <button
                type="button"
                onClick={() => onUpdateLine({ supplyPrice: topMasterPrice, priceSource: 'MASTER_MATCH' })}
                className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-700 font-bold text-[10.5px] border border-blue-300 shadow-2xs transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                title="현재 공급단가를 사내 표준 마스터 단가로 원클릭 복원합니다"
              >
                <span>⟲ 마스터가로 복원</span>
              </button>
            )}
          </div>
        ) : (
          <div className="px-2.5 py-1 rounded-lg bg-purple-50/70 border border-purple-200 text-purple-900 flex items-center justify-between text-[11px]">
            <span className="font-bold flex items-center gap-1">
              ✨ <strong>사내 마스터 프라이스 미등록 품목</strong> (신규 도면/규격)
            </span>
            <span className="text-[10.5px] text-purple-600 font-medium">
              단가 확정 후 상단 [+ 마스터 프라이스 신규 등록] 시 사내 표준으로 등재됩니다
            </span>
          </div>
        )}

        {/* ⚠️ 세이프가드 과도 괴리 경고 알림 */}
        {isExtremeDiff && (
          <div className="px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>
              [세이프가드 경고] 마스터 기준단가(₩{topMasterPrice?.toLocaleString()}) 대비 {priceDiffPct > 0 ? `+${priceDiffPct}% 급등` : `${priceDiffPct}% 급락`}! 0 입력 오타나 단위를 재확인하세요.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-800 text-xs">공급단가:</span>
            <input
              type="number"
              value={line.supplyPrice}
              onChange={(e) => onUpdateLine({ supplyPrice: Number(e.target.value) || 0, priceSource: 'MANUAL_PRICE' })}
              className={`w-24 px-2 py-0.8 border rounded font-mono font-bold text-xs focus:outline-none shadow-2xs ${
                isExtremeDiff || isNegativeMargin
                  ? 'border-rose-500 ring-2 ring-rose-400 bg-rose-50 text-rose-900'
                  : 'border-slate-300 text-blue-900 focus:ring-1 focus:ring-blue-500 bg-white'
              }`}
            />
            <span className="text-slate-500 text-xs font-medium">원</span>

          {line.unitCost > 0 && (
            <>
              <span className="text-slate-300 mx-0.5">|</span>

              {/* ⚡ 1% 단위 미세 조절 스텝퍼 & 직접 입력 */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200" title="1% 단위로 마진율을 올리거나 내립니다">
                <button
                  type="button"
                  onClick={() => handleStepMargin(-1)}
                  disabled={marginRate <= 0}
                  className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 disabled:opacity-30 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
                  title="마진율 1% 감소"
                >
                  -
                </button>
                <div className="flex items-center px-1">
                  <input
                    type="number"
                    min="0"
                    max="85"
                    value={Math.round(marginRate)}
                    onChange={(e) => applyTargetMargin(Number(e.target.value) || 0)}
                    className="w-8 text-center font-mono font-bold text-xs bg-transparent focus:bg-white focus:outline-none border-b border-dashed border-slate-400"
                    title="원하는 목표 마진율(%)을 키보드로 직접 입력할 수 있습니다"
                  />
                  <span className="text-[11px] font-bold text-slate-600">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStepMargin(1)}
                  disabled={marginRate >= 85}
                  className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 disabled:opacity-30 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
                  title="마진율 1% 증가"
                >
                  +
                </button>
              </div>

              {/* ⚡ 원클릭 퀵 마진 프리셋 (목표 마진율 공식: 공급단가 = 원가 / (1 - 마진율/100)) */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyTargetMargin(10)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border transition-colors shadow-2xs cursor-pointer ${
                    Math.round(marginRate) === 10
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                  title="목표 마진율 10% 자동 계산 적용"
                >
                  10%
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetMargin(15)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border transition-colors shadow-2xs cursor-pointer ${
                    Math.round(marginRate) === 15
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                  title="목표 마진율 15% 자동 계산 적용"
                >
                  15%
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetMargin(20)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border transition-colors shadow-2xs cursor-pointer ${
                    Math.round(marginRate) === 20
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                  title="목표 마진율 20% 자동 계산 적용"
                >
                  20%
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetMargin(0)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium border transition-colors shadow-2xs cursor-pointer ${
                    marginRate === 0
                      ? 'bg-slate-700 text-white border-slate-800'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                  title="원가 그대로 공급단가 적용 (마진 0%)"
                >
                  원가
                </button>
              </div>
            </>
          )}

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10.5px] ml-0.5 ${
            marginRate < 0
              ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
              : isMarginWarning
              ? 'bg-amber-100 text-amber-800 border border-amber-200'
              : 'bg-emerald-100 text-emerald-800'
          }`}>
            {(isMarginWarning || marginRate < 0) && <AlertTriangle className="w-3 h-3" />}
            마진율 {marginRate}% {marginRate < 0 ? '(역마진!)' : isMarginWarning ? '(하한 12% 미달)' : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <input
            type="text"
            placeholder="단가 산출 사유/메모"
            value={line.memo || ''}
            onChange={(e) => onUpdateLine({ memo: e.target.value })}
            className="w-44 px-2 py-0.8 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>
    </div>
    </div>
  );
}
