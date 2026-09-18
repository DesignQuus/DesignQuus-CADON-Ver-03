'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Database, Plus, Upload, Search, Download, Trash2, CheckCircle2,
  RefreshCw, FileSpreadsheet, ArrowLeft, Sliders, DollarSign,
  AlertCircle, Layers, X, Scissors, Flame, Sparkles, Wrench, Percent, Factory, ShieldCheck
} from 'lucide-react';

const MATERIAL_NAMES: Record<string, string> = {
  'SS400': '일반구조용 탄소강',
  'S45C': '기계구조용 탄소강',
  'SCM440': '크롬몰리브덴강 (열처리용)',
  'SUS304': '스테인리스강 (일반내식)',
  'SUS316': '스테인리스강 (고내식/내약품)',
  'AL6061': '알루미늄 합금 (가공용)',
  'AL5052': '알루미늄 판재 (절곡용)',
  'FC250': '회주철 (기계베이스/하우징 주물)',
  'FCD450': '구상흑연주철 (고강도 주물)',
  'SKD11': '냉간금형용 합금공구강',
  'BsBM': '쾌삭 황동 / 동합금',
  'MC-NYLON': 'MC 나일론 (엔지니어링 플라스틱)',
  'POM': '아세탈 (POM 폴리아세탈)'
};

interface MasterProduct {
  id: string;
  master_code: string;
  standard_name: string;
  category: string;
  specification: string;
  material: string;
  unit: string;
  unit_price: number;
  price_type: string;
  created_at: string;
}

