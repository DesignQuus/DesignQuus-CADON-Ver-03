'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState } from 'react';
import {
  Wrench, Layers, RefreshCw, CheckCircle2, AlertCircle, Edit3,
  Scale, Scissors, ChevronRight, Save, X, Sparkles, Sliders, Database,
  ArrowRight, ShieldCheck, Check
} from 'lucide-react';

interface FabricationFeaturesPanelProps {
  quotationCaseId: string;
  onRefreshCase?: () => void;
}

export default function FabricationFeaturesPanel({ quotationCaseId, onRefreshCase }: FabricationFeaturesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [standardMaterials, setStandardMaterials] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [editingFeature, setEditingFeature] = useState<any | null>(null);
  const [formValues, setFormValues] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchFeatures = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/quotation-cases/${quotationCaseId}/features`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가공 피처 조회 실패');
      setFeatures(data.features || []);
      setSummary(data.summary || null);
      setStandardMaterials(data.standardMaterials || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '가공 피처 로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, [quotationCaseId]);

  const handleOpenEdit = (feat: any) => {
    setEditingFeature(feat);
    setFormValues({
      featureId: feat.id,
      bboxWidth: feat.bbox_width,
      bboxLength: feat.bbox_length,
      bboxThickness: feat.bbox_thickness,
      cuttingLengthTotal: feat.cutting_length_total,
      bendingCount: feat.bending_count,
      tapHoleCount: feat.tap_hole_count,
      throughHoleCount: feat.through_hole_count,
      materialCode: feat.material_code,
      surfaceTreatment: feat.surface_treatment || 'None',
      heatTreatment: feat.heat_treatment || 'None',
      processType: feat.process_type || 'SHEET_METAL',
      markupRate: feat.markup_rate ?? 0.15
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/api/quotation-cases/${quotationCaseId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');

      setSuccessToast('가공 피처 및 제조원가가 성공적으로 재계산되었습니다.');
      setEditingFeature(null);
      await fetchFeatures();
      if (onRefreshCase) onRefreshCase();

      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      alert(err.message || '저장 오류');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <div className="text-sm font-bold text-slate-700">도면 형상 기하 피처 및 제조원가 산출 중...</div>
        <div className="text-xs text-slate-400">이지데스크 My DB에서 가공 파라미터를 동기화하고 있습니다.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <div className="text-sm font-bold text-rose-700">{error}</div>
        <button
          onClick={fetchFeatures}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const subtotal = summary?.totalSubtotalCost || 1;
  const matPct = Math.round(((summary?.totalMaterialCost || 0) / subtotal) * 100);
  const laserPct = Math.round(((summary?.totalLaserCost || 0) / subtotal) * 100);
  const bendPct = Math.round(((summary?.totalBendingCost || 0) / subtotal) * 100);
  const tapPct = Math.round(((summary?.totalTappingCost || 0) / subtotal) * 100);
  const surfPct = Math.round(((summary?.totalSurfaceCost || 0) / subtotal) * 100);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Success Toast */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header & EGDesk Integration Badge */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Wrench className="w-4 h-4" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">
              도면 기하 가공 피처 및 공정별 제조원가 분석 (EGDesk Cost Engine)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
              <Database className="w-3 h-3 text-indigo-600" />
              EGDesk User Data 연동
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            도면에서 추출된 외곽 치수($W \times L \times T$), 절단선 연장, 절곡 타수, 탭(나사산) 홀 및 단품 중량을 기반으로 정밀 공정 원가를 산출합니다.
          </p>
        </div>

        <button
          onClick={fetchFeatures}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>새로고침</span>
        </button>
      </div>

      {/* 4대 가공 KPI 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">총 원자재 투입량</span>
            <Scale className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {summary?.totalWeightKg || 0} <span className="text-xs font-bold text-slate-400">kg</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">이론 중량 기준 (스크랩 별도)</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">총 레이저 절단연장</span>
            <Scissors className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600">
            {summary?.totalCuttingLengthM || 0} <span className="text-xs font-bold text-emerald-400">m</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">외곽 둘레 + 내부 홀 절단선</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">총 절곡 가공 타수</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600">
            {summary?.totalBendingCount || 0} <span className="text-xs font-bold text-amber-400">회</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">V-절곡 선 합산</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">탭 / 나사산 홀 수</span>
            <Wrench className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-black text-purple-600">
            {summary?.totalTapCount || 0} <span className="text-xs font-bold text-purple-400">개</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">M3~M10 표준 탭</div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 rounded-2xl shadow-sm col-span-2 sm:col-span-1">
          <div className="text-xs text-blue-100 font-semibold mb-1">총 제안 견적가 (합계)</div>
          <div className="text-xl font-black">
            ₩{(summary?.totalFinalPrice || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-blue-200 mt-1">마진율 15% 포함</div>
        </div>
      </div>

      {/* 공정별 제조원가 구성비 (Cost Breakdown Bar) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
            <span>📊 공정별 원가 구성비 (총 제조원가 ₩{(summary?.totalSubtotalCost || 0).toLocaleString()})</span>
          </span>
          <span className="text-[11px] text-slate-400">단품 제조원가 합계 기준</span>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div style={{ width: `${matPct}%` }} className="bg-blue-500 h-full" title={`재료비: ${matPct}%`} />
          <div style={{ width: `${laserPct}%` }} className="bg-emerald-500 h-full" title={`레이저 절단: ${laserPct}%`} />
          <div style={{ width: `${bendPct}%` }} className="bg-amber-500 h-full" title={`절곡비: ${bendPct}%`} />
          <div style={{ width: `${tapPct}%` }} className="bg-purple-500 h-full" title={`탭/드릴: ${tapPct}%`} />
          <div style={{ width: `${surfPct}%` }} className="bg-sky-400 h-full" title={`후처리비: ${surfPct}%`} />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-slate-600 font-medium">재료비: ₩{(summary?.totalMaterialCost || 0).toLocaleString()} ({matPct}%)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-slate-600 font-medium">레이저 절단비: ₩{(summary?.totalLaserCost || 0).toLocaleString()} ({laserPct}%)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-slate-600 font-medium">절곡비: ₩{(summary?.totalBendingCost || 0).toLocaleString()} ({bendPct}%)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-purple-500" />
            <span className="text-slate-600 font-medium">탭/홀 가공비: ₩{(summary?.totalTappingCost || 0).toLocaleString()} ({tapPct}%)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-sky-400" />
            <span className="text-slate-600 font-medium">후처리(도금/도장): ₩{(summary?.totalSurfaceCost || 0).toLocaleString()} ({surfPct}%)</span>
          </div>
        </div>
      </div>

      {/* 부품별 가공 피처 & 원가 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
            <span>부품별 가공 피처 및 원가 명세표</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">
              {features.length}개 품목
            </span>
          </h3>
          <span className="text-xs text-slate-400">
            치수나 가공량이 변경된 경우 [✏️ 수정] 버튼으로 즉시 재계산할 수 있습니다.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3">No</th>
                <th className="px-3.5 py-3">부품명 / 도면정보</th>
                <th className="px-3.5 py-3">재질</th>
                <th className="px-3.5 py-3 text-center">블랭크 크기 (W×L×T)</th>
                <th className="px-3.5 py-3 text-center">절단길이</th>
                <th className="px-3.5 py-3 text-center">절곡</th>
                <th className="px-3.5 py-3 text-center">탭/홀</th>
                <th className="px-3.5 py-3 text-right">중량 (kg)</th>
                <th className="px-3.5 py-3 text-right">재료비</th>
                <th className="px-3.5 py-3 text-right">가공비</th>
                <th className="px-3.5 py-3 text-right">후처리비</th>
                <th className="px-3.5 py-3 text-right">제안단가</th>
                <th className="px-3.5 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {features.map((feat, idx) => {
                const rawInfo = feat.raw_features_json ? JSON.parse(feat.raw_features_json) : {};
                const partName = rawInfo.partName || `부품 ${idx + 1}`;
                const drawingNo = rawInfo.drawingNo || '-';
                const machiningSub = (feat.laser_cutting_cost || 0) + (feat.bending_cost || 0) + (feat.tapping_cost || 0) + (feat.machining_cost || 0);

                return (
                  <tr key={feat.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="px-3.5 py-3">
                      <div className="font-bold text-slate-900">{partName}</div>
                      <div className="text-[11px] font-mono text-slate-400">{drawingNo}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                        {feat.material_code}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-center font-mono font-medium text-slate-700">
                      {feat.bbox_width} × {feat.bbox_length} × {feat.bbox_thickness}T
                    </td>
                    <td className="px-3.5 py-3 text-center font-mono">
                      {(feat.cutting_length_total || 0).toLocaleString()} mm
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      {feat.bending_count > 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                          {feat.bending_count}회
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <div className="text-[11px]">
                        {feat.tap_hole_count > 0 && (
                          <span className="font-bold text-purple-700">탭 {feat.tap_hole_count}개 </span>
                        )}
                        <span className="text-slate-500">홀 {feat.through_hole_count || 0}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-800">
                      {feat.part_weight_kg}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-blue-700 font-semibold">
                      ₩{(feat.material_cost || 0).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-emerald-700 font-semibold">
                      ₩{machiningSub.toLocaleString()}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-slate-600">
                      ₩{(feat.surface_finish_cost || 0).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-black text-slate-900 bg-slate-50/60">
                      ₩{(feat.final_unit_price || 0).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <button
                        onClick={() => handleOpenEdit(feat)}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-blue-600 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center space-x-1 mx-auto"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>수정</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 가공 피처 및 파라미터 수동 보정 모달 */}
      {editingFeature && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">가공 피처 및 원가 파라미터 보정</h3>
              </div>
              <button
                onClick={() => setEditingFeature(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">재질 (Material)</label>
                  <select
                    value={formValues.materialCode}
                    onChange={(e) => setFormValues({ ...formValues, materialCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {standardMaterials.map((m: any) => (
                      <option key={m.code} value={m.code}>
                        {m.code} - {m.name} (₩{m.unitPricePerKg}/kg)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">가공 공정 구분</label>
                  <select
                    value={formValues.processType}
                    onChange={(e) => setFormValues({ ...formValues, processType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="SHEET_METAL">판금 가공 (레이저+절곡)</option>
                    <option value="MACHINING">절삭/밀링 가공</option>
                    <option value="PIPE">파이프/환봉 가공</option>
                    <option value="STRUCTURE">제관/구조물 용접</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">가로 W (mm)</label>
                  <input
                    type="number"
                    value={formValues.bboxWidth}
                    onChange={(e) => setFormValues({ ...formValues, bboxWidth: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">세로 L (mm)</label>
                  <input
                    type="number"
                    value={formValues.bboxLength}
                    onChange={(e) => setFormValues({ ...formValues, bboxLength: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">두께 T (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formValues.bboxThickness}
                    onChange={(e) => setFormValues({ ...formValues, bboxThickness: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">절단선 총길이 (mm)</label>
                  <input
                    type="number"
                    value={formValues.cuttingLengthTotal}
                    onChange={(e) => setFormValues({ ...formValues, cuttingLengthTotal: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">절곡 선 수 (회)</label>
                  <input
                    type="number"
                    value={formValues.bendingCount}
                    onChange={(e) => setFormValues({ ...formValues, bendingCount: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">탭(나사산) 수 (개)</label>
                  <input
                    type="number"
                    value={formValues.tapHoleCount}
                    onChange={(e) => setFormValues({ ...formValues, tapHoleCount: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">표면처리 (도금/도장)</label>
                  <select
                    value={formValues.surfaceTreatment}
                    onChange={(e) => setFormValues({ ...formValues, surfaceTreatment: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="None">처리 없음 (원자재)</option>
                    <option value="아연도금(백색)">전기아연도금 (백색 삼가)</option>
                    <option value="아연도금(흑색)">전기아연도금 (흑색 삼가)</option>
                    <option value="아노다이징(흑색)">아노다이징 (흑색)</option>
                    <option value="아노다이징(은백색)">아노다이징 (은백색)</option>
                    <option value="분체도장">분체도장</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">이윤 마크업 비율</label>
                  <select
                    value={formValues.markupRate}
                    onChange={(e) => setFormValues({ ...formValues, markupRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value={0.10}>10% (대량 발주/고객사 할인)</option>
                    <option value={0.15}>15% (표준 마크업)</option>
                    <option value={0.20}>20% (소량 시제품)</option>
                    <option value={0.25}>25% (난가공 긴급건)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingFeature(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>원가 재계산 중...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>보정값 저장 & 원가 재계산</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
