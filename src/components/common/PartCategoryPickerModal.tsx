'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Search, Tag, Check, Sparkles, Layers, Wrench, Package, 
  Globe, UserCheck, HelpCircle, ArrowRight 
} from 'lucide-react';
import { 
  PART_CATEGORIES, 
  PART_CATEGORY_GROUPS, 
  PartCategoryDef,
  getPartCategoryLabel,
  getPartCategoryBadgeClass 
} from '@/lib/part-categories';

interface PartCategoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory?: string;
  onSelect: (category: string, selectedSubItem?: string) => void;
  title?: string;
  targetItemInfo?: {
    code?: string;
    name?: string;
    spec?: string;
  };
}

export default function PartCategoryPickerModal({
  isOpen,
  onClose,
  selectedCategory,
  onSelect,
  title = '부품 분류 & 실무 대표 품목 스마트 피커',
  targetItemInfo
}: PartCategoryPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedGroup('ALL');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 키보드 ESC로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 필터링 로직
  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return PART_CATEGORIES.filter((cat) => {
      // 1. 그룹 필터
      if (selectedGroup !== 'ALL' && cat.group !== selectedGroup) {
        return false;
      }
      // 2. 검색어 필터
      if (!term) return true;
      const matchLabel = cat.label.toLowerCase().includes(term);
      const matchFullLabel = cat.fullLabel.toLowerCase().includes(term);
      const matchId = cat.id.toLowerCase().includes(term);
      const matchDesc = cat.description.toLowerCase().includes(term);
      const matchSubItems = cat.subItems.some(item => item.toLowerCase().includes(term));
      return matchLabel || matchFullLabel || matchId || matchDesc || matchSubItems;
    });
  }, [searchTerm, selectedGroup]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[95vw] 2xl:max-w-[1580px] max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>{title}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  제조업 10대 표준 체계
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                대분류 그룹, 부품 유형 코드 및 실무 대표 품목 태그를 선택하여 단가 산출 로직을 확정합니다.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="닫기 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Target Item Context Bar (if provided) */}
        {targetItemInfo && (targetItemInfo.name || targetItemInfo.code) && (
          <div className="px-5 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 truncate">
              <span className="text-blue-600 font-bold">대상 품목:</span>
              {targetItemInfo.code && (
                <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                  {targetItemInfo.code}
                </span>
              )}
              {targetItemInfo.name && (
                <span className="font-bold text-slate-900 truncate">
                  {targetItemInfo.name}
                </span>
              )}
              {targetItemInfo.spec && targetItemInfo.spec !== '-' && (
                <span className="text-slate-500 font-mono text-[11px]">
                  ({targetItemInfo.spec})
                </span>
              )}
            </div>
            {selectedCategory && (
              <span className="text-[11px] text-slate-500 shrink-0">
                현재 분류: <strong className="text-slate-800">{getPartCategoryLabel(selectedCategory)}</strong>
              </span>
            )}
          </div>
        )}

        {/* Search & Group Filter Bar */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="부품명, 대표 품목 검색 (예: 샤프트, 베어링, LM가이드, 볼트, 서보모터, 사출, 수입, 사급 등)..."
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500 focus:bg-white transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 4대 대분류 그룹 탭 */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            {PART_CATEGORY_GROUPS.map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => setSelectedGroup(grp.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-xs flex items-center space-x-1.5 ${
                  selectedGroup === grp.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <span>{grp.label}</span>
                {grp.id !== 'ALL' && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    selectedGroup === grp.id ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {PART_CATEGORIES.filter(c => c.group === grp.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Categories Grid List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {filteredCategories.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                &apos;{searchTerm}&apos; 검색어와 일치하는 부품 분류를 찾을 수 없습니다.
              </p>
              <p className="text-[11px] text-slate-400">
                검색어를 초기화하거나 다른 대표 품목 명칭으로 검색해 보세요.
              </p>
              <button
                onClick={() => { setSearchTerm(''); setSelectedGroup('ALL'); }}
                className="mt-2 px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                전체 분류 보기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredCategories.map((cat) => {
                const isSelected = selectedCategory === cat.id;

                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      onSelect(cat.id);
                      onClose();
                    }}
                    className={`bg-white rounded-xl border p-3.5 space-y-2.5 transition-all cursor-pointer relative group hover:shadow-md ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-400/50 bg-blue-50/30'
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {/* Card Top: Category Badge, Code & Group */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-xs border shadow-2xs ${cat.badgeClass}`}>
                            {cat.label}
                          </span>
                          <span className="font-mono text-[10.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {cat.id}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({cat.groupName})
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {cat.fullLabel}
                        </h4>
                      </div>

                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {cat.description}
                    </p>

                    {/* Sub-item Tags (실무 대표 품목 1클릭 칩) */}
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>실무 대표 품목 (클릭 시 선택)</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cat.subItems.map((sub) => {
                          const isSearchHit = searchTerm && sub.toLowerCase().includes(searchTerm.toLowerCase());
                          return (
                            <button
                              key={sub}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(cat.id, sub);
                                onClose();
                              }}
                              className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition-all cursor-pointer ${
                                isSearchHit
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold ring-2 ring-amber-200'
                                  : 'bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-200 hover:border-blue-300'
                              }`}
                              title={`[${sub}] 대표 품목을 선택하여 [${cat.label}] 분류로 확정`}
                            >
                              + {sub}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cost Formula Hint */}
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[10.5px] text-slate-600 flex items-center justify-between">
                      <span className="truncate" title={cat.costFormulaHint}>
                        💡 <strong>산출식:</strong> {cat.costFormulaHint}
                      </span>
                      <span className="text-blue-600 font-bold text-[10px] shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform flex items-center">
                        선택 <ArrowRight className="w-3 h-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <div className="text-[11px] text-slate-500">
            총 <strong>{PART_CATEGORIES.length}개</strong> 부품 분류 및 <strong>{PART_CATEGORIES.reduce((acc, c) => acc + c.subItems.length, 0)}개</strong> 대표 품목 프리셋 제공
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
