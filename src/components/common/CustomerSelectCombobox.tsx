'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, Check, ChevronsUpDown, PlusCircle, Sparkles, X, Search } from 'lucide-react';

export interface CustomerCompanyItem {
  id: string;
  company_name: string;
  company_code?: string | null;
  company_type?: string;
  is_active?: number;
}

export interface CustomerSelectionValue {
  companyId: string | null;
  companyName: string;
  isNew: boolean;
}

interface CustomerSelectComboboxProps {
  companies: CustomerCompanyItem[];
  value: CustomerSelectionValue;
  onChange: (val: CustomerSelectionValue) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

// 초성 분리 헬퍼
const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function getChosung(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xac00;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG_LIST[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

function matchSearch(target: string, query: string): boolean {
  if (!target) return false;
  const lowerTarget = target.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return true;
  if (lowerTarget.includes(lowerQuery)) return true;
  const chosungTarget = getChosung(lowerTarget);
  const chosungQuery = getChosung(lowerQuery);
  return chosungTarget.includes(chosungQuery);
}

export default function CustomerSelectCombobox({
  companies,
  value,
  onChange,
  placeholder = '발주 고객사 검색 또는 신규 고객사명 입력...',
  disabled = false,
  required = true,
}: CustomerSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 컴포넌트 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // 입력창 내용을 현재 선택된 값으로 복원
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 검색어에 따른 필터링된 고객사 목록
  const filteredCompanies = useMemo(() => {
    const query = searchTerm.trim();
    if (!query) return companies;
    return companies.filter((c) => matchSearch(c.company_name, query) || (c.company_code && matchSearch(c.company_code, query)));
  }, [companies, searchTerm]);

  // 검색어와 정확히 일치하는 기존 회사가 있는지 여부
  const hasExactMatch = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return false;
    return companies.some((c) => (c.company_name || '').trim().toLowerCase() === query);
  }, [companies, searchTerm]);

  const canShowNewOption = searchTerm.trim().length > 0 && !hasExactMatch;

  // 하이라이트 인덱스 범위 조정
  const totalOptionsCount = filteredCompanies.length + (canShowNewOption ? 1 : 0);

  // 기존 고객사 선택
  const handleSelectExisting = (comp: CustomerCompanyItem) => {
    onChange({
      companyId: comp.id,
      companyName: comp.company_name,
      isNew: false,
    });
    setSearchTerm('');
    setIsOpen(false);
  };

  // 신규 고객사 등록 선택
  const handleSelectNew = (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onChange({
      companyId: null,
      companyName: trimmed,
      isNew: true,
    });
    setSearchTerm('');
    setIsOpen(false);
  };

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % Math.max(1, totalOptionsCount));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + totalOptionsCount) % Math.max(1, totalOptionsCount));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (canShowNewOption && highlightIndex === 0) {
        handleSelectNew(searchTerm);
      } else {
        const compIndex = canShowNewOption ? highlightIndex - 1 : highlightIndex;
        if (filteredCompanies[compIndex]) {
          handleSelectExisting(filteredCompanies[compIndex]);
        } else if (searchTerm.trim()) {
          handleSelectNew(searchTerm);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  // 입력창 표시 텍스트: 열려 있고 타이핑 중이면 searchTerm, 아니면 value.companyName
  const displayValue = isOpen ? searchTerm : (value.companyName || '');

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 입력 컨트롤 바 */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
          {value.isNew ? (
            <Sparkles className="w-4 h-4 text-amber-500" />
          ) : (
            <Building2 className="w-4 h-4 text-blue-500" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          required={required && !value.companyName}
          disabled={disabled}
          value={displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm(value.companyName || '');
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-9 pr-24 py-2.5 rounded-xl border text-xs font-semibold transition-all focus:outline-none ${
            value.isNew
              ? 'border-blue-400 bg-blue-50/20 text-slate-900 focus:ring-2 focus:ring-blue-500/20'
              : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />

        {/* 우측 뱃지 및 액션 버튼들 */}
        <div className="absolute right-2 flex items-center space-x-1.5">
          {value.companyName && !isOpen && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold shrink-0 flex items-center gap-1 ${
                value.isNew
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {value.isNew ? (
                <>
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>신규 등록</span>
                </>
              ) : (
                <>
                  <Building2 className="w-3 h-3 text-slate-500" />
                  <span>기존 고객사</span>
                </>
              )}
            </span>
          )}

          {value.companyName && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ companyId: null, companyName: '', isNew: false });
                setSearchTerm('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="지우기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setSearchTerm('');
              } else {
                setIsOpen(true);
                setSearchTerm(value.companyName || '');
                inputRef.current?.focus();
              }
            }}
            className="p-1 text-slate-400 hover:text-slate-600 transition-transform cursor-pointer"
          >
            <ChevronsUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 상태 안내 문구 */}
      <div className="flex items-center justify-between text-[11px] mt-1 px-1 text-slate-500">
        <div>
          {value.isNew ? (
            <span className="text-blue-600 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-600 inline" />
              <strong>{value.companyName}</strong> 고객사는 견적 접수 시 사내 고객사 대장에 자동 등록됩니다.
            </span>
          ) : value.companyName ? (
            <span className="text-slate-600">
              선택 고객사: <strong className="text-slate-800">{value.companyName}</strong> (발주처 지정 완료)
            </span>
          ) : (
            <span className="text-slate-400">
              고객사명을 검색하거나 새 회사명을 입력하면 즉시 등록됩니다.
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">초성 검색 지원 (예: ㅂㄱ, ㅇㅂㅌ)</span>
      </div>

      {/* 드롭다운 목록 (플로팅) */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden max-h-64 flex flex-col">
          {/* 드롭다운 상단 검색 팁/헤더 */}
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10.5px] font-semibold text-slate-400 flex items-center justify-between">
            <span>고객사 목록 ({filteredCompanies.length}개 검색됨)</span>
            <span>방향키 이동 / Enter 선택</span>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100">
            {/* 1. 신규 고객사 즉시 등록 옵션 (검색어와 완전히 일치하는 항목이 없을 때 최상단 표시) */}
            {canShowNewOption && (
              <div
                onClick={() => handleSelectNew(searchTerm)}
                onMouseEnter={() => setHighlightIndex(0)}
                className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                  highlightIndex === 0
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50/80 hover:bg-blue-100/70 text-blue-900'
                }`}
              >
                <div className="flex items-center space-x-2 truncate pr-2">
                  <PlusCircle className={`w-4 h-4 shrink-0 ${highlightIndex === 0 ? 'text-white' : 'text-blue-600'}`} />
                  <span className="text-xs truncate">
                    신규 발주 고객사 등록: <strong className="font-bold underline underline-offset-2">"{searchTerm.trim()}"</strong>
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    highlightIndex === 0 ? 'bg-white text-blue-700' : 'bg-blue-200 text-blue-800'
                  }`}
                >
                  원클릭 등록
                </span>
              </div>
            )}

            {/* 2. 필터링된 기존 등록 고객사 목록 */}
            {filteredCompanies.map((c, idx) => {
              const itemIndex = canShowNewOption ? idx + 1 : idx;
              const isHighlighted = highlightIndex === itemIndex;
              const isSelected = value.companyId === c.id || (!value.isNew && value.companyName === c.company_name);

              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectExisting(c)}
                  onMouseEnter={() => setHighlightIndex(itemIndex)}
                  className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-xs transition-colors ${
                    isHighlighted
                      ? 'bg-slate-100 text-slate-900'
                      : isSelected
                      ? 'bg-blue-50/50 text-blue-900 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate pr-2">
                    <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="truncate">{c.company_name}</span>
                    {c.company_code && (
                      <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 rounded text-[10px] font-mono shrink-0">
                        {c.company_code}
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <span className="flex items-center text-blue-600 text-[11px] font-bold shrink-0">
                      <Check className="w-3.5 h-3.5 mr-1" />
                      선택됨
                    </span>
                  )}
                </div>
              );
            })}

            {/* 3. 검색 결과 없음 메시지 */}
            {filteredCompanies.length === 0 && !canShowNewOption && (
              <div className="p-4 text-center text-xs text-slate-400">
                등록된 고객사가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
