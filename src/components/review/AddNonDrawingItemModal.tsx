'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Plus,
  Truck,
  Package,
  Palette,
  Wrench,
  FileCheck,
  Zap,
  Check,
  Building2,
  Sparkles,
  RefreshCw,
  Sliders,
  DollarSign
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface NewNonDrawingItemPayload {
  partNo: string;
  partName: string;
  partType: 'MACHINING' | 'SHEET_METAL' | 'CASTING' | 'COMMERCIAL' | 'ELECTRICAL' | 'ASSEMBLY';
  specification: string;
  material: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitCost?: number;
  remark: string;
  masterId?: string;
  priceSource?: string;
}

interface AddNonDrawingItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: NewNonDrawingItemPayload) => Promise<void>;
  caseId: string;
}

// ⚡ 자주 쓰는 견적 부대비용 프리셋
const COST_PRESETS = [
  {
    icon: Truck,
    label: '전국 화물 운송비',
    partNo: 'EXP-TRANS-01',
    partName: '전국 화물 운송비',
    partType: 'COMMERCIAL' as const,
    specification: '5톤 윙바디 / 전국권',
    material: '-',
    unit: '식',
    defaultPrice: 150000,
    remark: '[부대비용] 제품 운송 및 하역 운임'
  },
  {
    icon: Package,
    label: '수출/방청 목재 포장비',
    partNo: 'EXP-PACK-01',
    partName: '수출형 목재 포장비',
    partType: 'COMMERCIAL' as const,
    specification: '열처리 목재 파렛트 / 진공 래핑',
    material: 'WOOD',
    unit: '식',
    defaultPrice: 80000,
    remark: '[부대비용] 습기 방지 및 장거리 운송 포장'
  },
  {
    icon: Palette,
    label: '표면처리/도금비 (일괄)',
    partNo: 'EXP-TREAT-01',
    partName: '표면처리/도금비 (일괄)',
    partType: 'SHEET_METAL' as const,
    specification: '경질 크롬 도금 / 아노다이징',
    material: '-',
    unit: '식',
    defaultPrice: 50000,
    remark: '[부대비용] 외주 표면처리 로트 기본 비용'
  },
  {
    icon: Wrench,
    label: '조립 및 현장 시운전 공임',
    partNo: 'EXP-ASSY-01',
    partName: '조립 및 시운전 공임',
    partType: 'ASSEMBLY' as const,
    specification: '기구 조립 / 치수 검사 / 현장 세팅',
    material: '-',
    unit: '식',
    defaultPrice: 250000,
    remark: '[부대비용] 2인 1조 현장 시운전 기술공임'
  },
  {
    icon: FileCheck,
    label: '공인 검사/시험성적서',
    partNo: 'EXP-TEST-01',
    partName: '공인 시험성적서 발급비',
    partType: 'COMMERCIAL' as const,
    specification: 'KOLAS 3차원 정밀 측정 성적서',
    material: '-',
    unit: '건',
    defaultPrice: 35000,
    remark: '[부대비용] 공인기관 품질 보증서'
  },
  {
    icon: Zap,
    label: '레이저 마킹/각인비',
    partNo: 'EXP-MARK-01',
    partName: '레이저 각인 및 네임플레이트',
    partType: 'MACHINING' as const,
    specification: '품번/로고 정밀 마킹',
    material: 'SUS304',
    unit: '식',
    defaultPrice: 20000,
    remark: '[부대비용] 부품 식별 레이저 마킹'
  }
];

