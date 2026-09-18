'use client';

import React, { useState } from 'react';
import { Coins, AlertTriangle, Layers, Calculator, Database, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { QuoteReviewLine } from './QuoteLineGrid';
import { apiFetch } from '@/lib/api';

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
          remark: line.memo || '2단계 단가 검토 중 마스터 적재'
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

      {/* 2. 항목별 내역 (부품 유형별 맞춤 분해) */}
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

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <div>
              <span className="block text-[11px] text-slate-400">{label1}</span>
              <span className="font-mono font-bold text-slate-800">
                ₩{Math.round(line.unitCost * ratio1).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-400">{label2}</span>
              <span className="font-mono font-bold text-slate-800">
                ₩{Math.round(line.unitCost * ratio2).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-400">{label3}</span>
              <span className="font-mono font-bold text-slate-800">
                ₩{Math.round(line.unitCost * ratio3).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-400">단위원가 (직접수정 가능)</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-slate-400 font-mono text-[11px]">₩</span>
                <input
                  type="number"
                  value={line.unitCost}
                  onChange={(e) => onUpdateLine({ unitCost: Number(e.target.value) || 0 })}
                  className="w-24 px-1.5 py-0.5 border border-slate-300 rounded font-mono font-bold text-slate-900 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white"
                />
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
