'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, FileText, Check } from 'lucide-react';

export interface TitleBlockData {
  drawingNo: string;
  revision: string;
  partName: string;
  material: string;
  scale: string;
  unit: 'mm' | 'inch';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TitleBlockCardProps {
  data: TitleBlockData;
  onChange: (data: TitleBlockData) => void;
  onSaveTemplate?: () => void;
}

export default function TitleBlockCard({ data, onChange, onSaveTemplate }: TitleBlockCardProps) {
  const isHigh = data.confidence === 'HIGH';
  const isMed = data.confidence === 'MEDIUM';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-900 text-sm">표제란 인식 결과</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
            isHigh ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            isMed ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {isHigh ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            신뢰도 {data.confidence}
          </span>
          {onSaveTemplate && (
            <button
              onClick={onSaveTemplate}
              className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors"
            >
              템플릿으로 저장
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">도면번호 (도번)</label>
          <input
            type="text"
            value={data.drawingNo}
            onChange={(e) => onChange({ ...data, drawingNo: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="예: VB-200"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">리비전 (Rev)</label>
          <input
            type="text"
            value={data.revision}
            onChange={(e) => onChange({ ...data, revision: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="예: A, B, 0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">단위 (Unit)</label>
          <select
            value={data.unit}
            onChange={(e) => onChange({ ...data, unit: e.target.value as 'mm' | 'inch' })}
            className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
          >
            <option value="mm">mm (밀리미터)</option>
            <option value="inch">inch (인치 ⚠ 환산필요)</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">품명 (Part Name)</label>
          <input
            type="text"
            value={data.partName}
            onChange={(e) => onChange({ ...data, partName: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="예: VALVE BODY ASSY"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">척도 (Scale)</label>
          <input
            type="text"
            value={data.scale}
            onChange={(e) => onChange({ ...data, scale: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="예: 1:1, 1:2"
          />
        </div>
      </div>
    </div>
  );
}
