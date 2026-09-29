"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, Users, Search, Plus, Edit, Trash2, Key, 
  RefreshCw, AlertTriangle, UserCheck, UserPlus, Phone, 
  ShieldAlert, Building2, RotateCcw, CheckCircle, XCircle, X
} from "lucide-react";
import { getTenantStorageKey } from "@/lib/tenant-client";

interface Operator {
  id: string;
  login_id: string;
  username?: string;
  name: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "SALES_USER" | "REVIEWER" | "GUEST";
  employee_number: string | null;
  phone: string | null;
  tenant_id: string | null;
  company_id: string | null;
  created_at: string | null;
  deleted_at: string | null;
  is_deleted?: boolean;
}

interface Company {
  id: string;
  company_name: string;
  company_code: string;
  company_type?: string;
  created_at?: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: "시스템 최고관리자", color: "bg-purple-100 text-purple-800 border-purple-200" },
  TENANT_ADMIN: { label: "대표 관리자", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  SALES_USER: { label: "일반 사원 (실무)", color: "bg-blue-100 text-blue-800 border-blue-200" },
  REVIEWER: { label: "일반 사원 (실무)", color: "bg-blue-100 text-blue-800 border-blue-200" },
  GUEST: { label: "조회 전용", color: "bg-slate-100 text-slate-800 border-slate-200" },
};

export const getOperatorDeptAndTitle = (op: Operator) => {
  if (op.login_id === "admin") {
    return { dept: "시스템운영본부", title: "최고관리자", icon: ShieldCheck, color: "text-purple-600" };
  }
  if (op.login_id === "001" || op.name.includes("김세창")) {
    return { dept: "견적영업부", title: "부장", icon: Building2, color: "text-blue-600" };
  }
  if (op.login_id === "002" || op.name.includes("이세창")) {
    return { dept: "가공기술부", title: "과장", icon: Building2, color: "text-blue-600" };
  }
  if (op.login_id === "003" || op.name.includes("박세창")) {
    return { dept: "설계품질부", title: "대리", icon: Building2, color: "text-blue-600" };
  }
  if (op.role === "SUPER_ADMIN") {
    return { dept: "시스템운영본부", title: "최고관리자", icon: ShieldCheck, color: "text-purple-600" };
  }
  if (op.role === "TENANT_ADMIN") {
    return { dept: "경영지원부", title: "총괄관리자", icon: Building2, color: "text-indigo-600" };
  }
  if (op.role === "REVIEWER") {
    return { dept: "설계품질부", title: "검토담당", icon: Building2, color: "text-emerald-600" };
  }
  return { dept: "견적영업부", title: "영업담당", icon: Building2, color: "text-blue-600" };
};

