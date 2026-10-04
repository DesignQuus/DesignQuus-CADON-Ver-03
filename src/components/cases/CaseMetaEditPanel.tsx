'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { formatPhoneNumber } from '@/lib/formatters';
import CustomerSelectCombobox, {
  CustomerCompanyItem,
  CustomerSelectionValue,
  AUTO_DETECT_CUSTOMER
} from '@/components/common/CustomerSelectCombobox';
import {
  Building2,
  Calendar,
  User,
  Phone,
  Compass,
  Briefcase,
  FolderGit2,
  FileEdit,
  Save,
  CheckCircle2,
  Sparkles,
  Info
} from 'lucide-react';

interface CaseMetaEditPanelProps {
  caseId: string;
  caseData: any;
  onUpdated?: (updatedCase: any) => void;
  className?: string;
}

export default function CaseMetaEditPanel({
  caseId,
  caseData,
  onUpdated,
  className = ''
}: CaseMetaEditPanelProps) {
  const [companies, setCompanies] = useState<CustomerCompanyItem[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Form Fields
  const [customerSelection, setCustomerSelection] = useState<CustomerSelectionValue>({
    companyId: caseData?.company_id || null,
    companyName: caseData?.company_name || '',
    isNew: false
  });
  const [requestDate, setRequestDate] = useState<string>(
    caseData?.request_date ? caseData.request_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [managerName, setManagerName] = useState<string>(caseData?.manager_name || '');
  const [managerContact, setManagerContact] = useState<string>(
    formatPhoneNumber(caseData?.manager_contact || '')
  );
  const [designerName, setDesignerName] = useState<string>(caseData?.designer_name || '');
  const [department, setDepartment] = useState<string>(caseData?.department || '');
  const [projectName, setProjectName] = useState<string>(caseData?.project_name || '');
  const [quoteMemo, setQuoteMemo] = useState<string>(caseData?.quote_memo || '');
  const [caseName, setCaseName] = useState<string>(caseData?.case_name || '');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load AI Insights
  const fetchAiInsights = async (triggerReanalyze = false) => {
    setLoadingAi(true);
    try {
      const url = `/api/quotation-cases/${caseId}/ai-insights`;
      const res = triggerReanalyze
        ? await apiFetch(url, { method: 'POST' })
        : await apiFetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setAiInsights(json.data);
          // If customer selection is empty or default, offer auto-population
          if (json.data.titleBlockAnalysis?.detectedCompany && !customerSelection.companyName) {
            setCustomerSelection({
              companyId: null,
              companyName: json.data.titleBlockAnalysis.detectedCompany,
              isNew: false
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load AI insights:', e);
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      fetchAiInsights(false);
    }
  }, [caseId]);

  // 1. Fetch companies for CustomerSelectCombobox
  useEffect(() => {
    let isMounted = true;
    setLoadingCompanies(true);
    apiFetch('/api/companies')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (isMounted && data?.companies) {
          setCompanies(data.companies);
        }
      })
      .catch(err => console.error('Failed to load companies:', err))
      .finally(() => {
        if (isMounted) setLoadingCompanies(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Update fields when caseData changes externally
  useEffect(() => {
    if (caseData) {
      setCustomerSelection({
        companyId: caseData.company_id || null,
        companyName: caseData.company_name || '',
        isNew: false
      });
      if (caseData.request_date) {
        setRequestDate(caseData.request_date.slice(0, 10));
      }
      if (caseData.manager_name !== undefined) setManagerName(caseData.manager_name || '');
      if (caseData.manager_contact !== undefined) {
        setManagerContact(formatPhoneNumber(caseData.manager_contact || ''));
      }
      if (caseData.designer_name !== undefined) setDesignerName(caseData.designer_name || '');
      if (caseData.department !== undefined) setDepartment(caseData.department || '');
      if (caseData.project_name !== undefined) setProjectName(caseData.project_name || '');
      if (caseData.quote_memo !== undefined) setQuoteMemo(caseData.quote_memo || '');
      if (caseData.case_name !== undefined) setCaseName(caseData.case_name || '');
    }
  }, [caseData?.id]);

  const handlePhoneChange = (val: string) => {
    const formatted = formatPhoneNumber(val);
    setManagerContact(formatted);
  };

  const handleAppendMemo = (noteText: string) => {
    setQuoteMemo((prev) => {
      const trimmed = (prev || '').trim();
      const line = `• ${noteText}`;
      if (trimmed.includes(noteText)) return prev;
      return trimmed ? `${trimmed}\n${line}` : line;
    });
  };

  const handleSave = async (isManual = true) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload: any = {
        companyId: customerSelection.companyId,
        companyName: customerSelection.companyName,
        requestDate,
        managerName: managerName.trim(),
        managerContact: managerContact.trim(),
        designerName: designerName.trim(),
        department: department.trim(),
        projectName: projectName.trim(),
        quoteMemo: quoteMemo.trim(),
        caseName: caseName.trim()
      };

      const res = await apiFetch(`/api/quotation-cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const json = await res.json();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        if (onUpdated && json?.case) {
          onUpdated(json.case);
        }
      } else {
        const errJson = await res.json().catch(() => null);
        if (isManual) alert(errJson?.error || '메타 정보 저장에 실패했습니다.');
      }
    } catch (err: any) {
      if (isManual) alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">표제란·견적 메타 확인</h3>
              {aiInsights?.titleBlockAnalysis ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  AI VLM 판독 (신뢰도 {aiInsights.titleBlockAnalysis.companyConfidence || 98}%)
                </span>
              ) : loadingAi ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 animate-pulse">
                  <Sparkles className="w-3 h-3 animate-spin text-blue-500" />
                  AI 분석 중...
                </span>
              ) : null}
              {caseData?.lifecycle_status && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-100 text-slate-600">
                  {caseData.lifecycle_status}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              도면 표제란 추출 정보와 견적 담당자 및 발주처 메타데이터를 확인하고 수정합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => fetchAiInsights(true)}
            disabled={loadingAi}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
            title="Gemini 2.5 Flash 기반 표제란 및 특기사항 재판독"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${loadingAi ? 'animate-spin' : ''}`} />
            <span>{loadingAi ? '판독 중' : 'AI 재판독'}</span>
          </button>
          {saveSuccess && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              저장 완료
            </span>
          )}
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? '저장 중...' : '메타 저장'}</span>
          </button>
        </div>
      </div>

      {/* Grid Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
        {/* 견적건 명칭 */}
        <div className="lg:col-span-3">
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <FileEdit className="w-3.5 h-3.5 text-slate-400" />
            견적 의뢰 건명 (Case Title)
          </label>
          <input
            type="text"
            value={caseName}
            onChange={(e) => setCaseName(e.target.value)}
            placeholder="견적건 명칭 입력..."
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* 1. 발주 고객사 (CustomerSelectCombobox 재사용) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
            발주 고객사 (Customer)
          </label>
          <CustomerSelectCombobox
            companies={companies}
            value={customerSelection}
            onChange={setCustomerSelection}
            placeholder="발주 고객사 검색 또는 직접 입력..."
            allowAutoDetect={false}
          />
          {aiInsights?.titleBlockAnalysis?.detectedCompany && 
           aiInsights.titleBlockAnalysis.detectedCompany !== customerSelection.companyName && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50/70 px-2 py-0.5 rounded border border-amber-200/60">
              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">AI 추천: {aiInsights.titleBlockAnalysis.detectedCompany}</span>
              <button
                type="button"
                onClick={() => setCustomerSelection({ companyId: null, companyName: aiInsights.titleBlockAnalysis.detectedCompany, isNew: false })}
                className="ml-auto text-[10px] font-bold text-amber-800 underline hover:text-amber-900 shrink-0 cursor-pointer"
              >
                적용
              </button>
            </div>
          )}
        </div>

        {/* 2. 의뢰일 (Request Date) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            의뢰일자 (Request Date)
          </label>
          <input
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white"
          />
        </div>

        {/* 3. 프로젝트명 */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <FolderGit2 className="w-3.5 h-3.5 text-indigo-500" />
            프로젝트명 (Project Name)
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="예: MAIN CONVEYOR 가공 제작"
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
          />
          {aiInsights?.titleBlockAnalysis?.projectName && 
           aiInsights.titleBlockAnalysis.projectName !== '-' &&
           aiInsights.titleBlockAnalysis.projectName !== projectName && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-200/60">
              <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="truncate">AI 추천: {aiInsights.titleBlockAnalysis.projectName}</span>
              <button
                type="button"
                onClick={() => setProjectName(aiInsights.titleBlockAnalysis.projectName)}
                className="ml-auto text-[10px] font-bold text-indigo-800 underline hover:text-indigo-900 shrink-0 cursor-pointer"
              >
                적용
              </button>
            </div>
          )}
        </div>

        {/* 4. 견적 담당자 (Manager Name) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-500" />
            견적 담당자 (Manager)
          </label>
          <input
            type="text"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="견적 담당자 성명"
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* 5. 담당자 연락처 (formatPhoneNumber 자동 하이픈) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-500" />
            담당자 연락처 (전화번호)
          </label>
          <input
            type="text"
            value={managerContact}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="010-1234-5678"
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* 6. 부서 (Department) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-500" />
            소속 부서 (Department)
          </label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="예: 영업팀 / 설계1팀"
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* 7. 도면 설계자 (Designer Name - 표제란 추출) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            도면 설계자 (Designer)
          </label>
          <input
            type="text"
            value={designerName}
            onChange={(e) => setDesignerName(e.target.value)}
            placeholder="표제란 판독 설계자 / 직접 입력"
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white"
          />
          {aiInsights?.titleBlockAnalysis?.designerCompany && 
           aiInsights.titleBlockAnalysis.designerCompany !== '-' &&
           aiInsights.titleBlockAnalysis.designerCompany !== designerName && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50/70 px-2 py-0.5 rounded border border-amber-200/60">
              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">AI 추천: {aiInsights.titleBlockAnalysis.designerCompany}</span>
              <button
                type="button"
                onClick={() => setDesignerName(aiInsights.titleBlockAnalysis.designerCompany)}
                className="ml-auto text-[10px] font-bold text-amber-800 underline hover:text-amber-900 shrink-0 cursor-pointer"
              >
                적용
              </button>
            </div>
          )}
        </div>

        {/* 8. 견적 메모 (Quote Memo) */}
        <div className="md:col-span-2 lg:col-span-2">
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            견적 특이사항 / 메모 (Quote Notes)
          </label>
          <input
            type="text"
            value={quoteMemo}
            onChange={(e) => setQuoteMemo(e.target.value)}
            placeholder="특수 가공, 긴급 납기, 표면처리 요청사항 등..."
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
          
          {/* AI 감지 가공 특기사항 칩 목록 */}
          {aiInsights?.drawingAndMachiningFeatures?.criticalManufacturingNotes?.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>AI 감지 가공 특기사항 (클릭하여 메모에 추가):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {aiInsights.drawingAndMachiningFeatures.criticalManufacturingNotes.map((note: string, idx: number) => {
                  const isAlreadyAdded = (quoteMemo || '').includes(note);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAppendMemo(note)}
                      disabled={isAlreadyAdded}
                      className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all text-left flex items-center gap-1 ${
                        isAlreadyAdded
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 cursor-pointer active:scale-95'
                      }`}
                      title={note}
                    >
                      <span>{isAlreadyAdded ? '✓' : '+'}</span>
                      <span className="truncate max-w-[280px]">{note}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
