'use client';

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck, Play, RefreshCw, AlertTriangle, Layers, Database, FileSpreadsheet, Lock } from 'lucide-react';

export default function GoldenDatasetPage() {
  const [loading, setLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  const handleRunEvaluation = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/golden/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goldenCaseId: 'gcase_001' })
      });
      const json = await res.json();
      if (res.ok) {
        setEvalResult(json);
      } else {
        alert(json.error || '평가 실행 실패');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md w-fit mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>PROMPT 17: GOLDEN DATASET & BASELINE VALIDATION</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">골든 데이터셋 및 베이스라인 검증 (DEMO FREEZE)</h1>
          <p className="text-xs text-slate-500 mt-1">
            사람이 직접 확인한 정답 데이터(Ground Truth)를 기준으로 시스템의 도면 검출, BOM 추출, 수량 롤업 및 견적 산출 결과를 비교 검증합니다.
          </p>
        </div>

        <button
          onClick={handleRunEvaluation}
          disabled={loading}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>정답 대조 평가 실행 중...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Golden Evaluation 실행</span>
            </>
          )}
        </button>
      </div>

      {/* Golden Ground Truth Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">기준 골든 케이스</span>
          <span className="text-lg font-bold font-mono text-slate-900 block mt-1">GOLDEN-DXF-001</span>
          <span className="text-[11px] text-slate-400 mt-1 block">A기계 고속라인 정답 세트</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">검수자 검증 도면 수</span>
          <span className="text-2xl font-extrabold text-blue-600 block mt-1">1 개</span>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Actual Frame Verified</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">검수자 검증 BOM 품목수</span>
          <span className="text-2xl font-extrabold text-blue-600 block mt-1">5 개</span>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Raw Items Verified</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">현재 활성 베이스라인</span>
          <span className="text-lg font-bold font-mono text-purple-700 block mt-1">BASELINE_V1</span>
          <span className="text-[11px] text-purple-600 font-semibold mt-1 block">ezdxf + LibreDWG 0.14</span>
        </div>
      </div>

      {/* Evaluation Results */}
      {evalResult && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>정답 대조 평가 및 베이스라인 자격 심사 결과</span>
            </h3>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
              STATUS: {evalResult.evalResult.status} (자격 통과)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">도면 검출 정밀도 (Precision)</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {(evalResult.evalResult.metrics.drawing_precision * 100).toFixed(0)}%
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">도면 검출 재현율 (Recall)</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {(evalResult.evalResult.metrics.drawing_recall * 100).toFixed(0)}%
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">마스터 매칭 Top 1 성공</span>
              <span className="text-2xl font-bold text-emerald-600 mt-1 block">
                {evalResult.evalResult.metrics.master_top1_count} / {evalResult.evalResult.metrics.actual_rows}
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">오매칭 (False Match)</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {evalResult.evalResult.metrics.false_matches} 건
              </span>
            </div>
          </div>

          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
            <div className="font-bold flex items-center space-x-1.5">
              <Lock className="w-4 h-4 text-purple-700" />
              <span>베이스라인 등록 완료 (BASELINE_V1)</span>
            </div>
            <p>
              등록 ID: <span className="font-mono font-bold">{evalResult.baselineId}</span> | 평가 결과가 향후 Parser 및 Algorithm 변경 시의 비교 기준선으로 영구 보존됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
