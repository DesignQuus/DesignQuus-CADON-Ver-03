'use client';

import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Search, 
  Download, 
  Plus, 
  Wrench, 
  Tag, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CadBlockItem } from './BlockInspectorDrawer';

interface BlockSheetTableProps {
  caseId: string;
  blocks: CadBlockItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onBomItemAdded?: () => void;
}

export default function BlockSheetTable({
  caseId,
  blocks = [],
  isLoading = false,
  onRefresh,
  onBomItemAdded
}: BlockSheetTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'HARDWARE' | 'ATTRIBUTE' | 'DYNAMIC'>('ALL');
  const [selectedBlockNames, setSelectedBlockNames] = useState<Set<string>>(new Set());
  const [isAddingBom, setIsAddingBom] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'count' | 'type'>('count');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter & Sort
  const filteredBlocks = useMemo(() => {
    let result = blocks.filter((b) => {
      if (filterType === 'HARDWARE' && !b.is_hardware) return false;
      if (filterType === 'ATTRIBUTE' && b.type !== 'ATTRIBUTE') return false;
      if (filterType === 'DYNAMIC' && !b.is_dynamic && b.type !== 'DYNAMIC') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = b.name.toLowerCase().includes(q);
        const matchesLayer = b.layers.some(l => l.toLowerCase().includes(q));
        const matchesAttrib = Object.entries(b.sample_attributes).some(
          ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
        );
        return matchesName || matchesLayer || matchesAttrib;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'count') {
        cmp = a.count - b.count;
      } else if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === 'type') {
        cmp = a.type.localeCompare(b.type);
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [blocks, filterType, searchQuery, sortField, sortAsc]);

  const handleToggleSelect = (name: string) => {
    const next = new Set(selectedBlockNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedBlockNames(next);
  };

  const handleSelectAll = () => {
    if (selectedBlockNames.size === filteredBlocks.length) {
      setSelectedBlockNames(new Set());
    } else {
      setSelectedBlockNames(new Set(filteredBlocks.map(b => b.name)));
    }
  };

  const handleAddSelectedToBom = async (targetBlocks?: CadBlockItem[]) => {
    const toAdd = targetBlocks || blocks.filter(b => selectedBlockNames.has(b.name));
    if (toAdd.length === 0) return;

    setIsAddingBom(true);
    try {
      const itemsPayload = toAdd.map(b => {
        const spec = b.sample_attributes['SPEC'] || b.sample_attributes['규격'] || b.sample_attributes['SIZE'] || '-';
        const mat = b.sample_attributes['MAT'] || b.sample_attributes['재질'] || (b.is_hardware ? '구매품/하드웨어' : '가공품');
        return {
          name: b.name,
          count: b.count,
          spec,
          material: mat
        };
      });

      const res = await fetch(`/api/quotation-cases/${caseId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD_TO_BOM',
          items: itemsPayload
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.added_count}개 부품이 견적 BOM 대장에 추가되었습니다.`);
        setSelectedBlockNames(new Set());
        if (onBomItemAdded) onBomItemAdded();
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || 'BOM 추가 실패');
      }
    } catch (err: any) {
      alert('오류 발생: ' + err.message);
    } finally {
      setIsAddingBom(false);
    }
  };

  const handleExportExcel = () => {
    if (blocks.length === 0) return;

    const exportRows = blocks.map((b, idx) => ({
      'No': idx + 1,
      '블록 명칭': b.name,
      '블록 유형': b.type === 'ATTRIBUTE' ? '속성 블록' : (b.is_dynamic ? '동적/스마트 블록' : '일반 블록'),
      '도면 내 수량': b.count,
      '구매품 여부': b.is_hardware ? 'O (구매품)' : 'X',
      '사용 레이어': b.layers.join(', '),
      '속성 태그 목록': b.attribute_tags.join(', '),
      '주요 속성 데이터': Object.entries(b.sample_attributes).map(([k, v]) => `${k}=${v}`).join(' | ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CAD_블록_데이터');
    XLSX.writeFile(wb, `CAD_블록_대장_${caseId.slice(-6)}.xlsx`);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden select-none">
      {/* Top Filter Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-600/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>CAD 블록 & 스마트 블록 대장</span>
              <span className="text-xs font-mono font-bold text-teal-300 bg-teal-950 px-2 py-0.5 rounded-full border border-teal-800">
                총 {blocks.length}개 블록 정의
              </span>
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="블록명, 속성값, 레이어 검색..."
              className="bg-slate-950 text-white placeholder-slate-500 text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-hidden focus:border-teal-500 w-48 sm:w-60"
            />
          </div>

          {/* Filter Pills */}
          <div className="inline-flex p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterType === 'ALL' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setFilterType('HARDWARE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center space-x-1 ${
                filterType === 'HARDWARE' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>구매품</span>
            </button>
            <button
              onClick={() => setFilterType('ATTRIBUTE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center space-x-1 ${
                filterType === 'ATTRIBUTE' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>속성블록</span>
            </button>
            <button
              onClick={() => setFilterType('DYNAMIC')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center space-x-1 ${
                filterType === 'DYNAMIC' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>동적블록</span>
            </button>
          </div>

          {/* Excel Export */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-200 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
            title="엑셀 다운로드"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>엑셀 저장</span>
          </button>

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-900/90 text-slate-300 sticky top-0 z-10 border-b border-slate-800 backdrop-blur-md">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredBlocks.length > 0 && selectedBlockNames.size === filteredBlocks.length}
                  onChange={handleSelectAll}
                  className="rounded border-slate-700 text-teal-500 focus:ring-teal-500 bg-slate-950 cursor-pointer"
                />
              </th>
              <th className="p-3 font-bold cursor-pointer hover:text-white" onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}>
                블록 명칭 {sortField === 'name' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="p-3 font-bold cursor-pointer hover:text-white w-32" onClick={() => { setSortField('type'); setSortAsc(!sortAsc); }}>
                유형 {sortField === 'type' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="p-3 font-bold cursor-pointer hover:text-white w-28 text-right" onClick={() => { setSortField('count'); setSortAsc(!sortAsc); }}>
                도면 내 수량 {sortField === 'count' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="p-3 font-bold">주요 속성 (ATTRIB / Parameters)</th>
              <th className="p-3 font-bold w-36">사용 레이어</th>
              <th className="p-3 font-bold w-28 text-center">BOM 연동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-16 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
                  <span>CAD 블록 데이터를 분석 중입니다...</span>
                </td>
              </tr>
            ) : filteredBlocks.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-16 text-center text-slate-500">
                  조건에 일치하는 블록 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredBlocks.map((block) => {
                const isSelected = selectedBlockNames.has(block.name);
                const attribEntries = Object.entries(block.sample_attributes);

                return (
                  <tr
                    key={block.name}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-teal-950/40 text-teal-200'
                        : 'hover:bg-slate-900/50 text-slate-300'
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(block.name)}
                        className="rounded border-slate-700 text-teal-500 focus:ring-teal-500 bg-slate-950 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-bold text-white">
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate max-w-[240px]" title={block.name}>{block.name}</span>
                        {block.is_hardware && (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            구매품
                          </span>
                        )}
                        {block.is_in_bom && (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>등록됨</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {block.type === 'ATTRIBUTE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          속성 블록
                        </span>
                      ) : block.is_dynamic ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          동적 블록
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          일반 블록
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold text-teal-300">
                      {block.count.toLocaleString()} EA
                    </td>
                    <td className="p-3">
                      {attribEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xl">
                          {attribEntries.slice(0, 4).map(([k, v]) => (
                            <span key={k} className="px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800 text-[10.5px]">
                              <span className="text-slate-400">{k}: </span>
                              <span className="text-amber-200">{v}</span>
                            </span>
                          ))}
                          {attribEntries.length > 4 && (
                            <span className="text-slate-500 text-[10px] self-center">
                              +{attribEntries.length - 4}개
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-400 truncate max-w-[140px]" title={block.layers.join(', ')}>
                      {block.layers.slice(0, 2).join(', ')}{block.layers.length > 2 ? ` 외 ${block.layers.length - 2}` : ''}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleAddSelectedToBom([block])}
                        disabled={isAddingBom}
                        className="px-2.5 py-1 bg-teal-950 hover:bg-teal-900 border border-teal-500/60 text-teal-200 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1 mx-auto cursor-pointer"
                        title="견적 BOM에 추가"
                      >
                        <Plus className="w-3 h-3" />
                        <span>BOM추가</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Multi-Select Action Bar */}
      {selectedBlockNames.size > 0 && (
        <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="text-xs text-slate-300">
            <span>선택된 블록: </span>
            <strong className="text-teal-300 font-bold">{selectedBlockNames.size}종</strong>
            <span className="text-slate-400 ml-1">
              (총 {blocks.filter(b => selectedBlockNames.has(b.name)).reduce((sum, b) => sum + b.count, 0)}개)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedBlockNames(new Set())}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              선택 해제
            </button>
            <button
              onClick={() => handleAddSelectedToBom()}
              disabled={isAddingBom}
              className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow-lg"
            >
              {isAddingBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>선택 부품 견적 BOM 일괄 등록</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