export default function MembersManagementPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 필터 및 검색 상태
  const [activeTab, setActiveTab] = useState<"all" | "SUPER_ADMIN" | "TENANT_ADMIN" | "SALES_USER" | "REVIEWER" | "deleted">("all");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);

  // 회사/테넌트 등록 폼 상태
  const [formCompName, setFormCompName] = useState("");
  const [formCompCode, setFormCompCode] = useState("");
  const [formCompType, setFormCompType] = useState<"CUSTOMER" | "PARTNER" | "INTERNAL">("CUSTOMER");
  const [createAdminWithCompany, setCreateAdminWithCompany] = useState(true);
  const [compAdminLoginId, setCompAdminLoginId] = useState("");
  const [compAdminPassword, setCompAdminPassword] = useState("");
  const [compAdminName, setCompAdminName] = useState("");
  const [compAdminEmpNum, setCompAdminEmpNum] = useState("");
  const [compAdminPhone, setCompAdminPhone] = useState("");
  const [isSubmittingCompany, setIsSubmittingCompany] = useState(false);
  const [companyModalError, setCompanyModalError] = useState("");

  // 입력 폼 상태
  const [formLoginId, setFormLoginId] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<Operator["role"]>("SALES_USER");
  const [formEmployeeNumber, setFormEmployeeNumber] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 로컬 스토리지 필터 상태 복원
  useEffect(() => {
    try {
      const savedDept = localStorage.getItem("admin_members_dept");
      if (savedDept) setSelectedDeptFilter(savedDept);
      const savedTab = localStorage.getItem("admin_members_tab");
      if (savedTab) setActiveTab(savedTab as any);
    } catch {}
  }, []);

  const handleSelectDept = (val: string) => {
    setSelectedDeptFilter(val);
    try { localStorage.setItem("admin_members_dept", val); } catch {}
  };

  const handleSelectTab = (tab: any) => {
    setActiveTab(tab);
    try { localStorage.setItem("admin_members_tab", tab); } catch {}
  };

  // 인증 확인
  useEffect(() => {
    setAuthChecking(true);
    apiFetch("/api/auth/me")
      .then((res) => {
        if (res.status === 401) {
          // 비로그인 상태: 로그인 페이지로 즉시 리다이렉트
          window.location.replace("/login?redirect=/admin/members");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          if (["SUPER_ADMIN", "TENANT_ADMIN"].includes(data.user.role)) {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
            setIsLoading(false);
          }
        } else {
          setIsAuthorized(false);
          setIsLoading(false);
        }
      })
      .catch(() => {
        setIsAuthorized(false);
        setIsLoading(false);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  // 운영자 목록 불러오기
  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      // 1. 운영자 목록
      const opUrl = `/api/operators?include_deleted=true`;
      
      const [opRes, compRes] = await Promise.all([
        fetch(opUrl),
        apiFetch("/api/companies")
      ]);

      const opData = await opRes.json();
      if (opData.success) {
        setOperators(opData.operators || []);
      } else {
        setErrorMsg(opData.error || "임직원 목록을 불러오지 못했습니다.");
      }

      const compData = await compRes.json();
      if (compData.success || Array.isArray(compData)) {
        setCompanies(compData.companies || compData || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "데이터 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
    }
  }, [isAuthorized]);

  // 필터링된 임직원 목록
  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      // 1. 탭 필터
      if (activeTab === "deleted") {
        if (!op.deleted_at && !op.is_deleted) return false;
      } else {
        if (op.deleted_at || op.is_deleted) return false;
        if (activeTab !== "all" && op.role !== activeTab) return false;
      }

      // 2. 부서 필터
      if (selectedDeptFilter !== "ALL") {
        const info = getOperatorDeptAndTitle(op);
        if (info.dept !== selectedDeptFilter) return false;
      }

      // 3. 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = op.name?.toLowerCase().includes(q);
        const matchLogin = op.login_id?.toLowerCase().includes(q);
        const matchEmp = op.employee_number?.toLowerCase().includes(q);
        const matchPhone = op.phone?.toLowerCase().includes(q);
        if (!matchName && !matchLogin && !matchEmp && !matchPhone) return false;
      }

      return true;
    });
  }, [operators, activeTab, selectedDeptFilter, searchQuery]);

  // 테넌트(회사) 등록 모달 열기
  const handleOpenCompanyModal = () => {
    setFormCompName("");
    setFormCompCode(`COMP-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormCompType("CUSTOMER");
    setCreateAdminWithCompany(true);
    setCompAdminName("대표 관리자");
    setCompAdminLoginId("");
    setCompAdminPassword("Password123!");
    setCompAdminEmpNum(`CEO-${Math.floor(100 + Math.random() * 900)}`);
    setCompAdminPhone("");
    setCompanyModalError("");
    setShowCompanyModal(true);
  };

  // 테넌트(회사) 등록 처리
  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompName.trim()) {
      setCompanyModalError("고객사(회사)명을 입력해주세요.");
      return;
    }
    if (createAdminWithCompany) {
      if (!compAdminLoginId.trim() || !compAdminPassword.trim() || !compAdminName.trim()) {
        setCompanyModalError("대표 관리자 아이디, 비밀번호, 성명을 입력해주세요.");
        return;
      }
    }

    setCompanyModalError("");
    setIsSubmittingCompany(true);
    try {
      // 1. 회사 생성
      const res = await apiFetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: formCompName.trim(),
          company_code: formCompCode.trim(),
          company_type: formCompType
        })
      });
      const data = await res.json();
      if (!data.success) {
        setCompanyModalError(data.error || "고객사 등록에 실패했습니다.");
        return;
      }

      const newCompId = data.company?.id;

      // 2. 대표 계정 동시 생성 옵션 처리
      if (createAdminWithCompany && newCompId) {
        const opRes = await apiFetch("/api/operators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login_id: compAdminLoginId.trim(),
            password: compAdminPassword.trim(),
            name: compAdminName.trim(),
            role: "TENANT_ADMIN",
            employee_number: compAdminEmpNum.trim() || `EMP-${Date.now().toString().slice(-4)}`,
            phone: compAdminPhone.trim(),
            tenant_id: newCompId
          })
        });
        const opData = await opRes.json();
        if (!opData.success) {
          console.warn("Company created but failed to create admin:", opData.error);
        }
      }

      setShowCompanyModal(false);
      setSuccessMsg(`새로운 고객사 '${formCompName}'가 등록되었습니다.${createAdminWithCompany ? " (대표 계정 포함)" : ""}`);
      setTimeout(() => setSuccessMsg(""), 4000);
      fetchData();
    } catch (err: any) {
      setCompanyModalError(err.message || "통신 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingCompany(false);
    }
  };

  // 등록 모달 열기
  const handleOpenAddModal = (targetDept?: string) => {
    setFormLoginId("");
    setFormPassword("");
    setFormName("");
    setFormRole("SALES_USER");
    setFormEmployeeNumber("");
    setFormPhone("");
    setFormTenantId(targetDept || (selectedDeptFilter !== "ALL" ? selectedDeptFilter : "견적영업부"));
    setFormError("");
    setShowAddModal(true);
  };

  // 등록 처리
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_id: formLoginId.trim(),
          password: formPassword,
          name: formName.trim(),
          role: formRole,
          employee_number: formEmployeeNumber.trim(),
          phone: formPhone.trim(),
          tenant_id: formTenantId
        })
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "등록에 실패했습니다.");
      } else {
        setShowAddModal(false);
        setSuccessMsg("신규 임직원 계정이 성공적으로 등록되었습니다.");
        setTimeout(() => setSuccessMsg(""), 4000);
        fetchData();
      }
    } catch (err: any) {
      setFormError(err.message || "통신 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 수정 모달 열기
  const handleOpenEditModal = (op: Operator) => {
    setEditingOperator(op);
    setFormName(op.name);
    setFormRole(op.role);
    setFormEmployeeNumber(op.employee_number || "");
    setFormPhone(op.phone || "");
    const info = getOperatorDeptAndTitle(op);
    setFormTenantId(info.dept);
    setFormPassword("");
    setFormError("");
    setShowEditModal(true);
  };

  // 수정 처리
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOperator) return;
    setFormError("");
    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/operators", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingOperator.id,
          name: formName,
          role: formRole,
          employee_number: formEmployeeNumber,
          phone: formPhone,
          tenant_id: formTenantId,
          password: formPassword || undefined
        })
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "수정에 실패했습니다.");
      } else {
        setShowEditModal(false);
        setSuccessMsg("임직원 정보가 수정되었습니다.");
        setTimeout(() => setSuccessMsg(""), 4000);
        fetchData();
      }
    } catch (err: any) {
      setFormError(err.message || "통신 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 비활성화 (소프트 삭제)
  const handleDelete = async (op: Operator) => {
    if (!confirm(`'${op.name}' (${op.login_id}) 계정을 비활성화하시겠습니까?`)) return;
    try {
      const res = await apiFetch(`/api/operators?id=${op.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "계정 비활성화에 실패했습니다.");
      } else {
        setSuccessMsg(`'${op.name}' 계정이 비활성화되었습니다.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || "삭제 중 오류가 발생했습니다.");
    }
  };

  // 복원 (RESTORE)
  const handleRestore = async (op: Operator) => {
    if (!confirm(`'${op.name}' (${op.login_id}) 계정을 복원하시겠습니까?`)) return;
    try {
      const res = await apiFetch("/api/operators", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: op.id,
          action: "RESTORE"
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "계정 복원에 실패했습니다.");
      } else {
        setSuccessMsg(`'${op.name}' 계정이 성공적으로 복원되었습니다.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || "복원 중 오류가 발생했습니다.");
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-xs text-slate-500 font-medium">관리자 접근 권한을 확인하는 중입니다...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-12 space-y-4">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">관리자 전용 페이지입니다</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {currentUser ? (
              <>
                현재 로그인된 계정(<strong>{currentUser.name}</strong> / {currentUser.role})은 일반 실무 권한으로, 사원 및 계정 관리 권한이 없습니다.<br />
                최고관리자(<strong>admin</strong>) 계정으로 다시 로그인해 주세요.
              </>
            ) : (
              <>로그인이 필요한 서비스입니다. 최고관리자 계정으로 로그인해 주세요.</>
            )}
          </p>
        </div>
        <div className="pt-2 flex justify-center space-x-2">
          <button
            onClick={() => {
              apiFetch("/api/auth/logout", { method: "POST" }).finally(() => {
                window.location.replace("/login?redirect=/admin/members");
              });
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            최고관리자로 다시 로그인하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 헤더 섹션 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                사내 임직원 계정 관리
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                  세창인터내쇼날 본사
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                세창인터내쇼날 사내 임직원(영업담당, 가공/설계 검토자, 관리자) 계정 및 소속 부서, 업무 권한 관리
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>새로고침</span>
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ 사원 등록</span>
          </button>
        </div>
      </div>

      {/* 성공/에러 배너 */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 필터 및 검색 툴바 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* 탭 바 */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: "all", label: "전체 활성" },
            { id: "SUPER_ADMIN", label: "최고관리자" },
            { id: "TENANT_ADMIN", label: "대표 관리자" },
            { id: "SALES_USER", label: "영업담당" },
            { id: "REVIEWER", label: "검토자" },
            { id: "deleted", label: "비활성/정지" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
              {tab.id === "deleted" && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">
                  {operators.filter((o) => o.deleted_at || o.is_deleted).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 부서 선택 & 검색 */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="flex items-center space-x-1.5 shrink-0">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">전체 부서</option>
              <option value="견적영업부">견적영업부</option>
              <option value="가공기술부">가공기술부</option>
              <option value="설계품질부">설계품질부</option>
              <option value="경영지원부">경영지원부</option>
              <option value="시스템운영본부">시스템운영본부</option>
            </select>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="이름, 아이디, 사번, 연락처 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 사내 임직원 명부 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">사원번호</th>
              <th className="px-4 py-3">성명 (아이디)</th>
              <th className="px-4 py-3">권한 등급</th>
              <th className="px-4 py-3">소속 부서 / 직책</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">관리 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  <span>데이터를 불러오는 중입니다...</span>
                </td>
              </tr>
            ) : filteredOperators.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  등록된 임직원 계정이 없거나 검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
            filteredOperators.map((op) => {
              const roleMeta = ROLE_LABELS[op.role] || { label: op.role, color: "bg-slate-100 text-slate-800" };
              const isDeleted = Boolean(op.deleted_at || op.is_deleted);
              const isSuperAdmin = op.login_id === "admin";
              const isSelf = op.id === currentUser?.id || op.login_id === currentUser?.loginId;

              return (
                <tr key={op.id} className={`hover:bg-slate-50/80 transition-colors ${isDeleted ? "bg-rose-50/30" : ""}`}>
                  <td className="px-4 py-3 font-mono font-bold text-slate-700">
                    {op.employee_number || "-"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center space-x-1.5">
                      <span>{op.name}</span>
                      <span className="text-slate-400 font-mono text-[11px]">({op.login_id})</span>
                      {isSelf && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold">
                          본인
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${roleMeta.color}`}>
                      {roleMeta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {(() => {
                      const info = getOperatorDeptAndTitle(op);
                      const Icon = info.icon;
                      return (
                        <div className="flex items-center space-x-1.5">
                          <Icon className={`w-3.5 h-3.5 ${info.color} shrink-0`} />
                          <span className="font-semibold text-slate-800">{info.dept}</span>
                          <span className="text-slate-300 text-xs">/</span>
                          <span className="text-slate-600 font-medium text-xs">{info.title}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {op.phone ? (
                      <span className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{op.phone}</span>
                      </span>
                    ) : "-"}
                  </td>
                    <td className="px-4 py-3">
                      {isDeleted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                          정지 (소프트삭제)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          정상 가동
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {isDeleted ? (
                        <button
                          onClick={() => handleRestore(op)}
                          className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                          title="계정 복원 (대표 계정 정지 시 차단 가드 적용)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>복원</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(op)}
                            className="px-2 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <Edit className="w-3 h-3" />
                            <span>수정</span>
                          </button>
                          {!isSuperAdmin && !isSelf && (
                            <button
                              onClick={() => handleDelete(op)}
                              className="px-2 py-1 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>비활성화</span>
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 신규 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <span>신규 사원 등록</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} autoComplete="off" className="space-y-3.5 text-xs">
              {/* 브라우저 자동완성 강제 주입 방지용 더미 필드 */}
              <input type="text" name="fake_user_add" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
              <input type="password" name="fake_pwd_add" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">성명 *</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="사원 성명 입력"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">로그인 아이디 *</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={formLoginId}
                  onChange={(e) => setFormLoginId(e.target.value)}
                  placeholder="사원 로그인 아이디 (예: 001, gildong)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">비밀번호 *</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="초기 비밀번호 입력"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">사원번호 (선택)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={formEmployeeNumber}
                    onChange={(e) => setFormEmployeeNumber(e.target.value)}
                    placeholder="예: 001 (미입력 가능)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">연락처 (선택)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">소속 부서</label>
                <select
                  value={formTenantId}
                  onChange={(e) => setFormTenantId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium"
                >
                  <option value="견적영업부">견적영업부</option>
                  <option value="가공기술부">가공기술부</option>
                  <option value="설계품질부">설계품질부</option>
                  <option value="경영지원부">경영지원부</option>
                  <option value="시스템운영본부">시스템운영본부</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "등록 중..." : "등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {showEditModal && editingOperator && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <span>사원 정보 수정 ({editingOperator.login_id})</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} autoComplete="off" className="space-y-3.5 text-xs">
              {/* 브라우저 자동완성 강제 주입 방지용 더미 필드 */}
              <input type="text" name="fake_user_edit" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
              <input type="password" name="fake_pwd_edit" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">성명 *</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  name="edit_operator_name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">사원번호</label>
                  <input
                    type="text"
                    autoComplete="off"
                    name="edit_operator_emp_number"
                    value={formEmployeeNumber}
                    onChange={(e) => setFormEmployeeNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">연락처</label>
                  <input
                    type="text"
                    autoComplete="tel"
                    name="edit_operator_phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">소속 부서</label>
                <select
                  value={formTenantId}
                  onChange={(e) => setFormTenantId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium"
                >
                  <option value="견적영업부">견적영업부</option>
                  <option value="가공기술부">가공기술부</option>
                  <option value="설계품질부">설계품질부</option>
                  <option value="경영지원부">경영지원부</option>
                  <option value="시스템운영본부">시스템운영본부</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">새 비밀번호 (미입력 시 기존 유지)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="edit_operator_new_password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="변경할 경우에만 입력"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs cursor-pointer"
                >
                  {isSubmitting ? "저장 중..." : "변경사항 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 고객사 신규 등록 모달 */}
      {showCompanyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span>신규 고객사 등록</span>
            </h2>

            {companyModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {companyModalError}
              </div>
            )}

            <form onSubmit={handleCompanySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">고객사(회사)명 *</label>
                <input
                  type="text"
                  required
                  value={formCompName}
                  onChange={(e) => setFormCompName(e.target.value)}
                  placeholder="예: 삼성전자(주), 대한엔지니어링 등"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">회사 식별 코드 *</label>
                <input
                  type="text"
                  required
                  value={formCompCode}
                  onChange={(e) => setFormCompCode(e.target.value)}
                  placeholder="예: COMP_001, CUST-1001"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">회사 구분 *</label>
                <select
                  value={formCompType}
                  onChange={(e) => setFormCompType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="CUSTOMER">고객사 (발주처)</option>
                  <option value="PARTNER">외주 가공/협력사</option>
                  <option value="INTERNAL">본사/사내 사업부</option>
                </select>
              </div>

              {/* 고객사 대표 관리자 계정 동시 생성 옵션 */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createAdminWithCompany}
                    onChange={(e) => setCreateAdminWithCompany(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className="font-semibold text-slate-800">
                    고객사 대표 계정(ADMIN) 동시 생성
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5 ml-6">
                  체크 시 고객사 생성과 동시에 해당 회사를 관리할 대표 계정을 즉시 생성합니다.
                </p>

                {createAdminWithCompany && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">대표자 성명 *</label>
                        <input
                          type="text"
                          required={createAdminWithCompany}
                          value={compAdminName}
                          onChange={(e) => setCompAdminName(e.target.value)}
                          placeholder="예: 대표자 성명"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">대표 사번</label>
                        <input
                          type="text"
                          value={compAdminEmpNum}
                          onChange={(e) => setCompAdminEmpNum(e.target.value)}
                          placeholder="예: CEO-001"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">로그인 아이디 *</label>
                        <input
                          type="text"
                          required={createAdminWithCompany}
                          value={compAdminLoginId}
                          onChange={(e) => setCompAdminLoginId(e.target.value)}
                          placeholder="예: sechang_admin"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">초기 비밀번호 *</label>
                        <input
                          type="password"
                          required={createAdminWithCompany}
                          value={compAdminPassword}
                          onChange={(e) => setCompAdminPassword(e.target.value)}
                          placeholder="최소 6자 이상"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">연락처</label>
                      <input
                        type="text"
                        value={compAdminPhone}
                        onChange={(e) => setCompAdminPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCompany}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs cursor-pointer"
                >
                  {isSubmittingCompany ? "등록 중..." : "고객사 등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