export default function MasterDataManagerPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'settings'>('products');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MasterProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // New Item Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('MACHINING');
  const [newSpec, setNewSpec] = useState('');
  const [newMaterial, setNewMaterial] = useState('SS400');
  const [newPrice, setNewPrice] = useState<number>(0);
  const [savingItem, setSavingItem] = useState(false);

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedPreview, setImportedPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<{
    total: number;
    machining: number;
    sheetMetal: number;
    casting: number;
    commercial: number;
    electrical: number;
    assembly: number;
  }>({ total: 0, machining: 0, sheetMetal: 0, casting: 0, commercial: 0, electrical: 0, assembly: 0 });

  // Settings State
  const [materialRates, setMaterialRates] = useState<Record<string, number>>({});
  const [processRates, setProcessRates] = useState<Record<string, number>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/masters?q=${encodeURIComponent(searchTerm)}&category=${categoryFilter}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setStats(data.stats || { total: 0, machining: 0, sheetMetal: 0, casting: 0, commercial: 0, electrical: 0, assembly: 0 });
      }

      const settingsRes = await apiFetch('/api/admin/masters?type=settings');
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setMaterialRates(sData.materialRates || {});
        setProcessRates(sData.processRates || {});
      }
    } catch (e) {
      console.error('Failed to load masters:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [categoryFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      alert('품목 코드와 품명은 필수 입력 항목입니다.');
      return;
    }

    setSavingItem(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_product',
          master_code: newCode,
          standard_name: newName,
          category: newCategory,
          specification: newSpec,
          material: newMaterial,
          unit_price: newPrice
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewCode('');
        setNewName('');
        setNewSpec('');
        setNewPrice(0);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '품목 등록에 실패했습니다.');
      }
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (id: string, code: string) => {
    if (!confirm(`정말로 마스터 품목 [${code}]을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/admin/masters?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(it => it.id !== id));
      } else {
        alert('삭제 실패');
      }
    } catch (e) {
      alert('삭제 중 오류 발생');
    }
  };

  // CSV/Excel Parse Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        alert('헤더 외에 데이터 행이 존재하지 않습니다.');
        return;
      }

      // 첫 줄 헤더 분석
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      const parsedRows: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length === 0 || !cols[0]) continue;

        const row: any = {};
        headers.forEach((h, idx) => {
          row[h] = cols[idx] || '';
        });
        parsedRows.push(row);
      }

      setImportedPreview(parsedRows);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (importedPreview.length === 0) return;
    setImporting(true);

    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_import',
          items: importedPreview
        })
      });

      if (res.ok) {
        const result = await res.json();
        alert(`총 ${result.count}건의 마스터 품목이 성공적으로 데이터베이스에 적재되었습니다.`);
        setShowImportModal(false);
        setImportedPreview([]);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '대량 일괄 업로드 실패');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          materialRates,
          processRates
        })
      });

      if (res.ok) {
        alert('소재 시세 및 공정 임률 설정이 안전하게 저장되었습니다.');
      } else {
        alert('설정 저장 실패');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-2xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link href="/cases" className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Database className="w-5 h-5" />
              </span>
              <h1 className="text-lg font-bold text-slate-900">기준정보(마스터) 관리 센터</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              사내 공인 표준 부품, 단가표, 소재 시세 및 가공 임률을 등록하고 관리합니다.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'products' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>표준 품목 및 단가 대장</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'settings' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>소재 시세 & 가공 임률 설정</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'products' ? (
          <>
            {/* Top Stat Cards: 6대 실무 분류 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-slate-500 block">전체 마스터</span>
                <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{stats.total.toLocaleString()}개</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-blue-600 block">기계 가공품</span>
                <span className="text-xl font-black text-blue-700 font-mono mt-0.5 block">{stats.machining.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-cyan-600 block">판금/제관품</span>
                <span className="text-xl font-black text-cyan-700 font-mono mt-0.5 block">{stats.sheetMetal.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-orange-600 block">주조/주물품</span>
                <span className="text-xl font-black text-orange-700 font-mono mt-0.5 block">{stats.casting.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-emerald-600 block">규격 철물</span>
                <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">{stats.commercial.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-purple-600 block">전장/공압품</span>
                <span className="text-xl font-black text-purple-700 font-mono mt-0.5 block">{stats.electrical.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-indigo-600 block">조립품(모듈)</span>
                <span className="text-xl font-black text-indigo-700 font-mono mt-0.5 block">{stats.assembly.toLocaleString()}종</span>
              </div>
            </div>

            {/* Toolbar: Search, Filters, Actions */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <form onSubmit={handleSearch} className="flex items-center space-x-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="품목코드, 품명, 규격, 재질 검색..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  검색
                </button>
              </form>

              {/* Category Filter Chips (6대 실무 분류) */}
              <div className="flex items-center flex-wrap gap-1 text-xs">
                {[
                  { id: 'ALL', label: '전체' },
                  { id: 'MACHINING', label: '가공품' },
                  { id: 'SHEET_METAL', label: '판금/제관' },
                  { id: 'CASTING', label: '주조품' },
                  { id: 'COMMERCIAL', label: '규격철물' },
                  { id: 'ELECTRICAL', label: '전장/공압' },
                  { id: 'ASSEMBLY', label: '조립품' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      categoryFilter === cat.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>엑셀 일괄 업로드</span>
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>신규 품목 등록</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 w-12 text-center">No</th>
                    <th className="p-3 w-36">마스터 코드</th>
                    <th className="p-3">표준 품명</th>
                    <th className="p-3 w-36">규격 (Spec)</th>
                    <th className="p-3 w-28 text-center">재질</th>
                    <th className="p-3 w-28 text-center">부품 유형</th>
                    <th className="p-3 w-32 text-right">공인 기준단가</th>
                    <th className="p-3 w-16 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        기준정보 데이터를 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        등록된 마스터 품목이 없습니다. 상단 [신규 품목 등록] 또는 [엑셀 일괄 업로드]를 진행해 주세요.
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{it.master_code}</td>
                        <td className="p-3 font-medium text-slate-900">{it.standard_name}</td>
                        <td className="p-3 font-mono text-slate-600">{it.specification || '-'}</td>
                        <td className="p-3 text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px]">
                            {it.material || 'SS400'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            it.category === 'MACHINING' ? 'bg-blue-100 text-blue-800' :
                            it.category === 'SHEET_METAL' ? 'bg-cyan-100 text-cyan-800' :
                            it.category === 'CASTING' ? 'bg-orange-100 text-orange-800' :
                            it.category === 'COMMERCIAL' ? 'bg-emerald-100 text-emerald-800' :
                            it.category === 'ELECTRICAL' ? 'bg-purple-100 text-purple-800' :
                            it.category === 'ASSEMBLY' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {it.category === 'MACHINING' ? '가공품' :
                             it.category === 'SHEET_METAL' ? '판금/제관' :
                             it.category === 'CASTING' ? '주조품' :
                             it.category === 'COMMERCIAL' ? '규격철물' :
                             it.category === 'ELECTRICAL' ? '전장/공압' :
                             it.category === 'ASSEMBLY' ? '조립품' : (it.category || '미분류')}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-blue-700 text-sm">
                          {it.unit_price > 0 ? `₩${it.unit_price.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteItem(it.id, it.master_code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* Tab 2: Settings (소재 시세 & 임률 설정) */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">공학 표준 원가 기초 파라미터 설정</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  마스터에 없는 신규 부품 견적 시, 도면 치수와 결합되어 표준 원가를 자동 계산하는 사내 공인 기준표입니다.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>설정 저장</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 좌측: 소재별 시세 (5 cols) */}
              <div className="lg:col-span-5 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>소재별 kg당 기준 시세 (원/kg)</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">총 {Object.keys(materialRates).length}개 강종</span>
                </div>
                <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {Object.entries(materialRates).map(([mat, rate]) => (
                    <div key={mat} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-xs hover:border-slate-300 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-slate-800">{mat}</span>
                        <span className="text-[10px] text-slate-400">{MATERIAL_NAMES[mat] || '일반 금속/수지재'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-slate-400 font-mono">₩</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={(e) => setMaterialRates({ ...materialRates, [mat]: Number(e.target.value) })}
                          className="w-24 text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500 bg-slate-50 focus:bg-white"
                        />
                        <span className="text-slate-500 text-[11px]">/kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 우측: 공정별 가공 임률 및 표준 원가 파라미터 (7 cols) */}
              <div className="lg:col-span-7 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>제조업 공정별 표준 가공 임률 & 파라미터</span>
                </h3>

                <div className="space-y-3.5 max-h-[640px] overflow-y-auto pr-1">
                  {/* 1. 기계 가공 (절삭) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 pb-1 border-b border-blue-50">
                      <Factory className="w-3.5 h-3.5 text-blue-600" />
                      <span>1. 기계 가공 (절삭 / 선반 / 밀링)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">CNC / 머시닝센터 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_MACHINE_RATE'] || 45000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_MACHINE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">범용 선반 / 밀링 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_LATHE_RATE'] || 40000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_LATHE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-blue-700 font-medium">가공 준비 셋업 기본료 (소량보전)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SETUP_BASE_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'SETUP_BASE_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-blue-200 rounded px-2 py-1 text-blue-900 bg-blue-50/30 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 판금 / 제관 (Sheet Metal) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-800 pb-1 border-b border-cyan-50">
                      <Scissors className="w-3.5 h-3.5 text-cyan-600" />
                      <span>2. 판금 / 제관 (레이저 절단 / 피어싱 / 절곡 / 용접)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">레이저 외곽 절단 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_LASER_PER_METER'] || 1800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_LASER_PER_METER': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/m</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-cyan-700 font-medium">레이저 피어싱(홀당) 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_PIERCING_RATE'] || 80}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_PIERCING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-cyan-200 rounded px-2 py-1 text-cyan-900 bg-cyan-50/30 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/홀</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">절곡(Bending) 1회 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_BEND_PER_STROKE'] || 800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_BEND_PER_STROKE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/회</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">제관 용접 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_WELDING_RATE'] || 38000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_WELDING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 주조 / 주물 (Casting) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 pb-1 border-b border-amber-50">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      <span>3. 주조 / 주물 (형상 성형 및 주물 가공)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">주조 형상 성형 kg당 공정비</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['CASTING_PER_KG_RATE'] || 2500}
                            onChange={(e) => setProcessRates({ ...processRates, 'CASTING_PER_KG_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. 후처리 / 열처리 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800 pb-1 border-b border-purple-50">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>4. 표면처리 & 열처리 (도장 / 아노다이징 / 열처리)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">분체도장 ㎡당 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['PAINTING_PER_SQM'] || 9000}
                            onChange={(e) => setProcessRates({ ...processRates, 'PAINTING_PER_SQM': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/㎡</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">아노다이징 개당 기본료</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['ANODIZING_PER_UNIT'] || 1500}
                            onChange={(e) => setProcessRates({ ...processRates, 'ANODIZING_PER_UNIT': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/개</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">열처리(Q/T) kg당 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HEAT_TREATMENT_PER_KG'] || 1200}
                            onChange={(e) => setProcessRates({ ...processRates, 'HEAT_TREATMENT_PER_KG': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/kg</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-purple-700 font-medium">외주 최소 로트 기본료 (소량보전)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['TREATMENT_MIN_LOT_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'TREATMENT_MIN_LOT_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-purple-200 rounded px-2 py-1 text-purple-900 bg-purple-50/30 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. 조달 관리 & 모듈 조립 & 물류 & 마진율 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 pb-1 border-b border-slate-100">
                      <Wrench className="w-3.5 h-3.5 text-slate-600" />
                      <span>5. 조달 관리비율 & 조립 공수 & 물류 & 표준 마진</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">전장/구매품 조달관리율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['ELECTRICAL_OVERHEAD_RATE'] ?? 0.08) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'ELECTRICAL_OVERHEAD_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">%</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">유닛 조립/배선 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_ASSEMBLY_RATE'] || 35000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_ASSEMBLY_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-slate-700 font-medium">포장 및 출하 물류비율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['PACKAGING_SHIPPING_RATE'] ?? 0.03) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'PACKAGING_SHIPPING_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-slate-300 rounded px-2 py-1 text-slate-900 bg-slate-50 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">% (3%)</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">표준 목표 마진율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['DEFAULT_MARGIN_RATE'] ?? 0.18) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'DEFAULT_MARGIN_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-blue-200 rounded px-2 py-1 text-blue-900 bg-blue-50/50 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-blue-600 font-bold text-[11px] shrink-0">% (기준 18%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal 1: Create Single Item */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>신규 마스터 품목 등록</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">마스터 코드 *</label>
                  <input
                    type="text"
                    required
                    placeholder="예: SF-101, MB-001"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">부품 유형</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2"
                  >
                    <option value="MACHINING">가공품 (Machining)</option>
                    <option value="SHEET_METAL">판금/제관품 (Sheet Metal / Weldment)</option>
                    <option value="CASTING">주조품 (Casting)</option>
                    <option value="COMMERCIAL">표준 규격품/철물 (Hardware / Fasteners)</option>
                    <option value="ELECTRICAL">전장/공압/구동품 (Electric & Pneumatic)</option>
                    <option value="ASSEMBLY">조립품/모듈 (Sub-Assembly)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">표준 품명 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: MOTOR BRACKET, SHAFT"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">규격 (Specification)</label>
                  <input
                    type="text"
                    placeholder="예: 150x120x10T, DIA 25x300L"
                    value={newSpec}
                    onChange={(e) => setNewSpec(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">표준 재질</label>
                  <input
                    type="text"
                    placeholder="예: SS400, AL6061, S45C"
                    value={newMaterial}
                    onChange={(e) => setNewMaterial(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">공인 기준단가 (원)</label>
                <input
                  type="number"
                  placeholder="예: 45000"
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg p-2 font-mono text-blue-700 font-bold"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                >
                  {savingItem ? '저장 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Bulk Import */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>엑셀/CSV 마스터 단가 대량 일괄 등록</span>
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                사내에서 관리 중인 표준 단가표 파일(.csv)을 선택하세요. 첫 번째 행에 <strong>품목코드, 품명, 규격, 재질, 기준단가</strong> 열이 포함되어야 합니다.
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleFileChange}
                className="w-full p-3 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer"
              />

              {importedPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>미리보기 ({importedPreview.length}건 감지됨)</span>
                  </div>
                  <div className="max-h-56 overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2">품목코드</th>
                          <th className="p-2">품명</th>
                          <th className="p-2">규격</th>
                          <th className="p-2">재질</th>
                          <th className="p-2 text-right">단가</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedPreview.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            <td className="p-2 font-mono">{row.master_code || row['품목코드'] || row['도면번호']}</td>
                            <td className="p-2">{row.standard_name || row['품명']}</td>
                            <td className="p-2 font-mono">{row.specification || row['규격']}</td>
                            <td className="p-2">{row.material || row['재질']}</td>
                            <td className="p-2 text-right font-mono font-bold text-blue-700">
                              ₩{Number(row.unit_price || row['기준단가'] || row['단가'] || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importedPreview.length > 10 && (
                    <span className="text-[10px] text-slate-400 block text-right">외 {importedPreview.length - 10}건 생략...</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={importing || importedPreview.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {importing ? '적재 중...' : `${importedPreview.length}건 DB로 적재하기`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
