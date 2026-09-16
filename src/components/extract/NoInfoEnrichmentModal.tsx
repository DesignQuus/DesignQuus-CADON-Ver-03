'use client';

import React, { useState } from 'react';
import { AlertCircle, HelpCircle, FileText, Check, ShieldAlert, ArrowRight } from 'lucide-react';

interface GeometricHint {
  detectedBbox: { width: number; length: number; thickness: number };
  holeCount: number;
  estimatedWeightKg: number;
}

interface NoInfoEnrichmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  hint: GeometricHint;
  onProceedConditionalQuote: (params: {
    tempPartNo: string;
    partName: string;
    assumedMaterial: string;
    quantity: number;
    dimensions: string;
    conditionNote: string;
  }) => void;
  onRequestCustomerSpec: () => void;
}

export default function NoInfoEnrichmentModal({
  isOpen,
  onClose,
  hint,
  onProceedConditionalQuote,
  onRequestCustomerSpec
}: NoInfoEnrichmentModalProps) {
  const [partName, setPartName] = useState('PLATE-01');
  const [assumedMaterial, setAssumedMaterial] = useState('SS400');
  const [quantity, setQuantity] = useState(1);
  const [tempPartNo] = useState(`TMP-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-01`);

  if (!isOpen) return null;

  const dimStr = `${hint.detectedBbox.width} × ${hint.detectedBbox.length} × ${hint.detectedBbox.thickness} mm`;

  const handleConditionalSubmit = () => {
    onProceedConditionalQuote({
      tempPartNo,
      partName,
      assumedMaterial,
      quantity,
      dimensions: dimStr,
      conditionNote: `도면 내 재질 미표기로 ${assumedMaterial} 기준 조건부 견적 산출 (사양 확정 시 재견적 요망)`
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-5 border border-slate-200">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              등급 D : 무정보 도면 감지
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              표제란 및 부품표(BOM)가 없는 도면입니다
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              도면의 치수선과 윤곽선에서 아래와 같이 형상 힌트를 자동 감지하였습니다.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">치수선 기준 감지 외곽:</span>
            <span className="font-semibold text-slate-800">{dimStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">원형 홀(Hole) 감지:</span>
            <span className="font-semibold text-slate-800">{hint.holeCount}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">소재 환산 중량(스틸 기준):</span>
            <span className="font-semibold text-blue-600">약 {hint.estimatedWeightKg} kg</span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">임시 도번 (자동 채번)</label>
              <input type="text" readOnly value={tempPartNo} className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">임시 품명</label>
              <input type="text" value={partName} onChange={(e) => setPartName(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">가정할 기본 재질 (조건부)</label>
              <select value={assumedMaterial} onChange={(e) => setAssumedMaterial(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
                <option value="SS400">SS400 (일반 구조용 탄소강)</option>
                <option value="S45C">S45C (기계구조용강)</option>
                <option value="SUS304">SUS304 (스테인리스강)</option>
                <option value="AL6061">AL6061 (알루미늄)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">요청 수량 (EA)</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>조건부 견적은 견적서에 "재질 미기재로 인한 가견적" 문구가 자동 명시되어 법적 분쟁을 방지합니다.</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            onClick={onRequestCustomerSpec}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4" />
            고객 확인 요청서 생성
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg">
              취소
            </button>
            <button
              onClick={handleConditionalSubmit}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
            >
              조건부 견적 진행
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
