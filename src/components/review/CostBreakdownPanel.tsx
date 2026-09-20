'use client';

import React, { useState } from 'react';
import { Coins, AlertTriangle, Layers, Calculator, Database, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { QuoteReviewLine } from './QuoteLineGrid';
import { apiFetch } from '@/lib/api';
import { stringifyRemark } from '@/lib/remark-cost-helper';

interface CostBreakdownPanelProps {
  line: QuoteReviewLine | null;
  caseId?: string;
  onUpdateLine: (updated: Partial<QuoteReviewLine>) => void;
  onConfirmLine?: (lineId: string) => Promise<void>;
}

export default function CostBreakdownPanel({
  line,
  caseId,
  onUpdateLine,
  onConfirmLine
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

  const marginRate = line.supplyPrice > 0 && line.unitCost > 0
    ? Math.round(((line.supplyPrice - line.unitCost) / line.supplyPrice) * 1000) / 10
    : 0;

  const isMarginWarning = marginRate < 12.0;

  // 마스터 DB 영구 적재 핸들러
  const handleSaveToMaster = async () => {
    if (!caseId) {
      alert('견적건 ID가 유효하지 않습니다.');
      return;
    }
    if (line.supplyPrice <= 0) {
      alert('0원 이상의 유효한 공급단가를 입력해야 마스터 DB에 등록할 수 있습니다.');
      return;
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
      {/* 1. 헤더 & 마스터 DB 영구 등록 액션 */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-slate-800">
            [No.{line.itemNo}] {line.partName} <span className="font-mono text-slate-500 font-normal">({line.partNo})</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
            수량 {line.quantity} EA (구간: {line.quantity <= 9 ? '1~9' : line.quantity <= 99 ? '10~99' : '100~'})
          </span>

          {/* 🚀 마스터 DB 영구 적재 버튼 */}
          <button
            onClick={handleSaveToMaster}
            disabled={savingMaster || line.supplyPrice <= 0}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
              masterSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
            }`}
            title="이 품목과 확정 단가를 사내 표준 마스터 DB에 영구 등록하여 향후 견적 시 자동 추천되도록 학습시킵니다."
          >
            {savingMaster ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : masterSaved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Database className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span>{masterSaved ? '마스터 등록 완료' : '이 단가를 마스터 DB에 저장'}</span>
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

          onUpdateLine({
            [field]: val,
            materialCost: updatedMat,
            processCost: updatedProc,
            treatmentCost: updatedTreat,
            extraCost1Amount: updatedExtra1,
            extraCost2Amount: updatedExtra2,
            extraCost3Amount: updatedExtra3,
            unitCost: newTotalUnitCost
          });
        };

        // 단위원가 직접 수정 시: 추가비용을 제외한 잔여액을 기본 3개 항목에 비율 배분
        const handleDirectUnitCostChange = (newTotal: number) => {
          const totalExtras = extra1Amount + extra2Amount + extra3Amount;
          const remaining = Math.max(newTotal - totalExtras, 0);

          const newMat = Math.round(remaining * ratio1);
          const newProc = Math.round(remaining * ratio2);
          const newTreat = Math.max(remaining - newMat - newProc, 0);

          onUpdateLine({
            unitCost: newTotal,
            materialCost: newMat,
            processCost: newProc,
            treatmentCost: newTreat
          });
        };

        const totalExtraSum = extra1Amount + extra2Amount + extra3Amount;

        return (
          <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            {/* 2-1. 기본 3대 제조원가 (직접 수정 가능) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* 소재비 */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[11px] font-bold text-slate-600 mb-1">{label1} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-xs">₩</span>
                  <input
                    type="number"
                    value={matCost}
                    onChange={(e) => updateDetailCost('materialCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 가공/공정비 */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[11px] font-bold text-slate-600 mb-1">{label2} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-xs">₩</span>
                  <input
                    type="number"
                    value={procCost}
                    onChange={(e) => updateDetailCost('processCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 열처리/후처리비 */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span className="block text-[11px] font-bold text-slate-600 mb-1">{label3} (직접수정)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-xs">₩</span>
                  <input
                    type="number"
                    value={treatCost}
                    onChange={(e) => updateDetailCost('treatmentCost', e.target.value)}
                    className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                  />
                </div>
              </div>

              {/* 최종 단위원가 (자동 합산 ⟷ 직접 수정) */}
              <div className="bg-blue-50/80 p-2 rounded-lg border border-blue-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-blue-900">단위원가 (합산)</span>
                  {totalExtraSum > 0 && (
                    <span className="text-[10px] text-amber-700 bg-amber-100 px-1 py-0.2 rounded font-bold">
                      +추가비 ₩{totalExtraSum.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-blue-500 font-mono text-xs font-bold">₩</span>
                  <input
                    type="number"
                    value={line.unitCost}
                    onChange={(e) => handleDirectUnitCostChange(Number(e.target.value) || 0)}
                    className="w-full text-right font-mono font-bold text-blue-950 text-xs border border-blue-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-600 focus:outline-hidden bg-white shadow-2xs"
                    title="기본 제조원가와 별도 추가비용이 자동 합산되며, 직접 수정도 가능합니다."
                  />
                </div>
              </div>
            </div>

            {/* 2-2. 별도 비용추가 1, 2, 3 직접 수정 창 */}
            <div className="pt-1 border-t border-slate-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>별도 비용추가 1·2·3 (특수 부대비용 직접 설정)</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  지그·치공구비, 시험성적서, 특수포장, 긴급물류비 등을 단위원가에 자동 합산합니다.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 추가비용 1 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra1Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="text"
                      value={extra1Name}
                      placeholder="비용추가 1 명칭"
                      onChange={(e) => onUpdateLine({ extraCost1Name: e.target.value })}
                      className="w-full text-[11px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[11px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra1Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost1Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>

                {/* 추가비용 2 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra2Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="text"
                      value={extra2Name}
                      placeholder="비용추가 2 명칭"
                      onChange={(e) => onUpdateLine({ extraCost2Name: e.target.value })}
                      className="w-full text-[11px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[11px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra2Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost2Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>

                {/* 추가비용 3 */}
                <div className={`p-1.5 rounded-lg border transition-all ${
                  extra3Amount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      type="text"
                      value={extra3Name}
                      placeholder="비용추가 3 명칭"
                      onChange={(e) => onUpdateLine({ extraCost3Name: e.target.value })}
                      className="w-full text-[11px] font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:outline-hidden focus:border-amber-500 px-0.5 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[11px]">₩</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={extra3Amount || ''}
                      onChange={(e) => updateDetailCost('extraCost3Amount', e.target.value)}
                      className="w-full text-right font-mono font-bold text-slate-800 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-amber-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. 공급단가 및 마진율 */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">공급단가:</span>
          <input
            type="number"
            value={line.supplyPrice}
            onChange={(e) => onUpdateLine({ supplyPrice: Number(e.target.value) || 0 })}
            className="w-28 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-blue-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-slate-400">원</span>

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] ${
            isMarginWarning ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {isMarginWarning && <AlertTriangle className="w-3 h-3" />}
            마진율 {marginRate}% {isMarginWarning && '(하한 12% 미달)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="단가 산출 사유/메모"
            value={line.memo || ''}
            onChange={(e) => onUpdateLine({ memo: e.target.value })}
            className="w-52 px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
