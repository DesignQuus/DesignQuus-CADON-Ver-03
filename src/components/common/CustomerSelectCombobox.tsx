'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, Check, ChevronsUpDown, PlusCircle, Sparkles, X, Zap } from 'lucide-react';

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
  isAutoDetect?: boolean;
}

export const AUTO_DETECT_CUSTOMER: CustomerSelectionValue = {
  companyId: 'comp_unassigned',
  companyName: '도면 표제란(Title Block) 자동 판독',
  isNew: false,
  isAutoDetect: true,
};

interface CustomerSelectComboboxProps {
  companies: CustomerCompanyItem[];
  value: CustomerSelectionValue;
  onChange: (val: CustomerSelectionValue) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowAutoDetect?: boolean;
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
  allowAutoDetect = true,
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

  // 기존 고객사 선택
  const handleSelectExisting = (comp: CustomerCompanyItem) => {
    onChange({
      companyId: comp.id,
      companyName: comp.company_name,
      isNew: false,
      isAutoDetect: false,
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
      isAutoDetect: false,
    });
    setSearchTerm('');
    setIsOpen(false);
  };

  // AI 자동 감지 선택
  const handleSelectAutoDetect = () => {
    onChange(AUTO_DETECT_CUSTOMER);
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

    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const isCurrentAuto = value.isAutoDetect || value.companyId === 'comp_unassigned' || value.companyName.includes('자동');

  // 입력창 표시 텍스트: 열려 있고 타이핑 중이면 searchTerm, 아니면 value.companyName
  const displayValue = isOpen ? searchTerm : (value.companyName || '');

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 입력 컨트롤 바 */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
          {isCurrentAuto ? (
            <Zap className="w-4 h-4 text-indigo-500 animate-pulse" />
          ) : value.isNew ? (
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
            setSearchTerm(isCurrentAuto ? '' : (value.companyName || ''));
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-9 pr-28 py-2.5 rounded-lg border text-xs font-semibold transition-all focus:outline-none ${
            isCurrentAuto
              ? 'border-indigo-400 bg-indigo-50/30 text-indigo-950 focus:ring-2 focus:ring-indigo-500/20'
              : value.isNew
              ? 'border-blue-400 bg-blue-50/20 text-slate-900 focus:ring-2 focus:ring-blue-500/20'
              : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />

        {/* 우측 뱃지 및 액션 버튼들 */}
        <div className="absolute right-2 flex items-center space-x-1.5">
          {value.companyName && !isOpen && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold shrink-0 flex items-center gap-1 ${
                isCurrentAuto
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : value.isNew
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {isCurrentAuto ? (
                <>
                  <Zap className="w-3 h-3 text-indigo-600" />
                  <span>AI 자동 감지</span>
                </>
              ) : value.isNew ? (
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
                if (allowAutoDetect) {
                  onChange(AUTO_DETECT_CUSTOMER);
                } else {
                  onChange({ companyId: null, companyName: '', isNew: false });
                }
                setSearchTerm('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="초기화"
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
                setSearchTerm(isCurrentAuto ? '' : (value.companyName || ''));
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
          {isCurrentAuto ? (
            <span className="text-indigo-600 font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 text-indigo-600 inline" />
              CAD 도면 분석 시 표제란(Title Block)을 판독하여 발주 고객사가 자동 바인딩됩니다.
            </span>
          ) : value.isNew ? (
            <span className="text-blue-600 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-600 inline" />
              <strong>{value.companyName}</strong> 고객사는 사내 고객사 대장에 자동 등록됩니다.
            </span>
          ) : value.companyName ? (
            <span className="text-slate-600">
              선택 고객사: <strong className="text-slate-800">{value.companyName}</strong> (발주처 지정 완료)
            </span>
          ) : (
            <span className="text-slate-400">
              고객사명을 검색하거나 비워두면 도면 표제란에서 자동 추출됩니다.
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">초성 검색 지원</span>
      </div>

      {/* 드롭다운 목록 (플로팅) */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden max-h-64 flex flex-col">
          {/* 드롭다운 상단 검색 팁/헤더 */}
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10.5px] font-semibold text-slate-400 flex items-center justify-between">
            <span>고객사 목록 ({filteredCompanies.length}개 검색됨)</span>
            <span>클릭하여 선택</span>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100">
            {/* 0. AI 도면 표제란 자동 판독 (기본 권장 옵션) */}
            {allowAutoDetect && !searchTerm.trim() && (
              <div
                onClick={handleSelectAutoDetect}
                className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                  isCurrentAuto
                    ? 'bg-indigo-50 border-l-4 border-indigo-600 text-indigo-950 font-bold'
                    : 'bg-indigo-50/40 hover:bg-indigo-100/50 text-indigo-900'
                }`}
              >
                <div className="flex items-center space-x-2 truncate pr-2">
                  <Zap className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <span>⚡ [AI 자동 판독] 도면 표제란(Title Block) 자동 인식</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-200 text-indigo-800 font-semibold">
                        권장
                      </span>
                    </p>
                    <p className="text-[10px] text-indigo-600 font-normal mt-0.5">
                      도면을 분석하여 표제란의 고객사(발주처)를 자동으로 추출 및 매칭합니다.
                    </p>
                  </div>
                </div>
                {isCurrentAuto && (
                  <span className="flex items-center text-indigo-600 text-[11px] font-bold shrink-0">
                    <Check className="w-3.5 h-3.5 mr-1" />
                    선택됨
                  </span>
                )}
              </div>
            )}

            {/* 1. 신규 고객사 즉시 등록 옵션 (검색어와 완전히 일치하는 항목이 없을 때 최상단 표시) */}
            {canShowNewOption && (
              <div
                onClick={() => handleSelectNew(searchTerm)}
                className="p-2.5 flex items-center justify-between cursor-pointer transition-all bg-blue-50/80 hover:bg-blue-100/70 text-blue-900"
              >
                <div className="flex items-center space-x-2 truncate pr-2">
                  <PlusCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="text-xs truncate">
                    신규 발주 고객사 등록: <strong className="font-bold underline underline-offset-2">"{searchTerm.trim()}"</strong>
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 bg-blue-200 text-blue-800">
                  원클릭 등록
                </span>
              </div>
            )}

            {/* 2. 필터링된 기존 등록 고객사 목록 */}
            {filteredCompanies.map((c) => {
              const isSelected = !isCurrentAuto && (value.companyId === c.id || (!value.isNew && value.companyName === c.company_name));

              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectExisting(c)}
                  className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 text-blue-900 font-semibold'
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
                일치하는 고객사가 없습니다. (비워둘 경우 표제란에서 자동 감지됩니다)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
