"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, Users, Search, Plus, Edit, Trash2, Key, 
  RefreshCw, AlertTriangle, UserCheck, UserPlus, Phone, 
  ShieldAlert, Building2, RotateCcw, CheckCircle, XCircle, X,
  Sliders, Check, FolderPlus, ChevronUp, ChevronDown, GripVertical,
  ArrowRightLeft, FileSpreadsheet
} from "lucide-react";
import { getTenantStorageKey } from "@/lib/tenant-client";
import { formatPhoneNumber } from "@/lib/formatters";
import SmartTruncateTooltip from "@/components/common/SmartTruncateTooltip";

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
  department?: string | null;
  created_at: string | null;
  deleted_at: string | null;
  is_deleted?: boolean;
  active_cases_count?: number;
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
  TENANT_ADMIN: { label: "총괄 관리자", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  SALES_USER: { label: "영업담당 (실무)", color: "bg-blue-100 text-blue-800 border-blue-200" },
  REVIEWER: { label: "가공·설계 검토 (실무)", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  GUEST: { label: "조회 전용", color: "bg-slate-100 text-slate-800 border-slate-200" },
};

export const getOperatorDeptAndTitle = (op: Operator) => {
  // 1. DB에 저장된 실제 부서 정보 확인 (department, tenant_id, company_id)
  const isCandidate = (val?: string | null) =>
    val && typeof val === 'string' && val.trim() !== '' &&
    !val.startsWith('comp_') && !val.startsWith('tenant-') && !val.startsWith('usr_');

  const assignedDept = [op.department, op.tenant_id, op.company_id].find(isCandidate);

  const dept = assignedDept || (op.login_id === "admin" || op.role === "SUPER_ADMIN" ? "시스템운영본부" : "미지정");

  // 2. 부서별 아이콘 및 테마 색상 매핑
  const isSuperAdmin = op.role === "SUPER_ADMIN" || dept === "시스템운영본부";
  return {
    dept,
    icon: isSuperAdmin ? ShieldCheck : Building2,
    color: isSuperAdmin ? "text-purple-600" : "text-indigo-600"
  };
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
  const [activeTab, setActiveTab] = useState<"all" | "SUPER_ADMIN" | "SALES_USER" | "REVIEWER" | "deleted">("all");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // 부서 관리 상태 (DB 실시간 연동)
  const [departments, setDepartments] = useState<Array<{ name: string; memberCount: number }>>([]);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState("");
  const [editingDeptName, setEditingDeptName] = useState<string | null>(null);
  const [editingDeptVal, setEditingDeptVal] = useState("");
  const [deptModalLoading, setDeptModalLoading] = useState(false);
  const [deptModalError, setDeptModalError] = useState("");
  const [deptModalSuccess, setDeptModalSuccess] = useState("");
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderSaved, setReorderSaved] = useState(false);
  const [draggedDeptIndex, setDraggedDeptIndex] = useState<number | null>(null);
  const [dragOverDeptIndex, setDragOverDeptIndex] = useState<number | null>(null);
  const reorderTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 사원 순서 변경 (하이브리드 리오더링: 드래그 앤 드롭 + 원클릭 화살표 0ms 반응)
  const [draggedMemberIndex, setDraggedMemberIndex] = useState<number | null>(null);
  const [dragOverMemberIndex, setDragOverMemberIndex] = useState<number | null>(null);
  const [memberReorderSaving, setMemberReorderSaving] = useState(false);
  const [memberReorderSaved, setMemberReorderSaved] = useState(false);
  const memberReorderTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [isCustomDeptAdd, setIsCustomDeptAdd] = useState(false);
  const [isCustomDeptEdit, setIsCustomDeptEdit] = useState(false);

  // 업무 인수인계 및 비활성화 상태
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverOperator, setHandoverOperator] = useState<Operator | null>(null);
  const [handoverCases, setHandoverCases] = useState<Array<{
    id: string;
    case_no: string;
    case_name: string;
    status: string;
    company_name: string;
    created_at?: string;
  }>>([]);
  const [handoverSuccessorId, setHandoverSuccessorId] = useState("");
  const [isHandoverSubmitting, setIsHandoverSubmitting] = useState(false);
  const [handoverError, setHandoverError] = useState("");
  const [isCheckingCases, setIsCheckingCases] = useState<string | null>(null);

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

  // 상단 2대 통합 탭: 'MEMBERS' (사원 및 부서 목록) | 'PERMISSIONS' (사원별 권한 설정 표)
  const [mainTab, setMainTab] = useState<'MEMBERS' | 'PERMISSIONS'>('MEMBERS');

  // 권한 관리 상태 (DB 실시간 연동)
  const [userPermissions, setUserPermissions] = useState<any[]>([]);
  const [permSettings, setPermSettings] = useState<any>({
    cross_user_edit_policy: 'REQUIRE_APPROVAL',
    cross_user_approve_policy: 'REQUIRE_APPROVAL',
    require_admin_final_quote_approval: 0,
    approval_valid_hours: 48,
  });
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // 모달 내 업무 세부 권한 설정 필드
  const [formCanEditPrice, setFormCanEditPrice] = useState(true);
  const [formCanApproveQuote, setFormCanApproveQuote] = useState(true);
  const [formCanEditOthers, setFormCanEditOthers] = useState<'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY'>('REQUIRE_APPROVAL');

  // 로컬 스토리지 및 URL 탭 상태 복원
  useEffect(() => {
    try {
      const savedDept = localStorage.getItem("admin_members_dept");
      if (savedDept) setSelectedDeptFilter(savedDept);
      const savedTab = localStorage.getItem("admin_members_tab");
      if (savedTab) setActiveTab(savedTab as any);

      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'permissions' || urlParams.get('tab') === 'matrix') {
          setMainTab('PERMISSIONS');
        }
      }
    } catch {}
  }, []);

  const handleMainTabChange = (tab: 'MEMBERS' | 'PERMISSIONS') => {
    setMainTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'PERMISSIONS') {
        url.searchParams.set('tab', 'permissions');
      } else {
        url.searchParams.delete('tab');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

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

  // 운영자 목록 불러오기 (isSilent: true일 경우 화면 언마운트 및 스크롤 튐 없이 조용히 백그라운드 갱신)
  const fetchData = async (isSilent = false, isRetry = false) => {
    if (!isSilent && !isRetry) setIsLoading(true);
    if (!isRetry) setErrorMsg("");
    try {
      // 1. 운영자 목록 및 권한 설정
      const opUrl = `/api/operators?include_deleted=true`;
      
      const [opRes, compRes, permRes] = await Promise.all([
        apiFetch(opUrl),
        apiFetch("/api/companies"),
        apiFetch("/api/admin/permissions")
      ]);

      const opData = await opRes.json();
      if (opData.success) {
        setOperators(opData.operators || []);
        setErrorMsg("");
      } else {
        // 일시적 통신 실패 시 1회 자동 백그라운드 재시도
        if (!isRetry) {
          setTimeout(() => fetchData(true, true), 700);
          return;
        }
        setErrorMsg(opData.error || "임직원 목록을 불러오지 못했습니다.");
      }

      const compData = await compRes.json();
      if (compData.success || Array.isArray(compData)) {
        setCompanies(compData.companies || compData || []);
      }

      if (permRes.ok) {
        const permData = await permRes.json();
        if (permData.settings) setPermSettings(permData.settings);
        if (permData.userPermissions) setUserPermissions(permData.userPermissions);
        if (permData.pendingCount !== undefined) setPendingCount(permData.pendingCount);
      }
    } catch (err: any) {
      if (!isRetry) {
        setTimeout(() => fetchData(true, true), 700);
        return;
      }
      setErrorMsg(err.message || "데이터 통신 중 오류가 발생했습니다.");
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await apiFetch("/api/admin/departments");
      if (res.ok) {
        const data = await res.json();
        if (data.departments && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch departments:", e);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
      fetchDepartments();
    }
  }, [isAuthorized]);

  // 새 부서 추가
  const handleAddDept = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newDeptInput.trim();
    if (!name) return;
    setDeptModalLoading(true);
    setDeptModalError("");
    try {
      const res = await apiFetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADD", name })
      });
      const data = await res.json();
      if (!data.success) {
        setDeptModalError(data.error || "부서 추가에 실패했습니다.");
      } else {
        setNewDeptInput("");
        setDeptModalSuccess(`'${name}' 부서가 추가되었습니다.`);
        setTimeout(() => setDeptModalSuccess(""), 3000);
        await fetchDepartments();
      }
    } catch (err: any) {
      setDeptModalError(err.message || "통신 오류");
    } finally {
      setDeptModalLoading(false);
    }
  };

  // 부서명 변경 (RENAME)
  const handleRenameDept = async (oldName: string) => {
    const newName = editingDeptVal.trim();
    if (!newName || newName === oldName) {
      setEditingDeptName(null);
      return;
    }
    setDeptModalLoading(true);
    setDeptModalError("");
    try {
      const res = await apiFetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RENAME", oldName, newName })
      });
      const data = await res.json();
      if (!data.success) {
        setDeptModalError(data.error || "부서명 변경에 실패했습니다.");
      } else {
        setEditingDeptName(null);
        setDeptModalSuccess(`'${oldName}' 부서명이 '${newName}'(으)로 변경되었습니다.`);
        setTimeout(() => setDeptModalSuccess(""), 3000);
        await Promise.all([fetchDepartments(), fetchData()]);
      }
    } catch (err: any) {
      setDeptModalError(err.message || "통신 오류");
    } finally {
      setDeptModalLoading(false);
    }
  };

  // 부서 삭제 (DELETE)
  const handleDeleteDept = async (deptName: string, memberCount: number) => {
    if (memberCount > 0) {
      alert(`'${deptName}' 부서에 소속된 사원이 ${memberCount}명 있습니다. 먼저 사원의 소속 부서를 변경해 주세요.`);
      return;
    }
    if (!confirm(`'${deptName}' 부서를 삭제하시겠습니까?`)) return;

    setDeptModalLoading(true);
    setDeptModalError("");
    try {
      const res = await apiFetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE", name: deptName })
      });
      const data = await res.json();
      if (!data.success) {
        setDeptModalError(data.error || "부서 삭제에 실패했습니다.");
      } else {
        setDeptModalSuccess(`'${deptName}' 부서가 삭제되었습니다.`);
        setTimeout(() => setDeptModalSuccess(""), 3000);
        await fetchDepartments();
      }
    } catch (err: any) {
      setDeptModalError(err.message || "통신 오류");
    } finally {
      setDeptModalLoading(false);
    }
  };

  // 부서 순서 일괄 저장 (디바운스 백그라운드 자동 저장)
  const saveNewDeptOrder = (newDepts: Array<{ name: string; memberCount: number }>) => {
    setDepartments(newDepts);

    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
    }

    setReorderSaving(true);
    setReorderSaved(false);

    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch("/api/admin/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REORDER",
            newOrder: newDepts.map((d) => d.name)
          })
        });
        const data = await res.json();
        if (!data.success) {
          setDeptModalError(data.error || "부서 순서 저장에 실패했습니다.");
          setTimeout(() => setDeptModalError(""), 4000);
          await fetchDepartments();
        } else {
          setReorderSaving(false);
          setReorderSaved(true);
          setTimeout(() => setReorderSaved(false), 2000);
        }
      } catch (err: any) {
        setDeptModalError(err.message || "통신 오류");
        setTimeout(() => setDeptModalError(""), 4000);
        await fetchDepartments();
      } finally {
        setReorderSaving(false);
      }
    }, 350);
  };

  // 1) 버튼 클릭 이동 (▲, ▼) - 0ms 즉각 반응 & 디바운스
  const handleMoveDept = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= departments.length) return;

    const newDepts = [...departments];
    const [moved] = newDepts.splice(index, 1);
    newDepts.splice(targetIndex, 0, moved);
    saveNewDeptOrder(newDepts);
  };

  // 2) 마우스 드래그 앤 드롭 이동 (Drag & Drop)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedDeptIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDeptIndex !== index) {
      setDragOverDeptIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedDeptIndex(null);
    setDragOverDeptIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedDeptIndex === null || draggedDeptIndex === targetIndex) {
      setDraggedDeptIndex(null);
      setDragOverDeptIndex(null);
      return;
    }

    const newDepts = [...departments];
    const [moved] = newDepts.splice(draggedDeptIndex, 1);
    newDepts.splice(targetIndex, 0, moved);

    setDraggedDeptIndex(null);
    setDragOverDeptIndex(null);
    saveNewDeptOrder(newDepts);
  };

  // =========================================================================
  // 사원 순서 일괄 저장 (하이브리드 리오더링: 디바운스 백그라운드 자동 저장)
  // =========================================================================
  const saveNewMemberOrder = (newOps: Operator[]) => {
    setOperators(newOps);

    if (memberReorderTimeoutRef.current) {
      clearTimeout(memberReorderTimeoutRef.current);
    }

    setMemberReorderSaving(true);
    setMemberReorderSaved(false);

    memberReorderTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch("/api/operators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REORDER",
            newOrder: newOps.map((o) => o.id)
          })
        });
        const data = await res.json();
        if (!data.success) {
          setErrorMsg(data.error || "사원 순서 저장에 실패했습니다.");
          setTimeout(() => setErrorMsg(""), 3000);
          await fetchData(true);
        } else {
          setMemberReorderSaving(false);
          setMemberReorderSaved(true);
          setTimeout(() => setMemberReorderSaved(false), 2000);
        }
      } catch (err: any) {
        setErrorMsg(err.message || "순서 저장 통신 오류");
        setTimeout(() => setErrorMsg(""), 3000);
        await fetchData(true);
      } finally {
        setMemberReorderSaving(false);
      }
    }, 350);
  };

  // 1) 화살표 클릭 이동 (▲, ▼) - 0ms 즉각 반응 & 350ms 스마트 디바운스
  const handleMoveMember = (idx: number, direction: 'UP' | 'DOWN') => {
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= filteredOperators.length) return;

    const currentOp = filteredOperators[idx];
    const targetOp = filteredOperators[targetIdx];
    if (!currentOp || !targetOp) return;

    const currentMasterIdx = operators.findIndex((o) => o.id === currentOp.id);
    const targetMasterIdx = operators.findIndex((o) => o.id === targetOp.id);
    if (currentMasterIdx === -1 || targetMasterIdx === -1) return;

    const newOps = [...operators];
    const [moved] = newOps.splice(currentMasterIdx, 1);
    newOps.splice(targetMasterIdx, 0, moved);

    saveNewMemberOrder(newOps);
  };

  // 2) 마우스 드래그 앤 드롭 이동 (Drag & Drop)
  const handleMemberDragStart = (e: React.DragEvent, index: number) => {
    setDraggedMemberIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleMemberDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverMemberIndex !== index) {
      setDragOverMemberIndex(index);
    }
  };

  const handleMemberDragEnd = () => {
    setDraggedMemberIndex(null);
    setDragOverMemberIndex(null);
  };

  const handleMemberDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedMemberIndex === null || draggedMemberIndex === targetIndex) {
      setDraggedMemberIndex(null);
      setDragOverMemberIndex(null);
      return;
    }

    const currentOp = filteredOperators[draggedMemberIndex];
    const targetOp = filteredOperators[targetIndex];

    setDraggedMemberIndex(null);
    setDragOverMemberIndex(null);

    if (!currentOp || !targetOp) return;

    const currentMasterIdx = operators.findIndex((o) => o.id === currentOp.id);
    const targetMasterIdx = operators.findIndex((o) => o.id === targetOp.id);
    if (currentMasterIdx === -1 || targetMasterIdx === -1) return;

    const newOps = [...operators];
    const [moved] = newOps.splice(currentMasterIdx, 1);
    newOps.splice(targetMasterIdx, 0, moved);

    saveNewMemberOrder(newOps);
  };

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

  // 탭별 인원수 집계
  const tabCounts = useMemo(() => {
    const active = operators.filter((o) => !o.deleted_at && !o.is_deleted);
    return {
      all: active.length,
      SUPER_ADMIN: active.filter((o) => o.role === "SUPER_ADMIN").length,
      SALES_USER: active.filter((o) => o.role === "SALES_USER").length,
      REVIEWER: active.filter((o) => o.role === "REVIEWER").length,
      deleted: operators.filter((o) => o.deleted_at || o.is_deleted).length,
    };
  }, [operators]);

  // 등록 모달 열기
  const handleOpenAddModal = (targetDept?: string) => {
    setFormLoginId("");
    setFormPassword("");
    setFormName("");
    setFormRole("SALES_USER");
    setFormEmployeeNumber("");
    setFormPhone("");
    const defaultDept = targetDept || (selectedDeptFilter !== "ALL" ? selectedDeptFilter : (departments[0]?.name || ""));
    setFormTenantId(defaultDept);
    setIsCustomDeptAdd(false);
    setFormError("");

    setFormCanEditPrice(true);
    setFormCanApproveQuote(true);
    setFormCanEditOthers('REQUIRE_APPROVAL');

    setShowAddModal(true);
  };

  // 등록 처리
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      const trimmedDept = formTenantId.trim();
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
          tenant_id: trimmedDept
        })
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "등록에 실패했습니다.");
      } else {
        setShowAddModal(false);
        setSuccessMsg("신규 임직원 계정이 성공적으로 등록되었습니다.");
        setTimeout(() => setSuccessMsg(""), 4000);

        // 신규 사원의 권한 자동 저장
        if (data.id) {
          apiFetch('/api/admin/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userPermissions: [{
                user_id: data.id,
                can_edit_price: formCanEditPrice ? 1 : 0,
                can_approve_quote: formCanApproveQuote ? 1 : 0,
                can_edit_others: formCanEditOthers,
                can_approve_others: formCanEditOthers
              }]
            })
          }).catch(() => {});
        }

        fetchData(true);
        // 신규 부서인 경우 부서 목록에도 자동 등록
        if (trimmedDept && !departments.some(d => d.name === trimmedDept)) {
          apiFetch("/api/admin/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "ADD", name: trimmedDept })
          }).then(() => fetchDepartments()).catch(() => {});
        } else {
          fetchDepartments();
        }
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
    setFormPhone(formatPhoneNumber(op.phone || ""));
    const info = getOperatorDeptAndTitle(op);
    setFormTenantId(info.dept);
    setIsCustomDeptEdit(false);
    setFormPassword("");
    setFormError("");

    const userPerm = userPermissions.find((p) => p.user_id === op.id);
    setFormCanEditPrice(userPerm ? Boolean(userPerm.can_edit_price) : true);
    setFormCanApproveQuote(userPerm ? Boolean(userPerm.can_approve_quote) : true);
    setFormCanEditOthers(userPerm ? (userPerm.can_edit_others || 'REQUIRE_APPROVAL') : 'REQUIRE_APPROVAL');

    setShowEditModal(true);
  };

  // 수정 처리
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOperator) return;
    setFormError("");
    setIsSubmitting(true);
    const savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    try {
      const trimmedDept = formTenantId.trim();

      // 1. 즉각적인 낙관적 업데이트 (화면 깜빡임 / 스크롤 이동 0ms 원천 차단)
      const updatedOp = {
        name: formName.trim(),
        role: formRole,
        employee_number: formEmployeeNumber.trim() || null,
        phone: formPhone.trim() || null,
        tenant_id: trimmedDept,
        department: trimmedDept
      };
      setOperators(prev => prev.map(op => (op.id === editingOperator.id ? { ...op, ...updatedOp } : op)));
      setShowEditModal(false);
      setSuccessMsg("임직원 정보 및 권한이 수정되었습니다.");
      setTimeout(() => setSuccessMsg(""), 3000);

      // 2. 권한 백엔드 동기화 및 로컬 상태 반영
      apiFetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPermissions: [{
            user_id: editingOperator.id,
            can_edit_price: formCanEditPrice ? 1 : 0,
            can_approve_quote: formCanApproveQuote ? 1 : 0,
            can_edit_others: formCanEditOthers,
            can_approve_others: formCanEditOthers
          }]
        })
      }).catch(() => {});

      setUserPermissions(prev => {
        const exists = prev.some(p => p.user_id === editingOperator.id);
        if (exists) {
          return prev.map(p => (p.user_id === editingOperator.id ? {
            ...p,
            can_edit_price: formCanEditPrice ? 1 : 0,
            can_approve_quote: formCanApproveQuote ? 1 : 0,
            can_edit_others: formCanEditOthers,
            can_approve_others: formCanEditOthers
          } : p));
        } else {
          return [...prev, {
            user_id: editingOperator.id,
            user_name: formName.trim(),
            user_login_id: editingOperator.login_id,
            user_role: formRole,
            can_edit_price: formCanEditPrice ? 1 : 0,
            can_approve_quote: formCanApproveQuote ? 1 : 0,
            can_edit_others: formCanEditOthers,
            can_approve_others: formCanEditOthers
          }];
        }
      });

      // 3. 백엔드 통신
      const res = await apiFetch("/api/operators", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingOperator.id,
          name: formName.trim(),
          role: formRole,
          employee_number: formEmployeeNumber.trim(),
          phone: formPhone.trim(),
          tenant_id: trimmedDept,
          password: formPassword || undefined
        })
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "수정에 실패했습니다.");
        await fetchData(true); // 실패 시 롤백
      } else {
        await fetchData(true); // 조용한 백그라운드 동기화 (화면 언마운트 없음)
        if (typeof window !== 'undefined' && window.scrollY !== savedScrollY) {
          window.scrollTo({ top: savedScrollY, behavior: 'instant' as ScrollBehavior });
        }
        // 신규 부서인 경우 부서 목록에도 자동 등록
        if (trimmedDept && !departments.some(d => d.name === trimmedDept)) {
          apiFetch("/api/admin/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "ADD", name: trimmedDept })
          }).then(() => fetchDepartments()).catch(() => {});
        }
      }
    } catch (err: any) {
      setFormError(err.message || "통신 중 오류가 발생했습니다.");
      await fetchData(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 권한 매트릭스 일괄 저장
  const handleSaveAllPermissions = async () => {
    setSavingPermissions(true);
    try {
      const res = await apiFetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: permSettings,
          userPermissions
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg("사원별 권한 설정이 성공적으로 저장되었습니다.");
        setTimeout(() => setSuccessMsg(""), 3500);
        await fetchData(true);
      } else {
        setErrorMsg(data.error || "권한 설정 저장에 실패했습니다.");
        setTimeout(() => setErrorMsg(""), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "통신 중 오류가 발생했습니다.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setSavingPermissions(false);
    }
  };

  // 권한 토글 헬퍼
  const handleToggleUserPerm = (userId: string, field: string, val: any) => {
    setUserPermissions(prev => {
      const exists = prev.some(p => p.user_id === userId);
      if (exists) {
        return prev.map(p => (p.user_id === userId ? { ...p, [field]: val } : p));
      } else {
        const targetOp = operators.find(o => o.id === userId);
        return [
          ...prev,
          {
            user_id: userId,
            user_name: targetOp?.name || '',
            user_login_id: targetOp?.login_id || '',
            user_role: targetOp?.role || 'SALES_USER',
            can_edit_own: 1,
            can_approve_own: 1,
            can_edit_others: 'REQUIRE_APPROVAL',
            can_approve_others: 'REQUIRE_APPROVAL',
            can_edit_price: 1,
            can_approve_quote: 1,
            [field]: val
          }
        ];
      }
    });
  };

  // 견적건 상태 뱃지 매핑 유틸리티
  const getCaseStatusBadge = (status: string) => {
    switch (status) {
      case 'READY_FOR_QUOTE':
        return { label: '견적 산출대기', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'ANALYZED':
        return { label: '도면 분석완료', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'DRAFT':
        return { label: '초안 작성중', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
      case 'PRIVATE_APPROVAL':
        return { label: '비공개 승인대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'SUBMITTED':
        return { label: '견적 제출완료', cls: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'IN_REVIEW':
        return { label: '검토 진행중', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      default:
        return { label: status || '진행중', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // 계정 비활성화 실행 (Zero Scroll Jump & Silent Refresh 준수)
  const executeDeactivation = async (id: string, name: string, successorId?: string) => {
    const savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    try {
      const url = successorId
        ? `/api/operators?id=${id}&successor_id=${successorId}`
        : `/api/operators?id=${id}`;
      const res = await apiFetch(url, { method: "DELETE" });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "계정 비활성화에 실패했습니다.");
      }

      setSuccessMsg(data.message || `'${name}' 계정이 비활성화되었습니다.`);
      setTimeout(() => setSuccessMsg(""), 4500);

      // 모달 닫기 및 상태 정리
      setShowHandoverModal(false);
      setHandoverOperator(null);
      setHandoverCases([]);
      setHandoverSuccessorId("");
      setHandoverError("");

      // 사일런트 백그라운드 새로고침 및 스크롤 고정
      await fetchData(true);
      if (typeof window !== 'undefined' && window.scrollY !== savedScrollY) {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' as ScrollBehavior });
      }
    } catch (err: any) {
      throw err;
    }
  };

  // 비활성화 버튼 클릭 핸들러 (진행 중인 견적건 검사 후 인수인계 팝업 또는 즉시 비활성화)
  const handleDelete = async (op: Operator) => {
    try {
      setIsCheckingCases(op.id);
      const res = await apiFetch(`/api/operators?check_active_cases=${op.id}`);
      const data = await res.json();
      setIsCheckingCases(null);

      if (data.success && data.active_cases_count > 0) {
        // 진행 중인 견적건이 있는 경우: 인수인계 모달 오픈
        setHandoverOperator(op);
        setHandoverCases(data.active_cases || []);
        
        // 후임자 기본값: 본인 제외 첫 번째 활성 담당자
        const availableSuccessors = operators.filter(
          (o) => o.id !== op.id && !o.deleted_at && !o.is_deleted
        );
        setHandoverSuccessorId(availableSuccessors[0]?.id || "");
        setHandoverError("");
        setShowHandoverModal(true);
      } else {
        // 진행 중인 견적건이 없는 경우: 즉시 비활성화 확인
        if (!confirm(`'${op.name}' (${op.login_id}) 계정을 비활성화하시겠습니까?\n(진행 중인 견적건이 없어 즉시 비활성화됩니다.)`)) {
          return;
        }
        await executeDeactivation(op.id, op.name);
      }
    } catch (err: any) {
      setIsCheckingCases(null);
      alert(err.message || "견적 진행 데이터 확인 중 오류가 발생했습니다.");
    }
  };

  // 인수인계 제출 처리
  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverOperator) return;

    if (!handoverSuccessorId) {
      setHandoverError("업무를 인수인계할 후임 담당자를 선택해 주세요.");
      return;
    }

    setIsHandoverSubmitting(true);
    setHandoverError("");
    try {
      await executeDeactivation(handoverOperator.id, handoverOperator.name, handoverSuccessorId);
    } catch (err: any) {
      setHandoverError(err.message || "인수인계 처리 중 오류가 발생했습니다.");
    } finally {
      setIsHandoverSubmitting(false);
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
        fetchData(true);
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
    <div className="p-6 max-w-7xl mx-auto space-y-3.5">
      {/* 슬림 헤더 섹션 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white px-5 py-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-2xs shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              사원 및 권한 관리 센터 <span className="text-indigo-600 text-sm font-semibold">(Members & Permissions)</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              사내 임직원 계정과 부서 배정, 단가 수정 및 견적 승인 업무 권한을 통합 관리합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-indigo-600" : "text-slate-400"}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* 최상단 2대 통합 탭 바 (사원 및 부서 목록 / 사원별 권한 설정 표) */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-2">
        <button
          type="button"
          onClick={() => handleMainTabChange('MEMBERS')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
            mainTab === 'MEMBERS'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>사원 및 부서 목록</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-mono ${
            mainTab === 'MEMBERS' ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}>
            {operators.filter((o) => !o.is_deleted).length}인
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleMainTabChange('PERMISSIONS')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
            mainTab === 'PERMISSIONS'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>사원별 권한 설정 표 (매트릭스)</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10.5px] font-black bg-amber-500 text-white animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* 플로팅 토스트 알림 (레이아웃 시프트 및 화면 밀림 원천 방지) */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-[80] p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-6 right-6 z-[80] p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center space-x-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {mainTab === 'MEMBERS' && (
        <>
          {/* 필터 및 검색 & 등록 통합 툴바 */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row gap-3 justify-between items-center">
        {/* 탭 바 */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full xl:w-auto pb-1 xl:pb-0">
          {[
            { id: "all" as const, label: "전체 활성", count: tabCounts.all },
            { id: "SUPER_ADMIN" as const, label: "최고관리자", count: tabCounts.SUPER_ADMIN },
            { id: "SALES_USER" as const, label: "영업 실무", count: tabCounts.SALES_USER },
            { id: "REVIEWER" as const, label: "가공·설계 검토", count: tabCounts.REVIEWER },
            { id: "deleted" as const, label: "비활성/정지", count: tabCounts.deleted },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected
                      ? "bg-indigo-700 text-white"
                      : tab.id === "deleted"
                      ? tab.count > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 부서 선택 & 검색 & 사원 등록 통합 영역 */}
        <div className="flex items-center space-x-2 w-full xl:w-auto justify-end">
          <div className="flex items-center space-x-1.5 shrink-0">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">전체 부서</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setDeptModalError("");
                setDeptModalSuccess("");
                setShowDeptModal(true);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 flex items-center space-x-1 transition-colors cursor-pointer shrink-0"
              title="사내 부서 신설, 명칭 수정, 순서 관리"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              <span>부서 관리</span>
            </button>
          </div>

          <div className="relative flex-1 sm:w-56 sm:flex-initial">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="이름, 아이디, 연락처 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer shrink-0 whitespace-nowrap"
            title="신규 임직원 등록"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ 사원 등록</span>
          </button>
        </div>
      </div>

      {/* 사내 임직원 명부 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 text-center w-20">순서</th>
              <th className="px-4 py-3">사원번호</th>
              <th className="px-4 py-3">성명 (아이디)</th>
              <th className="px-4 py-3 text-center">진행 견적</th>
              <th className="px-4 py-3">권한 등급</th>
              <th className="px-4 py-3">소속 부서</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">관리 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  <span>데이터를 불러오는 중입니다...</span>
                </td>
              </tr>
            ) : errorMsg && operators.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-1" />
                    <p className="text-sm font-bold text-slate-700">{errorMsg}</p>
                    <p className="text-xs text-slate-400">데이터베이스와의 일시적 연결 지연이 발생했습니다.</p>
                    <button
                      type="button"
                      onClick={() => fetchData()}
                      className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>데이터 다시 불러오기</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : filteredOperators.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  등록된 임직원 계정이 없거나 검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
            filteredOperators.map((op, idx) => {
              const roleMeta = ROLE_LABELS[op.role] || { label: op.role, color: "bg-slate-100 text-slate-800" };
              const isDeleted = Boolean(op.deleted_at || op.is_deleted);
              const isSuperAdmin = op.login_id === "admin";
              const isSelf = op.id === currentUser?.id || op.login_id === currentUser?.loginId;
              const isFirst = idx === 0;
              const isLast = idx === filteredOperators.length - 1;
              const isBeingDragged = draggedMemberIndex === idx;
              const isDragOver = dragOverMemberIndex === idx;

              return (
                <tr
                  key={op.id}
                  draggable={true}
                  onDragStart={(e) => handleMemberDragStart(e, idx)}
                  onDragOver={(e) => handleMemberDragOver(e, idx)}
                  onDragEnd={handleMemberDragEnd}
                  onDrop={(e) => handleMemberDrop(e, idx)}
                  className={`group hover:bg-slate-50/80 transition-colors ${
                    isDeleted ? "bg-rose-50/30" : ""
                  } ${
                    isBeingDragged
                      ? "opacity-40 bg-indigo-50/50"
                      : isDragOver
                      ? "border-t-2 border-indigo-500 bg-indigo-50/30"
                      : ""
                  }`}
                >
                  {/* 순서 변경 (호버 시에만 슬림 노출: 평소에는 단정한 01, 호버 시 ▲▼ 등장, Zero Layout Shift) */}
                  <td className="px-2 py-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center justify-center min-w-[76px] h-7 px-1.5 rounded-lg group-hover:bg-slate-100/70 transition-colors">
                      {/* 드래그 핸들 (⋮⋮) */}
                      <div
                        className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-500 hover:!text-indigo-600 p-0.5 rounded transition shrink-0"
                        title="마우스로 끌어서 원하는 위치로 이동"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      {/* 순서 번호 (두 자리 모노스페이스) */}
                      <span className="w-6 text-center text-xs font-mono font-bold text-slate-400 group-hover:text-slate-800 transition-colors">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      {/* 화살표 이동 버튼 (▲, ▼) - 평소에는 투명(opacity-0), 호버 시 부드럽게 등장 */}
                      <div className="flex items-center space-x-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveMember(idx, 'UP');
                          }}
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/70 rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-300 cursor-pointer disabled:cursor-not-allowed transition"
                          title="위로 1칸 이동"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveMember(idx, 'DOWN');
                          }}
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/70 rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-300 cursor-pointer disabled:cursor-not-allowed transition"
                          title="아래로 1칸 이동"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 font-mono font-bold text-slate-700">
                    {op.employee_number || <span className="text-slate-300 font-normal">-</span>}
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
                  <td className="px-4 py-3 text-center">
                    {(op.active_cases_count ?? 0) > 0 ? (
                      <a
                        href={`/cases?manager=${op.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-2xs group cursor-pointer"
                        title={`클릭 시 '${op.name}' 담당자의 진행 견적 ${op.active_cases_count}건 목록으로 이동`}
                      >
                        <FileSpreadsheet className="w-3 h-3 text-blue-500" />
                        <span>진행 {op.active_cases_count}건</span>
                        <span className="text-[10px] text-blue-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5">↗</span>
                      </a>
                    ) : (
                      <span className="text-slate-300 font-mono text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${roleMeta.color}`}>
                        {roleMeta.label}
                      </span>
                      {(() => {
                        const perm = userPermissions.find((p) => p.user_id === op.id);
                        if (!perm) return null;
                        return (
                          <div className="flex items-center gap-1 text-[10px]">
                            {perm.can_edit_price ? (
                              <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200" title="단가 직접 수정 가능">
                                단가수정
                              </span>
                            ) : null}
                            {perm.can_approve_quote ? (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200" title="견적 최종 승인 가능">
                                견적승인
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {(() => {
                      const info = getOperatorDeptAndTitle(op);
                      const Icon = info.icon;
                      return (
                        <div className="flex items-center space-x-1.5">
                          <Icon className={`w-3.5 h-3.5 ${info.color} shrink-0`} />
                          <span className="font-semibold text-slate-800">{info.dept}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {op.phone ? (
                      <span className="flex items-center space-x-1 font-mono text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{op.phone}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">-</span>
                    )}
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
                              disabled={isCheckingCases === op.id}
                              className="px-2 py-1 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                              title="계정 비활성화 및 견적 인수인계"
                            >
                              {isCheckingCases === op.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
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

        {/* 테이블 하단 상태바 및 순서 자동 저장 인디케이터 (Zero Layout Shift) */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span>총 <strong className="text-slate-700 font-semibold">{filteredOperators.length}</strong>명</span>
            {filteredOperators.length !== operators.length && (
              <span className="text-slate-400 text-[11px]">(전체 {operators.length}명 중 필터링됨)</span>
            )}
          </div>

          <div className="h-5 flex items-center space-x-1.5 text-xs">
            {memberReorderSaving && (
              <span className="text-indigo-600 flex items-center space-x-1 font-medium animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>사원 순서 저장 중...</span>
              </span>
            )}
            {!memberReorderSaving && memberReorderSaved && (
              <span className="text-emerald-600 flex items-center space-x-1 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>✓ 사원 순서 자동 저장 완료</span>
              </span>
            )}
          </div>
        </div>
      </div>
      </>
    )}

      {/* 탭 2: 사원별 업무 권한 설정 표 (매트릭스) */}
      {mainTab === 'PERMISSIONS' && (
        <div className="space-y-4">
          {/* 상단 통계 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">전체 견적 담당자</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {operators.filter((o) => !o.is_deleted).length}
                <span className="text-xs font-normal text-slate-500 ml-1">인</span>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">단가 직접 수정 권한자</div>
              <div className="text-xl font-bold font-mono text-blue-600 mt-1">
                {userPermissions.filter((p) => p.can_edit_price).length}
                <span className="text-xs font-normal text-slate-500 ml-1">명</span>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">견적 최종 승인권자</div>
              <div className="text-xl font-bold font-mono text-emerald-600 mt-1">
                {userPermissions.filter((p) => p.can_approve_quote).length}
                <span className="text-xs font-normal text-slate-500 ml-1">명</span>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">타인 건 자유 협업자</div>
              <div className="text-xl font-bold font-mono text-purple-600 mt-1">
                {userPermissions.filter((p) => p.can_edit_others === 'ALLOW').length}
                <span className="text-xs font-normal text-slate-500 ml-1">명</span>
              </div>
            </div>
          </div>

          {/* 사원별 권한 매트릭스 카드 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  사원별 개별 업무 권한 설정 표 (매트릭스)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 사원별로 단가 직접 수정 권한, 견적서 최종 승인권, 타인 견적건 수정 정책을 원클릭으로 토글 설정합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveAllPermissions}
                disabled={savingPermissions}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer self-start sm:self-auto disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingPermissions ? '저장 중...' : '권한 설정 일괄 저장 적용'}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-14">No.</th>
                    <th className="py-2.5 px-4 w-48">담당자 (아이디)</th>
                    <th className="py-2.5 px-4 w-36">소속 부서</th>
                    <th className="py-2.5 px-4 w-36">기본 등급</th>
                    <th className="py-2.5 px-4 text-center w-44">단가 수기 수정 권한</th>
                    <th className="py-2.5 px-4 text-center w-44">견적서 최종 승인권</th>
                    <th className="py-2.5 px-4 text-center w-48">타 담당자 건 수정 정책</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operators.filter((o) => !o.is_deleted).map((op, idx) => {
                    const perm = userPermissions.find((p) => p.user_id === op.id);
                    const canEditPrice = perm ? Boolean(perm.can_edit_price) : true;
                    const canApproveQuote = perm ? Boolean(perm.can_approve_quote) : true;
                    const canEditOthers = perm ? (perm.can_edit_others || 'REQUIRE_APPROVAL') : 'REQUIRE_APPROVAL';
                    const roleMeta = ROLE_LABELS[op.role] || { label: op.role, color: 'bg-slate-100 text-slate-800' };
                    const deptInfo = getOperatorDeptAndTitle(op);

                    return (
                      <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-slate-400 font-bold">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{op.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{op.login_id}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">
                          {deptInfo.dept}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${roleMeta.color}`}>
                            {roleMeta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={canEditPrice}
                              onChange={(e) => handleToggleUserPerm(op.id, 'can_edit_price', e.target.checked ? 1 : 0)}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className={`text-xs font-semibold ${canEditPrice ? 'text-blue-700' : 'text-slate-400'}`}>
                              {canEditPrice ? '수정 허용' : '수정 불가'}
                            </span>
                          </label>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={canApproveQuote}
                              onChange={(e) => handleToggleUserPerm(op.id, 'can_approve_quote', e.target.checked ? 1 : 0)}
                              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className={`text-xs font-semibold ${canApproveQuote ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {canApproveQuote ? '승인 가능' : '승인권 없음'}
                            </span>
                          </label>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <select
                            value={canEditOthers}
                            onChange={(e) => handleToggleUserPerm(op.id, 'can_edit_others', e.target.value)}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 shadow-2xs"
                          >
                            <option value="REQUIRE_APPROVAL">승인 필수 (결재 후)</option>
                            <option value="ALLOW">상시 허용 (자유 협업)</option>
                            <option value="DENY">수정 차단 (조회 전용)</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 신규 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-sans placeholder:font-sans"
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
                    onChange={(e) => setFormPhone(formatPhoneNumber(e.target.value))}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700 whitespace-nowrap">소속 부서 *</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomDeptAdd(!isCustomDeptAdd)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition whitespace-nowrap cursor-pointer"
                    >
                      {isCustomDeptAdd ? "목록에서 선택" : "+ 직접 입력"}
                    </button>
                  </div>
                  {isCustomDeptAdd ? (
                    <input
                      type="text"
                      value={formTenantId}
                      onChange={(e) => setFormTenantId(e.target.value)}
                      placeholder="신규 부서명 (예: 생산관리부)"
                      className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm bg-indigo-50/20"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={formTenantId}
                        onChange={(e) => {
                          if (e.target.value === "__MANAGE__") {
                            setShowDeptModal(true);
                          } else {
                            setFormTenantId(e.target.value);
                          }
                        }}
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium"
                      >
                        {departments.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                        {formTenantId && !departments.some((d) => d.name === formTenantId) && (
                          <option value={formTenantId}>{formTenantId}</option>
                        )}
                        <option value="__MANAGE__" className="text-indigo-600 font-semibold bg-indigo-50/80">
                          ⚙ 부서 목록 관리·삭제...
                        </option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowDeptModal(true)}
                        className="p-2 border border-slate-200 hover:border-indigo-300 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer shrink-0"
                        title="부서 목록 관리 및 삭제"
                      >
                        <Building2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">업무 권한 등급 *</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium"
                  >
                    <option value="SALES_USER">영업담당 (실무)</option>
                    <option value="REVIEWER">가공·설계 검토 (실무)</option>
                    <option value="SUPER_ADMIN">시스템 최고관리자</option>
                  </select>
                </div>
              </div>

              {/* 업무 세부 권한 설정 */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>업무 세부 권한 설정</span>
                  </span>
                  <span className="text-[10.5px] font-normal text-slate-500">개별 맞춤 부여</span>
                </div>

                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formCanEditPrice}
                      onChange={(e) => setFormCanEditPrice(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800">단가 직접 수정 허용</span>
                    <span className="text-slate-400 text-[11px]">(Manual Price)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formCanApproveQuote}
                      onChange={(e) => setFormCanApproveQuote(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800">견적서 최종 승인 허용</span>
                    <span className="text-slate-400 text-[11px]">(Quote Approval)</span>
                  </label>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="font-semibold text-slate-700">타 담당자 견적건 수정 정책</span>
                    <select
                      value={formCanEditOthers}
                      onChange={(e) => setFormCanEditOthers(e.target.value as any)}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700"
                    >
                      <option value="REQUIRE_APPROVAL">승인 필수 (결재 후)</option>
                      <option value="ALLOW">상시 허용 (자유 협업)</option>
                      <option value="DENY">수정 차단 (조회 전용)</option>
                    </select>
                  </div>
                </div>
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
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
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
                    onChange={(e) => setFormPhone(formatPhoneNumber(e.target.value))}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700 whitespace-nowrap">소속 부서</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomDeptEdit(!isCustomDeptEdit)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition whitespace-nowrap cursor-pointer"
                    >
                      {isCustomDeptEdit ? "목록에서 선택" : "+ 직접 입력"}
                    </button>
                  </div>
                  {isCustomDeptEdit ? (
                    <input
                      type="text"
                      value={formTenantId}
                      onChange={(e) => setFormTenantId(e.target.value)}
                      placeholder="신규 부서명 입력"
                      className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm bg-indigo-50/20"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={formTenantId}
                        onChange={(e) => {
                          if (e.target.value === "__MANAGE__") {
                            setShowDeptModal(true);
                          } else {
                            setFormTenantId(e.target.value);
                          }
                        }}
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium"
                      >
                        {departments.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                        {formTenantId && !departments.some((d) => d.name === formTenantId) && (
                          <option value={formTenantId}>{formTenantId}</option>
                        )}
                        <option value="__MANAGE__" className="text-indigo-600 font-semibold bg-indigo-50/80">
                          ⚙ 부서 목록 관리·삭제...
                        </option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowDeptModal(true)}
                        className="p-2 border border-slate-200 hover:border-indigo-300 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer shrink-0"
                        title="부서 목록 관리 및 삭제"
                      >
                        <Building2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">업무 권한 등급</label>
                  <select
                    disabled={editingOperator.login_id === "admin"}
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-sm font-medium disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="SALES_USER">영업담당 (실무)</option>
                    <option value="REVIEWER">가공·설계 검토 (실무)</option>
                    <option value="SUPER_ADMIN">시스템 최고관리자</option>
                  </select>
                </div>
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-sans placeholder:font-sans"
                />
              </div>

              {/* 업무 세부 권한 설정 */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>업무 세부 권한 설정</span>
                  </span>
                  <span className="text-[10.5px] font-normal text-slate-500">개별 맞춤 설정</span>
                </div>

                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formCanEditPrice}
                      onChange={(e) => setFormCanEditPrice(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800">단가 직접 수정 허용</span>
                    <span className="text-slate-400 text-[11px]">(Manual Price)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formCanApproveQuote}
                      onChange={(e) => setFormCanApproveQuote(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800">견적서 최종 승인 허용</span>
                    <span className="text-slate-400 text-[11px]">(Quote Approval)</span>
                  </label>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="font-semibold text-slate-700">타 담당자 견적건 수정 정책</span>
                    <select
                      value={formCanEditOthers}
                      onChange={(e) => setFormCanEditOthers(e.target.value as any)}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700"
                    >
                      <option value="REQUIRE_APPROVAL">승인 필수 (결재 후)</option>
                      <option value="ALLOW">상시 허용 (자유 협업)</option>
                      <option value="DENY">수정 차단 (조회 전용)</option>
                    </select>
                  </div>
                </div>
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

      {/* 부서 관리 모달 */}
      {showDeptModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col h-[600px] max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">회사 부서 관리</h3>
                  <p className="text-xs text-slate-500">부서 추가/삭제 및 마우스 드래그(⋮⋮)나 화살표(▲/▼)로 순서를 변경할 수 있습니다.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeptModal(false);
                  setDeptModalError("");
                  setDeptModalSuccess("");
                  setEditingDeptName(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 성공 / 에러 알림 (신규 등록 / 수정 / 삭제 전용) */}
            {deptModalSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center space-x-1.5 shrink-0">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{deptModalSuccess}</span>
              </div>
            )}
            {deptModalError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-1.5 shrink-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deptModalError}</span>
              </div>
            )}

            {/* 신규 부서 등록 폼 */}
            <form onSubmit={handleAddDept} className="mt-4 flex space-x-2 shrink-0">
              <input
                type="text"
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                placeholder="새 부서명 (예: 생산관리부, 품질보증팀)"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={deptModalLoading}
              />
              <button
                type="submit"
                disabled={deptModalLoading || !newDeptInput.trim()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center space-x-1 shrink-0 cursor-pointer transition"
              >
                <Plus className="w-4 h-4" />
                <span>부서 추가</span>
              </button>
            </form>

            {/* 부서 목록 */}
            <div className="mt-4 flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {departments.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  등록된 부서가 없습니다.
                </div>
              ) : (
                departments.map((dept, idx) => {
                  const isEditing = editingDeptName === dept.name;
                  const isFirst = idx === 0;
                  const isLast = idx === departments.length - 1;
                  const isDragging = draggedDeptIndex === idx;
                  const isDragOver = dragOverDeptIndex === idx && draggedDeptIndex !== idx;

                  return (
                    <div
                      key={dept.name}
                      draggable={!isEditing}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`p-3 flex items-center justify-between transition-all select-none group ${
                        isDragging
                          ? "opacity-30 bg-indigo-50 border-2 border-dashed border-indigo-400 rounded-lg scale-[0.99]"
                          : isDragOver
                          ? "bg-indigo-50/80 border-t-2 border-indigo-500 shadow-xs"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex-1 flex items-center space-x-2 mr-2">
                          <input
                            type="text"
                            value={editingDeptVal}
                            onChange={(e) => setEditingDeptVal(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleRenameDept(dept.name);
                              } else if (e.key === "Escape") {
                                setEditingDeptName(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameDept(dept.name)}
                            disabled={deptModalLoading}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold cursor-pointer shrink-0"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptName(null)}
                            className="px-2.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-md text-xs cursor-pointer shrink-0"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          {/* 드래그 핸들 (⋮⋮) */}
                          <div
                            className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-500 hover:!text-indigo-600 p-0.5 rounded transition shrink-0"
                            title="마우스로 끌어서 원하는 위치로 이동"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>

                          <span className="w-5 text-center text-xs font-mono font-bold text-slate-400">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-800 text-sm">{dept.name}</span>
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center space-x-1">
                          {/* 순서 이동 화살표 (▲, ▼) - 0ms 즉각 반응 및 연속 클릭 가능 */}
                          <div className="flex items-center space-x-0.5 mr-1 border-r border-slate-200 pr-1.5">
                            <button
                              type="button"
                              disabled={isFirst}
                              onClick={() => handleMoveDept(idx, 'UP')}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed transition"
                              title="위로 1칸 이동"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={() => handleMoveDept(idx, 'DOWN')}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed transition"
                              title="아래로 1칸 이동"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeptName(dept.name);
                              setEditingDeptVal(dept.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md cursor-pointer transition"
                            title="부서명 변경"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDept(dept.name, dept.memberCount)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer transition"
                            title="부서 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-400 flex items-center space-x-1.5 h-6">
                {reorderSaving && (
                  <span className="text-indigo-600 flex items-center space-x-1 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>순서 변경 저장 중...</span>
                  </span>
                )}
                {!reorderSaving && reorderSaved && (
                  <span className="text-emerald-600 flex items-center space-x-1 font-medium">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>순서 자동 저장 완료</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeptModal(false);
                  setDeptModalError("");
                  setDeptModalSuccess("");
                  setEditingDeptName(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg cursor-pointer transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 인수인계 및 계정 비활성화 모달 */}
      {showHandoverModal && handoverOperator && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    업무 인수인계 및 계정 비활성화
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    진행 중인 견적건을 안전하게 후임 담당자에게 이관합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isHandoverSubmitting) return;
                  setShowHandoverModal(false);
                  setHandoverOperator(null);
                  setHandoverCases([]);
                  setHandoverError("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 본문 */}
            <form onSubmit={handleHandoverSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* 안내 배너 */}
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <p>
                    <strong>'{handoverOperator.name}'</strong> ({handoverOperator.login_id}) 담당자가 현재 진행 중인 견적건이 <strong className="text-rose-600 underline font-extrabold">{handoverCases.length}건</strong> 있습니다.
                  </p>
                  <p className="mt-1 text-amber-800">
                    계정을 비활성화하기 전에 후임 담당자를 지정해 주세요. 지정된 후임자에게 견적건의 관리 및 워크벤치 편집 권한이 승계됩니다.
                  </p>
                  <div className="mt-2 pt-2 border-t border-amber-200/60 text-[11px] text-amber-700 flex items-center space-x-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>과거 완료 및 보관된 이전 견적서는 원본 작성자 이력이 100% 영구 보존됩니다.</span>
                  </div>
                </div>
              </div>

              {/* 진행 중인 견적건 목록 미리보기 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-0.5">
                  <span className="flex items-center space-x-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                    <span>이관 대상 진행 견적 목록</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-mono font-semibold">
                    총 {handoverCases.length}건
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {handoverCases.map((c) => {
                    const statusBadge = getCaseStatusBadge(c.status);
                    return (
                      <div key={c.id} className="p-2.5 flex items-center justify-between hover:bg-white transition-colors text-xs">
                        <div className="min-w-0 pr-3 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-slate-800 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                              {c.case_no}
                            </span>
                            <span className="text-[11px] text-slate-400">|</span>
                            <span className="text-[11.5px] font-medium text-slate-600 truncate max-w-[120px]">
                              {c.company_name}
                            </span>
                          </div>
                          <div className="mt-1">
                            <SmartTruncateTooltip
                              text={c.case_name}
                              className="font-medium text-slate-900 text-xs"
                              maxWidthClass="max-w-[280px]"
                            />
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 후임 담당자 선택 드롭다운 */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-800">
                  인수인계 대상자 (후임 담당자) <span className="text-rose-500">*</span>
                </label>
                {operators.filter((o) => o.id !== handoverOperator.id && !o.deleted_at && !o.is_deleted).length === 0 ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                    인수인계 가능한 다른 활성 계정이 없습니다. 먼저 신규 사원을 등록하거나 다른 계정을 활성화해 주세요.
                  </div>
                ) : (
                  <select
                    required
                    value={handoverSuccessorId}
                    onChange={(e) => setHandoverSuccessorId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs font-medium text-slate-800 shadow-2xs"
                  >
                    <option value="" disabled>후임 담당자를 선택하세요</option>
                    {operators
                      .filter((o) => o.id !== handoverOperator.id && !o.deleted_at && !o.is_deleted)
                      .map((o) => {
                        const deptInfo = getOperatorDeptAndTitle(o);
                        const roleLabel = ROLE_LABELS[o.role]?.label || o.role;
                        return (
                          <option key={o.id} value={o.id}>
                            {o.name} ({o.login_id}) · {deptInfo.dept} · {roleLabel}
                          </option>
                        );
                      })}
                  </select>
                )}
                <p className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>선택한 담당자가 위 {handoverCases.length}건의 워크벤치 편집 권한을 즉시 승계합니다.</span>
                </p>
              </div>

              {/* 에러 메시지 */}
              {handoverError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{handoverError}</span>
                </div>
              )}

              {/* 모달 하단 버튼 */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  disabled={isHandoverSubmitting}
                  onClick={() => {
                    setShowHandoverModal(false);
                    setHandoverOperator(null);
                    setHandoverCases([]);
                    setHandoverError("");
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isHandoverSubmitting || !handoverSuccessorId}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isHandoverSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>이관 및 비활성화 중...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>인수인계 및 계정 비활성화</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
