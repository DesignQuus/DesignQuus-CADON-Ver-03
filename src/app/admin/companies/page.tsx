'use client';

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  FileText,
  Search,
  Plus,
  Edit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Briefcase,
  KeyRound,
  X,
  Factory,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface Company {
  id: string;
  company_name: string;
  company_code: string;
  company_type?: string;
  is_active: number;
  created_at?: string;
  deleted_at?: string | null;
  memberCount?: number;
  caseCount?: number;
  projectCount?: number;
  tenantAdmin?: {
    id: string;
    login_id: string;
    name: string;
  } | null;
  is_deleted?: boolean;
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 필터 및 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'SUSPENDED' | 'ALL'>('ACTIVE');

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // 신규 고객사 폼 상태
  const [formName, setFormName] = useState('');
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminLoginId, setAdminLoginId] = useState('');
  const [adminPassword, setAdminPassword] = useState('Cadon1234!@');
  const [adminName, setAdminName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // 고객사 수정 폼 상태
  const [editName, setEditName] = useState('');
  const [resetPassword, setResetPassword] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('Cadon2026!@');

  // 1. 인증 확인 (SUPER_ADMIN 전용)
  useEffect(() => {
    setAuthChecking(true);
    apiFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          window.location.replace('/login?redirect=/admin/companies');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          if (['SUPER_ADMIN', 'TENANT_ADMIN'].includes(data.user.role)) {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
          }
        } else {
          setIsAuthorized(false);
        }
      })
      .catch(() => setIsAuthorized(false))
      .finally(() => setAuthChecking(false));
  }, []);

  // 2. 회사 목록 및 실시간 지표 불러오기
  const fetchCompanies = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/companies?include_stats=true&include_deleted=true');
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
      } else {
        setErrorMsg(data.error || '고객사 목록을 불러오지 못했습니다.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchCompanies();
    }
  }, [isAuthorized]);

  // 본사(세창인터내쇼날) 및 발주 고객사 분리
  const sechangCompany = useMemo(() => {
    return companies.find((c) => c.company_name?.includes('세창') || c.company_type === 'TENANT') || null;
  }, [companies]);

  const clientCompanies = useMemo(() => {
    return companies.filter((c) => !c.company_name?.includes('세창') && c.company_type !== 'TENANT');
  }, [companies]);

  // 3. 고객사 통계 계산 (발주처 기준)
  const stats = useMemo(() => {
    const total = clientCompanies.length;
    const active = clientCompanies.filter((c) => c.is_active === 1 && !c.deleted_at).length;
    const suspended = total - active;
    const totalMembers = clientCompanies.reduce((acc, c) => acc + (c.memberCount || 0), 0);
    const totalCases = clientCompanies.reduce((acc, c) => acc + (c.caseCount || 0), 0);
    return { total, active, suspended, totalMembers, totalCases };
  }, [clientCompanies]);

  // 4. 필터링된 고객사 목록
  const filteredClients = useMemo(() => {
    return clientCompanies.filter((c) => {
      // 상태 필터
      const isActive = c.is_active === 1 && !c.deleted_at;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'SUSPENDED' && isActive) return false;

      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (c.company_name || '').toLowerCase().includes(q);
        const matchCode = (c.company_code || '').toLowerCase().includes(q);
        const matchId = (c.id || '').toLowerCase().includes(q);
        return matchName || matchCode || matchId;
      }
      return true;
    });
  }, [clientCompanies, statusFilter, searchQuery]);

  // 신규 등록 모달 열기
  const handleOpenAddModal = () => {
    setFormName('');
    setCreateAdmin(true);
    setAdminLoginId('');
    setAdminPassword('Cadon1234!@');
    setAdminName('구매/견적 담당자');
    setModalError('');
    setShowAddModal(true);
  };

  // 신규 고객사 등록 제출
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError('고객사(회사)명을 입력해주세요.');
      return;
    }
    if (createAdmin) {
      if (!adminLoginId.trim()) {
        setModalError('고객사 담당자 로그인 아이디를 입력해주세요.');
        return;
      }
      if (!adminPassword.trim()) {
        setModalError('초기 비밀번호를 입력해주세요.');
        return;
      }
      if (!adminName.trim()) {
        setModalError('담당자 성명을 입력해주세요.');
        return;
      }
    }

    setIsSubmitting(true);
    setModalError('');

    try {
      const res = await apiFetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: formName.trim(),
          company_type: 'CUSTOMER',
          createAdminWithCompany: createAdmin,
          adminLoginId: adminLoginId.trim(),
          adminPassword: adminPassword.trim(),
          adminName: adminName.trim()
        })
      });
      const data = await res.json();
      if (!data.success) {
        setModalError(data.error || '고객사 등록에 실패했습니다.');
        return;
      }

      setShowAddModal(false);
      setSuccessMsg(`새로운 발주 고객사 '${formName}'가 성공적으로 등록되었습니다.${createAdmin ? ' (견적 담당자 계정 등록 완료)' : ''}`);
      setTimeout(() => setSuccessMsg(''), 5000);
      fetchCompanies();
    } catch (err: any) {
      setModalError(err.message || '통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 고객사 관리/수정 모달 열기
  const handleOpenEditModal = (c: Company) => {
    setSelectedCompany(c);
    setEditName(c.company_name);
    setResetPassword(false);
    setNewAdminPassword('Cadon2026!@');
    setModalError('');
    setShowEditModal(true);
  };

  // 고객사 수정 제출
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    if (!editName.trim()) {
      setModalError('고객사명을 입력해주세요.');
      return;
    }
    if (resetPassword && !newAdminPassword.trim()) {
      setModalError('새 담당자 임시 비밀번호를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setModalError('');
    try {
      const res = await apiFetch('/api/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCompany.id,
          company_name: editName.trim(),
          company_type: selectedCompany.company_type || 'CUSTOMER',
          is_active: selectedCompany.is_active,
          reset_admin_password: resetPassword ? newAdminPassword.trim() : undefined
        })
      });
      const data = await res.json();
      if (!data.success) {
        setModalError(data.error || '고객사 정보 수정에 실패했습니다.');
        return;
      }

      setShowEditModal(false);
      let successText = `고객사 '${editName}' 정보가 성공적으로 수정되었습니다.`;
      if (resetPassword) {
        successText += ' (담당자 임시 비밀번호가 재설정되었습니다.)';
      }
      setSuccessMsg(successText);
      setTimeout(() => setSuccessMsg(''), 5000);
      fetchCompanies();
    } catch (err: any) {
      setModalError(err.message || '통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 거래 상태 중단 (비활성화)
  const handleSuspendCompany = async (c: Company) => {
    const confirmText = `정말로 고객사 '${c.company_name}'와의 거래 상태를 '거래 중단'으로 변경하시겠습니까?\n\n- 해당 고객사 담당자의 신규 견적 접수가 일시 중단됩니다.\n- 기존 도면 및 견적 데이터는 안전하게 보존되며 언제든 거래 재개가 가능합니다.`;
    if (!window.confirm(confirmText)) return;

    try {
      const res = await apiFetch(`/api/companies?id=${encodeURIComponent(c.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '거래 상태 변경에 실패했습니다.');
        return;
      }
      setSuccessMsg(`고객사 '${c.company_name}'와의 거래 상태가 '거래 중단'으로 변경되었습니다.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchCompanies();
    } catch (err: any) {
      alert(err.message || '통신 오류가 발생했습니다.');
    }
  };

  // 거래 재개 (정상 거래 복원)
  const handleRestoreCompany = async (c: Company) => {
    if (!window.confirm(`고객사 '${c.company_name}'와의 거래를 정상 거래 상태로 재개하시겠습니까?`)) return;

    try {
      const res = await apiFetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '거래 재개 처리에 실패했습니다.');
        return;
      }
      setSuccessMsg(`고객사 '${c.company_name}'와의 거래가 정상 재개되었습니다.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchCompanies();
    } catch (err: any) {
      alert(err.message || '통신 오류가 발생했습니다.');
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-sm font-semibold text-slate-500">최고관리자 권한 및 고객사 대장을 확인하고 있습니다...</span>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 px-4">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">접근 권한이 없습니다</h2>
        <p className="text-xs text-slate-500 max-w-sm text-center">
          본 화면은 시스템 최고관리자 및 총괄 관리자(ADMIN) 전용 화면입니다. 일반 견적 실무 담당자는 본사 견적의뢰 대시보드로 이동해 주세요.
        </p>
        <Link
          href="/cases"
          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center space-x-1.5"
        >
          <span>견적의뢰 관리 화면으로 이동</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* 1. 상단 브레드크럼 및 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 mb-1.5 font-medium">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800">
              {currentUser?.role === 'SUPER_ADMIN' ? '👑 시스템 최고관리자 포털' : '🏢 본사 총괄 관리자 포털'}
            </span>
            <span>&gt;</span>
            <span className="text-blue-600 font-bold">거래처(고객사) 마스터</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2.5">
            <Briefcase className="w-7 h-7 text-blue-600" />
            <span>고객사 및 발주처 마스터 관리</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            세창인터내쇼날에 가공·제작 도면 견적을 의뢰하는 고객사(삼성전자, 보그워너 등)와 바이어 견적 담당자를 등록·관리하는 거래처 마스터 관리 센터입니다.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            onClick={fetchCompanies}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>신규 고객사 등록</span>
          </button>
        </div>
      </div>

      {/* 성공/에러 알림 배너 */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-center space-x-2.5 shadow-2xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-sm flex items-center space-x-2.5 shadow-2xs animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* 2. 본사(세창인터내쇼날) 운영 주체 프로필 카드 */}
      {sechangCompany && (
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 font-bold shrink-0">
              <Factory className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  제조·견적 총괄 본사 (당사)
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5"></span>
                  시스템 정상 가동
                </span>
              </div>
              <h2 className="text-lg font-black text-white mt-0.5 tracking-tight">
                {sechangCompany.company_name}
              </h2>
              <p className="text-xs text-slate-300">
                세창인터내쇼날 사내 통합 견적 및 2차 외주가공 단가 통제 엔진이 활성화되어 있습니다.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4 border-t md:border-t-0 md:border-l border-slate-700/80 pt-3 md:pt-0 md:pl-5 shrink-0 text-xs">
            <div>
              <div className="text-slate-400 text-[11px]">본사 실무 담당자</div>
              <div className="font-bold text-white text-sm">{sechangCompany.memberCount || 3}명 (김세창 외)</div>
            </div>
            <button
              onClick={() => handleOpenEditModal(sechangCompany)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold transition-colors cursor-pointer"
            >
              본사 정보 관리
            </button>
          </div>
        </div>
      )}

      {/* 3. 발주 고객사 요약 KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">총 등록 고객사</div>
            <div className="text-2xl font-black text-slate-900">{stats.total}개사</div>
            <div className="text-[11px] text-slate-400 mt-1">도면 발주 거래처</div>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">정상 거래 중</div>
            <div className="text-2xl font-black text-emerald-600">{stats.active}개사</div>
            <div className="text-[11px] text-slate-400 mt-1">
              거래 중단/휴면: <span className="text-rose-500 font-bold">{stats.suspended}</span>개
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">고객사 견적 담당자</div>
            <div className="text-2xl font-black text-indigo-600">{stats.totalMembers}명</div>
            <div className="text-[11px] text-slate-400 mt-1">바이어 계정 총합</div>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">견적의뢰 접수 총계</div>
            <div className="text-2xl font-black text-purple-600">{stats.totalCases}건</div>
            <div className="text-[11px] text-slate-400 mt-1">고객사 발주 프로젝트</div>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold">
            <FileText className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 4. 검색 및 상태 필터 툴바 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 justify-between items-center">
        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* 상태 필터 탭 */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'ACTIVE' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              정상 거래 ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter('SUSPENDED')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'SUSPENDED' ? 'bg-white text-rose-700 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              거래 중단 ({stats.suspended})
            </button>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              전체 보기 ({stats.total})
            </button>
          </div>
        </div>

        {/* 검색창 */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="고객사명, 식별코드 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* 5. 발주 고객사 대장 메인 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-800">발주 고객사 대장</span>
            <span className="text-[11px] text-slate-400">({filteredClients.length}개사)</span>
          </div>
          <span className="text-[11px] text-slate-500">세창인터내쇼날 발주 의뢰 고객사 목록</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">고객사(발주처)명</th>
                <th className="px-4 py-3.5">거래 상태</th>
                <th className="px-4 py-3.5 text-center">고객사 담당자 수</th>
                <th className="px-4 py-3.5 text-center">견적의뢰 접수</th>
                <th className="px-4 py-3.5">등록일</th>
                <th className="px-4 py-3.5 text-right">관리 액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>고객사 목록 및 실시간 지표를 불러오는 중입니다...</span>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                    <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-700 mb-1">등록된 고객사가 없거나 검색 결과가 없습니다.</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                      새로운 발주 고객사를 등록하여 도면 견적 접수와 담당 바이어를 관리해 보세요.
                    </p>
                    <button
                      onClick={handleOpenAddModal}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>신규 고객사 등록하기</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredClients.map((comp) => {
                  const isActive = comp.is_active === 1 && !comp.deleted_at;

                  return (
                    <tr
                      key={comp.id}
                      className={`hover:bg-slate-50/70 transition-colors ${!isActive ? 'bg-rose-50/20' : ''}`}
                    >
                      {/* 회사명 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                              <span>{comp.company_name}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                발주 고객사
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">{comp.company_code || comp.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* 거래 상태 배지 */}
                      <td className="px-4 py-3.5">
                        {isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                            정상 거래
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>
                            거래 중단
                          </span>
                        )}
                      </td>

                      {/* 고객사 담당자 수 */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80"
                          title="해당 고객사의 견적/발주 담당 바이어 수"
                        >
                          <Users className="w-3 h-3 text-slate-400" />
                          <span>{comp.memberCount || 0}명</span>
                        </span>
                      </td>

                      {/* 견적의뢰 접수 건수 */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                          <FileText className="w-3 h-3" />
                          <span>{comp.caseCount || 0}건</span>
                        </span>
                      </td>

                      {/* 등록일 */}
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {comp.created_at ? new Date(comp.created_at).toLocaleDateString() : '-'}
                      </td>

                      {/* 액션 버튼 */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEditModal(comp)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                          title="고객사명 변경 및 담당 바이어 계정 관리"
                        >
                          <Edit className="w-3 h-3" />
                          <span>고객사 정보</span>
                        </button>

                        {isActive ? (
                          <button
                            onClick={() => handleSuspendCompany(comp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                            title="해당 고객사와의 거래 일시 중단"
                          >
                            <PauseCircle className="w-3 h-3 text-rose-600" />
                            <span>거래중단</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreCompany(comp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                            title="정상 거래 재개"
                          >
                            <PlayCircle className="w-3 h-3 text-emerald-600" />
                            <span>거래재개</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* [모달 1] 신규 고객사 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 sm:p-7 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">신규 발주 고객사 등록</h2>
                  <p className="text-xs text-slate-400">세창인터내쇼날에 견적을 의뢰할 신규 고객사 및 담당 바이어 등록</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div className="font-bold text-slate-800 text-sm flex items-center space-x-1.5 text-blue-600">
                  <span>1. 고객사 기본 정보</span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">고객사명 (상호명) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="예: 삼성전자(주), (주)보그워너, 엠브이텍"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                  />
                </div>
              </div>

              {/* 고객사 견적 담당자 계정 등록 옵션 */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createAdmin}
                    onChange={(e) => setCreateAdmin(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-xs">
                    이 고객사의 발주/견적 담당자(바이어) 계정도 함께 등록
                  </span>
                </label>

                {createAdmin && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">담당자 성명 *</label>
                        <input
                          type="text"
                          required={createAdmin}
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                          placeholder="예: 김구매 과장"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">로그인 아이디 *</label>
                        <input
                          type="text"
                          required={createAdmin}
                          value={adminLoginId}
                          onChange={(e) => setAdminLoginId(e.target.value)}
                          placeholder="예: samsung_buyer"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">초기 비밀번호 *</label>
                        <input
                          type="text"
                          required={createAdmin}
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="비밀번호 입력"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? '등록 처리 중...' : '고객사 등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* [모달 2] 고객사 정보 관리 모달 */}
      {showEditModal && selectedCompany && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedCompany.id === sechangCompany?.id ? '본사 정보 관리' : '고객사 정보 관리'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedCompany.id === sechangCompany?.id ? '세창인터내쇼날 본사 상호명 및 계정 관리' : '고객사 상호명 및 담당자 계정 관리'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              {/* 1. 회사명 입력 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {selectedCompany.id === sechangCompany?.id ? '본사 상호명 *' : '고객사명 *'}
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="회사명을 입력하세요"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900"
                />
              </div>

              {/* 2. 담당자(마스터) 계정 관제 카드 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>{selectedCompany.id === sechangCompany?.id ? '본사 대표 계정' : '고객사 대표 담당자 계정'}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    {selectedCompany.tenantAdmin?.login_id || 'ACCOUNT'}
                  </span>
                </div>

                {selectedCompany.tenantAdmin ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-slate-200/80">
                      <div>
                        <span className="text-slate-400 text-[11px] block">성명</span>
                        <strong className="text-slate-800 font-semibold">{selectedCompany.tenantAdmin.name || '미등록'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">로그인 아이디</span>
                        <strong className="text-blue-600 font-mono font-bold">{selectedCompany.tenantAdmin.login_id}</strong>
                      </div>
                    </div>

                    {/* 비밀번호 재설정 체크박스 */}
                    <div className="pt-1">
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={resetPassword}
                          onChange={(e) => setResetPassword(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="font-bold text-slate-700 text-xs flex items-center space-x-1">
                          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                          <span>담당자 비밀번호 초기화 (재설정)</span>
                        </span>
                      </label>

                      {resetPassword && (
                        <div className="mt-2 pl-6">
                          <input
                            type="text"
                            required={resetPassword}
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            placeholder="새 임시 비밀번호 입력"
                            className="w-full px-3 py-2 bg-white border border-amber-300 focus:ring-2 focus:ring-amber-400/20 rounded-xl text-xs font-mono font-bold text-slate-900"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">
                            * 저장 시 안내할 새 임시 비밀번호로 즉시 갱신됩니다.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
                    등록된 대표 담당자 계정이 없습니다. (필요 시 신규 계정을 발급할 수 있습니다.)
                  </div>
                )}
              </div>

              {/* 3. 현황 요약 칩 */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">소속 사원수</span>
                  <strong className="text-slate-800 font-bold">{selectedCompany.memberCount || 0}명</strong>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">견적 접수</span>
                  <strong className="text-purple-700 font-bold">{selectedCompany.caseCount || 0}건</strong>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">거래 상태</span>
                  <strong className={selectedCompany.is_active === 1 && !selectedCompany.deleted_at ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    {selectedCompany.is_active === 1 && !selectedCompany.deleted_at ? '정상 거래' : '거래 중단'}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? '저장 처리 중...' : '변경사항 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
