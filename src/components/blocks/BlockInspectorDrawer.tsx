'use client';

import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Tag, 
  Sparkles, 
  Search, 
  X, 
  Plus, 
  Check, 
  Download, 
  Wrench, 
  Layers, 
  ChevronRight, 
  Copy, 
  RefreshCw,
  Sliders,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

export interface CadBlockInstance {
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  layer: string;
  attribs: Record<string, string>;
}

export interface CadBlockItem {
  name: string;
  type: 'ATTRIBUTE' | 'DYNAMIC' | 'STANDARD';
  count: number;
  layers: string[];
  is_dynamic: boolean;
  is_hardware: boolean;
  attribute_tags: string[];
  sample_attributes: Record<string, string>;
  instances: CadBlockInstance[];
  is_in_bom?: boolean;
}

export interface BlockInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  fileId?: string;
  blocks: CadBlockItem[];
  summary: {
    total_insert_count: number;
    unique_block_count: number;
    attribute_block_count: number;
    dynamic_block_count: number;
    standard_block_count: number;
    hardware_candidate_count: number;
  };
  isLoading?: boolean;
  onRefresh?: () => void;
  onBomItemAdded?: () => void;
}

export default function BlockInspectorDrawer({
  isOpen,
  onClose,
  caseId,
  blocks = [],
  summary,
  isLoading = false,
  onRefresh,
  onBomItemAdded
}: BlockInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'ATTRIBUTE' | 'DYNAMIC' | 'HARDWARE'>('HARDWARE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockNames, setSelectedBlockNames] = useState<Set<string>>(new Set());
  const [isAddingBom, setIsAddingBom] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedBlockName, setExpandedBlockName] = useState<string | null>(null);

  // Filtered Blocks
  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      // Tab filter
      if (activeTab === 'ATTRIBUTE' && b.type !== 'ATTRIBUTE') return false;
      if (activeTab === 'DYNAMIC' && !b.is_dynamic && b.type !== 'DYNAMIC') return false;
      if (activeTab === 'HARDWARE' && !b.is_hardware) return false;

      // Search filter
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
  }, [blocks, activeTab, searchQuery]);

  // Copy attribute to clipboard
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Toggle selection
  const handleToggleSelect = (name: string) => {
    const next = new Set(selectedBlockNames);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedBlockNames(next);
  };

  // Select all visible
  const handleSelectAll = () => {
    if (selectedBlockNames.size === filteredBlocks.length) {
      setSelectedBlockNames(new Set());
    } else {
      setSelectedBlockNames(new Set(filteredBlocks.map(b => b.name)));
    }
  };

  // 💎 2단계: 견적 BOM에 1클릭 추가
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

  // Excel Export
  const handleExportExcel = () => {
    if (blocks.length === 0) return;

    const exportRows = blocks.map((b, idx) => ({
      'No': idx + 1,
      '블록 명칭': b.name,
      '블록 유형': b.type === 'ATTRIBUTE' ? '속성 블록' : (b.is_dynamic ? '동적/스마트 블록' : '일반 블록'),
      '도면 내 수량': b.count,
      '구매품/표준부품 여부': b.is_hardware ? 'O (구매품)' : 'X',
      '사용 레이어': b.layers.join(', '),
      '속성 태그 목록': b.attribute_tags.join(', '),
      '주요 속성 데이터': Object.entries(b.sample_attributes).map(([k, v]) => `${k}=${v}`).join(' | ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CAD_블록_데이터');
    XLSX.writeFile(wb, `CAD_블록_목록_${caseId.slice(-6)}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] lg:w-[620px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none">
      {/* 1. Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/70">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-md">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">CAD 블록 & 스마트 블록 인스펙터</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-teal-950 text-teal-300 border border-teal-800/80">
                총 {summary.unique_block_count}종 ({summary.total_insert_count}개)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              설계자가 도면에 정의한 속성 태그, 동적 블록 파라미터 및 구매품 수량 분석
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="블록 데이터 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            title="블록 목록 엑셀(.xlsx) 다운로드"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Summary Badge Bar */}
      <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between gap-2 overflow-x-auto text-[11px]">
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-slate-400 font-medium">분류별 통계:</span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-950/50 text-amber-300 border border-amber-800/50">
            <Wrench className="w-3 h-3" />
            <span>구매품 {summary.hardware_candidate_count}종</span>
          </span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-950/50 text-blue-300 border border-blue-800/50">
            <Tag className="w-3 h-3" />
            <span>속성 {summary.attribute_block_count}종</span>
          </span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-950/50 text-purple-300 border border-purple-800/50">
            <Sparkles className="w-3 h-3" />
            <span>동적 {summary.dynamic_block_count}종</span>
          </span>
        </div>
      </div>

      {/* 3. Search & Tabs */}
      <div className="p-4 border-b border-slate-800/80 space-y-3 shrink-0 bg-slate-900/60">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="블록명, 속성값(재질, 규격), 레이어 실시간 검색..."
            className="w-full bg-slate-950 text-white placeholder-slate-500 text-xs pl-9 pr-8 py-2 rounded-xl border border-slate-800 focus:outline-hidden focus:border-teal-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between">
          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('HARDWARE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'HARDWARE'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>구매품/볼트 ({summary.hardware_candidate_count})</span>
            </button>

            <button
              onClick={() => setActiveTab('ATTRIBUTE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'ATTRIBUTE'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>속성블록 ({summary.attribute_block_count})</span>
            </button>

            <button
              onClick={() => setActiveTab('DYNAMIC')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'DYNAMIC'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>동적블록 ({summary.dynamic_block_count})</span>
            </button>

            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>전체 ({summary.unique_block_count})</span>
            </button>
          </div>

          {filteredBlocks.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-xs text-teal-400 hover:text-teal-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {selectedBlockNames.size === filteredBlocks.length ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>
      </div>

      {/* 4. Blocks List Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
            <p className="text-xs text-slate-400">CAD 도면 블록 및 속성 파라미터 분석 중...</p>
          </div>
        ) : filteredBlocks.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 text-slate-500">
            <Boxes className="w-10 h-10 stroke-1" />
            <p className="text-xs">조건에 해당하는 블록 데이터가 없습니다.</p>
          </div>
        ) : (
          filteredBlocks.map((block) => {
            const isSelected = selectedBlockNames.has(block.name);
            const isExpanded = expandedBlockName === block.name;
            const attribEntries = Object.entries(block.sample_attributes);

            return (
              <div
                key={block.name}
                className={`rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-teal-950/40 border-teal-500/70 shadow-lg'
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Block Header Row */}
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(block.name)}
                      className="mt-1 w-4 h-4 rounded border-slate-700 text-teal-500 focus:ring-teal-500 bg-slate-900 cursor-pointer"
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-mono font-bold text-xs text-white truncate max-w-[280px]" title={block.name}>
                          {block.name}
                        </span>

                        {block.is_hardware && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            구매품 후보
                          </span>
                        )}

                        {block.is_dynamic && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            동적 블록
                          </span>
                        )}

                        {block.type === 'ATTRIBUTE' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            속성 블록
                          </span>
                        )}

                        {block.is_in_bom && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>BOM 등록됨</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span>
                          도면 내 수량: <strong className="text-teal-300 font-mono font-bold">{block.count}개</strong>
                        </span>
                        <span>•</span>
                        <span>레이어: <span className="font-mono text-slate-300">{block.layers.slice(0, 2).join(', ')}{block.layers.length > 2 ? ` 외 ${block.layers.length - 2}개` : ''}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={() => handleAddSelectedToBom([block])}
                      disabled={isAddingBom}
                      className="px-2.5 py-1 bg-teal-950 hover:bg-teal-900 border border-teal-500/60 hover:border-teal-400 text-teal-200 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                      title="이 블록을 견적 부품 BOM 대장에 1클릭 추가"
                    >
                      <Plus className="w-3 h-3" />
                      <span>BOM 추가</span>
                    </button>

                    <button
                      onClick={() => setExpandedBlockName(isExpanded ? null : block.name)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="상세 속성 펼치기/접기"
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Attribute Key-Value Tags Preview */}
                {attribEntries.length > 0 && !isExpanded && (
                  <div className="px-3.5 pb-3 pt-0 flex flex-wrap gap-1.5">
                    {attribEntries.slice(0, 4).map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-900 rounded-md border border-slate-800 text-[10.5px] font-mono text-slate-300"
                      >
                        <span className="text-slate-500">{k}:</span>
                        <strong className="text-amber-300">{v}</strong>
                      </span>
                    ))}
                    {attribEntries.length > 4 && (
                      <span className="text-[10px] text-slate-500 self-center">
                        +{attribEntries.length - 4}개 더보기
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded Details Drawer inside Item */}
                {isExpanded && (
                  <div className="p-3.5 border-t border-slate-800/80 bg-slate-950/80 rounded-b-xl space-y-3 text-xs animate-in fade-in">
                    {/* Attributes Table */}
                    {attribEntries.length > 0 ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center space-x-1">
                          <Tag className="w-3 h-3 text-blue-400" />
                          <span>추출된 속성 태그 데이터 ({attribEntries.length}개):</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-900/90 rounded-lg border border-slate-800">
                          {attribEntries.map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-center justify-between p-1.5 bg-slate-950/70 rounded border border-slate-800/60 group"
                            >
                              <div className="truncate mr-2">
                                <span className="font-mono text-slate-400 font-bold">{k}: </span>
                                <span className="font-mono text-amber-200">{v}</span>
                              </div>
                              <button
                                onClick={() => handleCopy(v, `${block.name}_${k}`)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-0.5 rounded transition-opacity"
                                title="값 복사"
                              >
                                {copiedKey === `${block.name}_${k}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">정의된 ATTRIB 태그 속성이 없습니다.</p>
                    )}

                    {/* Instance Sample Coordinates */}
                    {block.instances.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center space-x-1">
                          <Sliders className="w-3 h-3 text-purple-400" />
                          <span>배치 좌표 샘플 (최대 3건):</span>
                        </div>
                        <div className="space-y-1 font-mono text-[10.5px] text-slate-400">
                          {block.instances.slice(0, 3).map((inst, idx) => (
                            <div key={idx} className="p-1 px-2 bg-slate-900/60 rounded flex items-center justify-between">
                              <span>인스턴스 #{idx + 1}: X={inst.x}, Y={inst.y}</span>
                              <span>척도={inst.scale_x}x, 각도={inst.rotation}°</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Bottom Multi-Select Action Bar (💎 2단계 일괄 등록) */}
      {selectedBlockNames.size > 0 && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/95 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 shrink-0">
          <div className="text-xs">
            <span className="text-slate-400">선택된 블록: </span>
            <strong className="text-teal-300 font-bold">{selectedBlockNames.size}종</strong>
            <span className="text-slate-500 ml-1">
              (총 {blocks.filter(b => selectedBlockNames.has(b.name)).reduce((sum, b) => sum + b.count, 0)}개)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedBlockNames(new Set())}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              선택 취소
            </button>

            <button
              onClick={() => handleAddSelectedToBom()}
              disabled={isAddingBom}
              className="btn-hover-effect px-4 py-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {isAddingBom ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>선택 부품 견적 BOM 일괄 등록</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
