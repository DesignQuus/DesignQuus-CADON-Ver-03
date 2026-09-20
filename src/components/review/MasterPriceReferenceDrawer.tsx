'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Database,
  Layers,
  Sparkles,
  TrendingUp,
  Check,
  Filter,
  DollarSign,
  Package,
  Wrench,
  Boxes,
  HelpCircle,
  ExternalLink,
  Info
} from 'lucide-react';
import { QuoteReviewLine } from './QuoteLineGrid';
import { apiFetch } from '@/lib/api';

interface MasterPriceReferenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLine: QuoteReviewLine | null;
  onApplyPrice: (price: number, sourceInfo?: string) => void;
}

type TabType = 'PRODUCTS' | 'MATERIALS' | 'PROCESSES' | 'HISTORY';

export default function MasterPriceReferenceDrawer({
  isOpen,
  onClose,
  selectedLine,
  onApplyPrice
}: MasterPriceReferenceDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('PRODUCTS');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // 데이터 상태
  const [loading, setLoading] = useState(false);
  const [productMasters, setProductMasters] = useState<any[]>([]);
  const [materialRates, setMaterialRates] = useState<Record<string, number>>({});
  const [processRates, setProcessRates] = useState<Record<string, number>>({});
  const [historyPrices, setHistoryPrices] = useState<any[]>([]);

  // 초기 로드: 시스템 설정 (소재 시세 및 공정 임률)
  useEffect(() => {
    if (!isOpen) return;

    async function loadSettings() {
      try {
        const res = await apiFetch('/api/admin/masters?type=settings');
        if (res.ok) {
          const json = await res.json();
          if (json.materialRates) setMaterialRates(json.materialRates);
          if (json.processRates) setProcessRates(json.processRates);
        }
      } catch (err) {
        console.error('Failed to load master settings:', err);
      }
    }
    loadSettings();
  }, [isOpen]);

  // 선택된 품목이 바뀌거나 드로어가 열릴 때 검색어 자동 설정
  useEffect(() => {
    if (selectedLine && isOpen) {
      // 품명이나 규격의 핵심 키워드를 초기 검색어로 설정
      const initialQuery = selectedLine.partName || selectedLine.partNo || '';
      setSearchQuery(initialQuery);
    }
  }, [selectedLine?.id, isOpen]);

  // 탭 변경 또는 검색어 변경 시 데이터 로드
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    if (activeTab === 'PRODUCTS') {
      const q = encodeURIComponent(searchQuery.trim());
      const cat = categoryFilter !== 'ALL' ? `&category=${categoryFilter}` : '';
      apiFetch(`/api/admin/masters?type=products&q=${q}${cat}`)
        .then((res) => res.json())
        .then((json) => {
          if (!active) return;
          if (json.items) setProductMasters(json.items);
        })
        .catch((err) => console.error('Product masters load error:', err))
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (activeTab === 'HISTORY') {
      const q = encodeURIComponent(searchQuery.trim() || selectedLine?.partName || '');
      apiFetch(`/api/manual-prices?name=${q}`)
        .then((res) => res.json())
        .then((json) => {
          if (!active) return;
          if (json.manualPrices) setHistoryPrices(json.manualPrices);
        })
        .catch((err) => console.error('History load error:', err))
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [isOpen, activeTab, searchQuery, categoryFilter, selectedLine?.partName]);

  // ESC 키로 드로어 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 현재 선택된 라인의 재질과 매칭 확인
  const selectedMaterialNorm = (selectedLine?.material || '').toUpperCase().trim();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200 font-sans">
      {/* 바깥 배경 클릭 시 닫기 */}
      <div className="flex-1" onClick={onClose} />

      {/* 우측 슬라이드오버 메인 패널 (너비 560px) */}
      <div className="w-[560px] max-w-[90vw] h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* 1. 상단 헤더 */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">사내 마스터 기준 단가표</h2>
                <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-mono font-semibold">
                  CADON Master Price
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                표준 부품, 소재 시세, 가공 임률 및 과거 수주 실적 실시간 참고
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. 현재 작업 중인 견적 라인 요약 바 */}
        {selectedLine && (
          <div className="bg-blue-50/70 border-b border-blue-100 px-5 py-2.5 flex items-center justify-between text-xs shrink-0">
            <div className="space-y-0.5 min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-blue-900 truncate">
                  [No.{selectedLine.itemNo}] {selectedLine.partName}
                </span>
                <span className="text-[11px] font-mono text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                  {selectedLine.partNo}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-2">
                <span>재질: <strong className="text-slate-800">{selectedLine.material || '미지정'}</strong></span>
                <span>•</span>
                <span>규격: <strong className="text-slate-800">{selectedLine.specification || '-'}</strong></span>
                <span>•</span>
                <span>수량: <strong className="text-slate-800">{selectedLine.quantity} EA</strong></span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-500">현재 적용 단가</div>
              <div className="text-sm font-bold font-mono text-blue-700">
                ₩{selectedLine.supplyPrice.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* 3. 4대 마스터 탭 네비게이션 */}
        <div className="border-b border-slate-200 px-4 bg-white flex gap-1 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'PRODUCTS'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>표준 부품 ({productMasters.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('MATERIALS')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'MATERIALS'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>원자재 시세 (kg)</span>
          </button>

          <button
            onClick={() => setActiveTab('PROCESSES')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'PROCESSES'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>공정별 임률</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>과거 수주 실적</span>
          </button>
        </div>

        {/* 4. 검색 & 필터 바 (탭별 적용) */}
        {(activeTab === 'PRODUCTS' || activeTab === 'HISTORY') && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex gap-2 items-center shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'PRODUCTS'
                    ? '품명, 도면번호, 재질, 규격 검색...'
                    : '품명 또는 규격으로 과거 수주 이력 검색...'
                }
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {activeTab === 'PRODUCTS' && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">전체 유형</option>
                <option value="MACHINING">기계가공</option>
                <option value="SHEET_METAL">판금/제관</option>
                <option value="CASTING">주조/주물</option>
                <option value="COMMERCIAL">상용구매품</option>
                <option value="ELECTRICAL">전장품</option>
                <option value="ASSEMBLY">조립품</option>
              </select>
            )}
          </div>
        )}

        {/* 5. 탭 본문 내용 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* ==================== [탭 1: 표준 부품 단가표] ==================== */}
          {activeTab === 'PRODUCTS' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>사내 등록 표준 품목 및 기준 공급가</span>
                <span className="text-[11px]">총 {productMasters.length}건 검색됨</span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">마스터 단가표 조회 중...</div>
              ) : productMasters.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  검색 결과와 일치하는 표준 부품 마스터가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {productMasters.map((item) => {
                    const isMatMatch =
                      selectedMaterialNorm &&
                      (item.material || '').toUpperCase().includes(selectedMaterialNorm);

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isMatMatch
                            ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-200'
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs">
                                {item.standard_name}
                              </span>
                              <span className="font-mono text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                {item.master_code}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                                {item.category || '가공품'}
                              </span>
                              {isMatMatch && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold flex items-center gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" /> 재질일치
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                              <span>재질: <strong className="text-slate-800">{item.material || '-'}</strong></span>
                              <span>•</span>
                              <span>규격: <strong className="text-slate-800">{item.specification || '-'}</strong></span>
                              <span>•</span>
                              <span>단위: {item.unit || 'EA'}</span>
                            </div>
                          </div>

                          {/* 단가 및 적용 버튼 */}
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold font-mono text-blue-700">
                              ₩{Number(item.unit_price || 0).toLocaleString()}
                            </div>
                            <button
                              onClick={() => onApplyPrice(Number(item.unit_price || 0), `마스터[${item.master_code}]`)}
                              className="mt-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                              title="현재 선택된 견적 행의 단가로 적용합니다"
                            >
                              <Check className="w-3 h-3" />
                              <span>단가 적용</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==================== [탭 2: 원자재 kg 기준 시세표] ==================== */}
          {activeTab === 'MATERIALS' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <div className="font-bold">원자재 kg당 공식 기준 시세</div>
                  <div>
                    소재 원가 = [가로 × 세로 × 두께 × 재질 비중(철: 7.85, 알루미늄: 2.7) ÷ 1,000,000] × kg당 단가
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">재질 분류</th>
                      <th className="py-2.5 px-3">강종 / 재질 코드</th>
                      <th className="py-2.5 px-3 text-right">기준 시세 (원/kg)</th>
                      <th className="py-2.5 px-3 text-center">현재 매칭</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {Object.entries(materialRates).map(([matKey, rate]) => {
                      const isMatched =
                        selectedMaterialNorm &&
                        (selectedMaterialNorm.includes(matKey) || matKey.includes(selectedMaterialNorm));

                      return (
                        <tr
                          key={matKey}
                          className={`transition-colors ${
                            isMatched
                              ? 'bg-amber-100/70 font-semibold'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500">
                            {matKey.startsWith('SS') || matKey.startsWith('S45')
                              ? '탄소강'
                              : matKey.startsWith('SUS')
                              ? '스테인리스'
                              : matKey.startsWith('AL')
                              ? '알루미늄'
                              : matKey.startsWith('FC')
                              ? '주철/주물'
                              : matKey.includes('NYLON') || matKey.includes('POM')
                              ? '엔지니어링 플라스틱'
                              : '합금강/공구강'}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {matKey}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                            ₩{rate.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isMatched ? (
                              <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold">
                                일치
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== [탭 3: 공정별 임률표] ==================== */}
          {activeTab === 'PROCESSES' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  사내 공정 가공비 및 외주 표준 임률표입니다. 가공비 = (소요 시간 × 시간당 임률) 또는 (절단 길이 × m당 단가) 등으로 산출됩니다.
                </div>
              </div>

              {/* 1. 기계 절삭 가공 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                  <Wrench className="w-3.5 h-3.5 text-blue-600" />
                  <span>기계 가공 (절삭/밀링/선반)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">CNC 머시닝센터 (MCT)</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['HOURLY_MACHINE_RATE'] || 45000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 시간</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">범용 선반 / 밀링 (Lathe)</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['HOURLY_LATHE_RATE'] || 40000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 시간</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">5축 가공 / 방전 가공 (EDM)</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['HOURLY_5AXIS_EDM_RATE'] || 65000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 시간</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">기계가공 준비 셋업 기본료</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['SETUP_BASE_COST'] || 30000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 건</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. 판금 / 제관 가공 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>판금 / 레이저 / 절곡 / 제관</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">레이저 외곽 절단 (Laser)</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['SHEET_LASER_PER_METER'] || 1800).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ m당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">V-Bending 절곡 가공비</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['SHEET_BEND_PER_STROKE'] || 800).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 1회 타당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">레이저 피어싱 홀 타공</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['SHEET_PIERCING_RATE'] || 80).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 홀당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">제관 TIG / CO2 용접 임률</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['HOURLY_WELDING_RATE'] || 38000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 시간</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. 표면처리 / 후처리 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>표면처리 / 도장 / 아노다이징</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">분체 / 우레탄 도장</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['PAINTING_PER_SQM'] || 9000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ ㎡당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">알루미늄 아노다이징</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['ANODIZING_PER_UNIT'] || 1500).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 개당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">열처리 (Q/T, 고주파)</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['HEAT_TREATMENT_PER_KG'] || 1200).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ kg당</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-100">
                    <div className="text-slate-500 text-[11px]">외주 최소 로트 기본료</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      ₩{(processRates['TREATMENT_MIN_LOT_COST'] || 30000).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">/ 건</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== [탭 4: 과거 수주 실적 지식풀] ==================== */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>과거 실제 고객사 수주 및 승인 완료 단가 이력</span>
                <span className="text-[11px]">총 {historyPrices.length}건</span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">수주 실적 데이터 조회 중...</div>
              ) : historyPrices.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  과거 수주 실적 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyPrices.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs">
                            {item.item_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                            수주완료
                          </span>
                          {item.company_name && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                              {item.company_name}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                          <span>재질: <strong className="text-slate-800">{item.material || '-'}</strong></span>
                          <span>•</span>
                          <span>규격: <strong className="text-slate-800">{item.specification || '-'}</strong></span>
                          {item.approval_count && (
                            <>
                              <span>•</span>
                              <span>승인 {item.approval_count}회</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 단가 및 적용 */}
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold font-mono text-emerald-700">
                          ₩{Number(item.unit_price || 0).toLocaleString()}
                        </div>
                        <button
                          onClick={() => onApplyPrice(Number(item.unit_price || 0), `수주이력[${item.item_name}]`)}
                          className="mt-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                          title="과거 수주 단가를 현재 라인에 적용합니다"
                        >
                          <Check className="w-3 h-3" />
                          <span>단가 채택</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. 드로어 하단 툴바 */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-700">도움말:</span>
            <span>단가표의 [단가 적용] 버튼을 누르면 현재 선택된 행의 공급단가에 즉시 반영됩니다.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-semibold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