export default function AddNonDrawingItemModal({
  isOpen,
  onClose,
  onAddItem,
  caseId
}: AddNonDrawingItemModalProps) {
  const [activeTab, setActiveTab] = useState<'MASTER' | 'PRESET' | 'MANUAL'>('PRESET');
  const [submitting, setSubmitting] = useState(false);

  // 사내 마스터 검색 관련 상태
  const [masterSearch, setMasterSearch] = useState('');
  const [masters, setMasters] = useState<any[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);

  // 폼 입력 상태
  const [formData, setFormData] = useState<NewNonDrawingItemPayload>({
    partNo: '',
    partName: '',
    partType: 'COMMERCIAL',
    specification: '',
    material: 'SS400',
    quantity: 1,
    unit: 'EA',
    unitPrice: 0,
    unitCost: 0,
    remark: '',
    priceSource: 'MANUAL_INPUT'
  });

  // 사내 마스터 로드
  useEffect(() => {
    if (!isOpen) return;
    async function fetchMasters() {
      setLoadingMasters(true);
      try {
        const res = await apiFetch('/api/admin/masters?type=products&onlyPriced=true');
        if (res.ok) {
          const json = await res.json();
          setMasters(json.items || []);
        }
      } catch (e) {
        console.error('Failed to load masters:', e);
      } finally {
        setLoadingMasters(false);
      }
    }
    fetchMasters();
  }, [isOpen]);

  // 마스터 필터링
  const filteredMasters = useMemo(() => {
    if (!masterSearch.trim()) return masters.slice(0, 10);
    const q = masterSearch.toLowerCase();
    return masters
      .filter((m) =>
        (m.standard_name && m.standard_name.toLowerCase().includes(q)) ||
        (m.master_code && m.master_code.toLowerCase().includes(q)) ||
        (m.specification && m.specification.toLowerCase().includes(q)) ||
        (m.material && m.material.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [masters, masterSearch]);

  if (!isOpen) return null;

  // 프리셋 선택 핸들러
  const handleSelectPreset = (preset: typeof COST_PRESETS[0]) => {
    setFormData({
      partNo: preset.partNo,
      partName: preset.partName,
      partType: preset.partType,
      specification: preset.specification,
      material: preset.material,
      quantity: 1,
      unit: preset.unit,
      unitPrice: preset.defaultPrice,
      unitCost: Math.round(preset.defaultPrice * 0.82),
      remark: preset.remark,
      priceSource: 'COST_PRESET'
    });
    setActiveTab('MANUAL');
  };

  // 마스터 선택 핸들러
  const handleSelectMaster = (pm: any) => {
    const price = Number(pm.unit_price) || 0;
    setFormData({
      partNo: pm.master_code || `PM-${pm.id.slice(0, 6)}`,
      partName: pm.standard_name,
      partType: (pm.category as any) || 'COMMERCIAL',
      specification: pm.specification || '-',
      material: pm.material || '-',
      quantity: 1,
      unit: pm.unit || 'EA',
      unitPrice: price,
      unitCost: Math.round(price * 0.82),
      remark: `[사내 마스터 채택] ${pm.standard_name}`,
      masterId: pm.id,
      priceSource: 'MASTER_MATCH'
    });
    setActiveTab('MANUAL');
  };

  // 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partName.trim()) {
      alert('품명을 입력해 주세요.');
      return;
    }
    if (formData.unitPrice < 0) {
      alert('단가는 0원 이상이어야 합니다.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: NewNonDrawingItemPayload = {
        ...formData,
        partNo: formData.partNo.trim() || `ETC-${Date.now().toString(36).toUpperCase()}`,
        specification: formData.specification.trim() || '-',
        material: formData.material.trim() || '-',
        quantity: Math.max(1, Number(formData.quantity) || 1),
        unitPrice: Number(formData.unitPrice) || 0,
        unitCost: formData.unitCost || Math.round((Number(formData.unitPrice) || 0) * 0.82)
      };

      await onAddItem(payload);
      onClose();
    } catch (err: any) {
      alert('품목 추가 중 오류가 발생했습니다: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = (Number(formData.quantity) || 1) * (Number(formData.unitPrice) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* 모달 헤더 */}
        <div className="px-6 py-4 bg-linear-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>비도면 품목 직접 추가</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 font-normal">
                  도면 외 부품 · 부대비용
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                도면에 누락된 사내 표준품, 운송/포장 등 부대비용을 견적서에 직접 추가합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('PRESET')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'PRESET'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>부대비용 퀵 추가 (6종)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MASTER')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'MASTER'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>사내 마스터 부품 검색 ({masters.length}건)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANUAL')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'MANUAL'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>자유 직접 입력 / 수정</span>
          </button>
        </div>

        {/* 탭 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: 부대비용 퀵 추가 */}
          {activeTab === 'PRESET' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600 font-medium">
                자주 사용되는 필수 부대비용을 1-클릭으로 바로 선택하여 견적에 포함할 수 있습니다:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {COST_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.partNo}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="p-3.5 text-left rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/40 transition-all shadow-2xs group cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">
                              {preset.label}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {preset.partNo}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-indigo-600">
                          ₩{preset.defaultPrice.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">{preset.specification}</span>
                        <span className="text-indigo-600 font-semibold shrink-0 ml-2 group-hover:underline">
                          선택 및 수정 →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: 사내 마스터 품목 검색 */}
          {activeTab === 'MASTER' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={masterSearch}
                  onChange={(e) => setMasterSearch(e.target.value)}
                  placeholder="표준품명, 마스터코드, 규격 검색 (예: LM가이드, 볼트, SS400)..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {loadingMasters ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>사내 표준 마스터 단가표 로딩 중...</span>
                </div>
              ) : filteredMasters.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  일치하는 사내 마스터 부품이 없습니다.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {filteredMasters.map((pm) => (
                    <div
                      key={pm.id}
                      className="p-3 flex items-center justify-between hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {pm.standard_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                            {pm.master_code || '-'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          규격: {pm.specification || '-'} | 재질: {pm.material || '-'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono font-bold text-blue-700">
                          ₩{Number(pm.unit_price || 0).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSelectMaster(pm)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md shadow-2xs transition-colors cursor-pointer"
                        >
                          선택
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 자유 직접 입력 폼 */}
          {activeTab === 'MANUAL' && (
            <form onSubmit={handleSubmit} id="non-drawing-form" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 도번 / 품번 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    도면번호 / 식별코드
                  </label>
                  <input
                    type="text"
                    value={formData.partNo}
                    onChange={(e) => setFormData({ ...formData, partNo: e.target.value })}
                    placeholder="예: EXP-TRANS-01 또는 MISUMI-B01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">미입력 시 자동 코드가 부여됩니다.</p>
                </div>

                {/* 부품 유형 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    부품/비용 분류
                  </label>
                  <select
                    value={formData.partType}
                    onChange={(e) => setFormData({ ...formData, partType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="COMMERCIAL">규격철물 / 외주부품 / 운송비</option>
                    <option value="MACHINING">기계가공품</option>
                    <option value="SHEET_METAL">판금 / 제관 / 표면처리</option>
                    <option value="CASTING">주조품</option>
                    <option value="ELECTRICAL">전장품 / 센서 / 모터</option>
                    <option value="ASSEMBLY">조립품 / 현장 공임</option>
                  </select>
                </div>

                {/* 품명 (필수) */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    품명 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.partName}
                    onChange={(e) => setFormData({ ...formData, partName: e.target.value })}
                    placeholder="예: 전국 화물 운송비, LM가이드 레일, 수출용 목재 포장비..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* 규격 / 사양 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    규격 / 사양
                  </label>
                  <input
                    type="text"
                    value={formData.specification}
                    onChange={(e) => setFormData({ ...formData, specification: e.target.value })}
                    placeholder="예: 5톤 윙바디, Ø25x150, 100x80x15 등"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* 재질 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    재질
                  </label>
                  <input
                    type="text"
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="예: SS400, SUS304, - (비용인 경우 -)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* 수량 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    수량 <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      required
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="단위 (EA, 식, SET)"
                      className="w-24 px-2 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* 공급 단가 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    공급단가 (원) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₩</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      required
                      value={formData.unitPrice}
                      onChange={(e) => {
                        const price = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setFormData({
                          ...formData,
                          unitPrice: price,
                          unitCost: Math.round(price * 0.82)
                        });
                      }}
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* 비고 */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    비고 / 메모
                  </label>
                  <input
                    type="text"
                    value={formData.remark}
                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                    placeholder="예: 고객 요청 추가 항목, 긴급 퀵 화물 운송 등"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* 모달 하단 푸터 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">추가 공급가액:</span>
            <span className="text-base font-mono font-bold text-blue-700">
              ₩{totalAmount.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400">
              ({formData.quantity} {formData.unit} × ₩{(Number(formData.unitPrice) || 0).toLocaleString()})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              form="non-drawing-form"
              onClick={activeTab !== 'MANUAL' ? () => setActiveTab('MANUAL') : undefined}
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{activeTab !== 'MANUAL' ? '품목 정보 확인 및 추가 →' : '견적서에 즉시 추가'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
