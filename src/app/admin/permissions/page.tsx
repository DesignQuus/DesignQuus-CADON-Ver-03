'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  Building2,
  FileText,
  AlertTriangle,
  RefreshCw,
  Save,
  Check,
  X,
  Send,
  Lock,
  Unlock,
  ChevronRight,
  Info
} from 'lucide-react';

interface ApprovalRequest {
  id: string;
  request_type: string;
  quotation_case_id: string;
  case_no: string;
  case_name: string;
  company_name: string;
  requester_user_id: string;
  requester_name: string;
  requester_role: string;
  owner_user_id: string;
  owner_name: string;
  owner_role: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by_user_id?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  review_comment?: string;
  created_at: string;
}

interface UserPermission {
  user_id: string;
  user_name: string;
  user_login_id: string;
  user_role: string;
  can_edit_own: number;
  can_approve_own: number;
  can_edit_others: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  can_approve_others: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  can_edit_price: number;
  can_approve_quote: number;
  updated_at: string;
}

interface SystemSettings {
  id: string;
  cross_user_edit_policy: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  cross_user_approve_policy: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  require_admin_final_quote_approval: number;
  approval_valid_hours: number;
  updated_at: string;
}

export default function AdminPermissionsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'POLICY' | 'MATRIX'>('REQUESTS');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    id: 'GLOBAL_CONFIG',
    cross_user_edit_policy: 'REQUIRE_APPROVAL',
    cross_user_approve_policy: 'REQUIRE_APPROVAL',
    require_admin_final_quote_approval: 0,
    approval_valid_hours: 48,
    updated_at: ''
  });
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  // Decision Modal state
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [decisionType, setDecisionType] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionLoading, setDecisionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch current session
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentUser(meData.user);
      }

      // 2. Fetch permissions & global settings
      const permRes = await fetch('/api/admin/permissions');
      if (permRes.ok) {
        const permData = await permRes.json();
        if (permData.settings) setSettings(permData.settings);
        if (permData.userPermissions) setUserPermissions(permData.userPermissions);
      }

      // 3. Fetch requests
      const reqRes = await fetch(`/api/approvals?status=${requestFilter}`);
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.requests || []);
      }
    } catch (err) {
      console.error('Fetch permissions data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [requestFilter]);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;

  const handleSavePolicyAndMatrix = async () => {
    if (!isSuperAdmin) {
      alert('최고관리자만 설정을 변경할 수 있습니다.');
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          userPermissions
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ type: 'success', text: data.message || '승인권한 설정이 안전하게 저장되었습니다.' });
        setTimeout(() => setStatusMessage(null), 4000);
        await fetchData();
      } else {
        setStatusMessage({ type: 'error', text: data.error || '설정 저장에 실패했습니다.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '저장 중 네트워크 오류' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDecision = (req: ApprovalRequest, type: 'APPROVED' | 'REJECTED') => {
    setSelectedReq(req);
    setDecisionType(type);
    setDecisionComment(type === 'APPROVED' ? '타 담당자 견적건 수정 및 승인 요청을 승인합니다.' : '사유 불충분으로 반려합니다.');
  };

  const handleExecuteDecision = async () => {
    if (!selectedReq) return;
    setDecisionLoading(true);
    try {
      const res = await fetch(`/api/approvals/${selectedReq.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decisionType,
          comment: decisionComment
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSelectedReq(null);
        setStatusMessage({
          type: 'success',
          text: `[${selectedReq.case_no}] 건이 성공적으로 ${decisionType === 'APPROVED' ? '승인' : '반려'}되었습니다.`
        });
        setTimeout(() => setStatusMessage(null), 4000);
        await fetchData();
      } else {
        alert(data.error || '결재 처리에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message || '결재 통신 오류');
    } finally {
      setDecisionLoading(false);
    }
  };

  const updateManagerPerm = (userId: string, field: keyof UserPermission, value: any) => {
    setUserPermissions((prev) =>
      prev.map((item) => (item.user_id === userId ? { ...item, [field]: value } : item))
    );
  };

  if (!loading && currentUser && !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(currentUser.role)) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">접근 권한이 없습니다</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          승인권한 설정 및 결재 관리 페이지는 최고관리자 또는 회원사 대표 관리자만 접근할 수 있는 보호된 관리 메뉴입니다.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors"
        >
          견적 대시보드로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* 1. Header Banner */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Security & Approval Management</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                {isSuperAdmin ? '최고관리자 승인권한 설정 및 결재 관리' : '사내 승인권한 설정 및 결재 관리'}
                {isSuperAdmin && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    최고관리자 제어 센터
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {isSuperAdmin
                  ? '본인 견적건은 자유롭게 수정하고, 타 담당자의 견적건은 최고관리자의 승인을 거쳐 수정할 수 있도록 결재 및 권한 정책을 통제합니다.'
                  : '사내 견적건에 대한 수정 및 결재 승인 정책을 관리하고, 소속 담당자들의 승인 권한을 통제합니다.'}
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center space-x-1.5 shadow-xs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>새로고침</span>
              </button>

              {isSuperAdmin && (
                <button
                  onClick={handleSavePolicyAndMatrix}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? '저장 중...' : '설정 저장 적용'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Feedback alert */}
          {statusMessage && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm font-semibold flex items-center space-x-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Stat Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">결재 대기 중인 요청</div>
                <div className="text-2xl font-extrabold text-amber-600">{pendingRequestsCount}건</div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">타 담당자 건 수정 정책</div>
                <div className="text-sm font-bold text-slate-800 mt-1">
                  {settings.cross_user_edit_policy === 'REQUIRE_APPROVAL' && (isSuperAdmin ? '최고관리자 승인 필수' : '대표 관리자 승인 필수')}
                  {settings.cross_user_edit_policy === 'ALLOW' && '자유 협업 허용'}
                  {settings.cross_user_edit_policy === 'DENY' && '타인 건 수정 완전 차단'}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-purple-100 border border-purple-300 flex items-center justify-center text-purple-700 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">관리 대상 견적 담당자</div>
                <div className="text-2xl font-extrabold text-purple-700">{userPermissions.length || 0}인</div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">결재 처리 완료 누적</div>
                <div className="text-2xl font-extrabold text-emerald-600">
                  {requests.filter((r) => r.status === 'APPROVED').length}건
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 mt-8 space-x-8">
            <button
              onClick={() => setActiveTab('REQUESTS')}
              className={`pb-3 text-sm font-bold border-b-2 flex items-center space-x-2 transition-colors ${
                activeTab === 'REQUESTS'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>실시간 결재 승인함</span>
              {pendingRequestsCount > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white font-black">
                  {pendingRequestsCount}
                </span>
              )}
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('POLICY')}
                className={`pb-3 text-sm font-bold border-b-2 flex items-center space-x-2 transition-colors ${
                  activeTab === 'POLICY'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>최고관리자 전역 승인 정책</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('MATRIX')}
              className={`pb-3 text-sm font-bold border-b-2 flex items-center space-x-2 transition-colors ${
                activeTab === 'MATRIX'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>견적 담당자 권한 매트릭스 ({userPermissions.length || 0}인)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Tab Contents */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* TAB 1: 결재 승인함 */}
        {activeTab === 'REQUESTS' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Filter toolbar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-500">결재 상태 필터:</span>
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setRequestFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      requestFilter === st
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {st === 'ALL' && '전체 요청'}
                    {st === 'PENDING' && '대기중 (결재 필요)'}
                    {st === 'APPROVED' && '승인 완료'}
                    {st === 'REJECTED' && '반려됨'}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-500">
                총 <strong className="text-slate-800">{requests.length}</strong>건의 결재 요청
              </div>
            </div>

            {/* Request Table */}
            {requests.length === 0 ? (
              <div className="text-center py-16 text-slate-400 font-medium">
                해당 조건의 결재 요청 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">요청 일시</th>
                      <th className="py-3 px-4">요청자 (신청자)</th>
                      <th className="py-3 px-4">대상 견적건 / 고객사</th>
                      <th className="py-3 px-4">원 견적 담당자</th>
                      <th className="py-3 px-4">수정/승인 요청 사유</th>
                      <th className="py-3 px-4 text-center">결재 상태</th>
                      <th className="py-3 px-4">처리자 / 의견</th>
                      {isSuperAdmin && <th className="py-3 px-4 text-center">관리 결재</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {requests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black flex items-center justify-center border border-blue-200">
                              {r.requester_name.slice(0, 1)}
                            </span>
                            <span>{r.requester_name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Link
                            href={`/cases/${r.quotation_case_id}`}
                            className="font-bold text-blue-600 hover:underline block leading-tight"
                          >
                            {r.case_no}
                          </Link>
                          <div className="text-[11px] text-slate-700 font-medium truncate max-w-xs mt-0.5">
                            {r.case_name}
                          </div>
                          <div className="text-[10px] text-slate-400">{r.company_name}</div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-700 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center border border-slate-300">
                              {r.owner_name.slice(0, 1)}
                            </span>
                            <span>{r.owner_name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800 text-[11px] max-w-sm whitespace-pre-wrap">
                            {r.reason}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {r.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <Clock className="w-3 h-3" />
                              대기중
                            </span>
                          )}
                          {r.status === 'APPROVED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              승인 완료
                            </span>
                          )}
                          {r.status === 'REJECTED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XCircle className="w-3 h-3" />
                              반려됨
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[11px]">
                          {r.reviewer_name ? (
                            <div>
                              <div className="font-semibold text-slate-800">{r.reviewer_name}</div>
                              {r.review_comment && (
                                <div className="text-slate-500 text-[10px] mt-0.5 italic">
                                  &quot;{r.review_comment}&quot;
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        {isSuperAdmin && (
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {r.status === 'PENDING' ? (
                              <div className="flex items-center justify-center space-x-1.5">
                                <button
                                  onClick={() => handleOpenDecision(r, 'APPROVED')}
                                  className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center gap-1 shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>승인</span>
                                </button>
                                <button
                                  onClick={() => handleOpenDecision(r, 'REJECTED')}
                                  className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors flex items-center gap-1 shadow-xs"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>반려</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">결재완료</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 최고관리자 전역 승인 정책 */}
        {activeTab === 'POLICY' && isSuperAdmin && (
          <div className="space-y-6">
            {/* Policy Card 1: 타 담당자 견적건 수정 정책 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  타 담당자 견적건 수정 및 승인 정책 (Cross-User Policy)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                견적 담당자가 자신이 등록하지 않은 타 담당자의 견적건을 열람했을 때 적용할 기본 수정/승인 권한 정책을 지정합니다.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                {/* Option 1: REQUIRE_APPROVAL (Default & Recommended) */}
                <label
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    settings.cross_user_edit_policy === 'REQUIRE_APPROVAL'
                      ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Lock className="w-4 h-4 text-blue-600" />
                        최고관리자 결재 승인 필수
                      </div>
                      <input
                        type="radio"
                        name="cross_user_edit_policy"
                        value="REQUIRE_APPROVAL"
                        checked={settings.cross_user_edit_policy === 'REQUIRE_APPROVAL'}
                        onChange={() =>
                          setSettings((s) => ({
                            ...s,
                            cross_user_edit_policy: 'REQUIRE_APPROVAL',
                            cross_user_approve_policy: 'REQUIRE_APPROVAL'
                          }))
                        }
                        className="text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800">
                      ★ 기본 권장 표준 모드
                    </span>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      타 담당자 건은 <strong>조회만 가능</strong>하며, 수정을 원할 경우 최고관리자에게 사전 승인을 요청해야 합니다. 최고관리자가 승인한 건에 한해 수정할 수 있습니다.
                    </p>
                  </div>
                </label>

                {/* Option 2: ALLOW (Open Collaboration) */}
                <label
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    settings.cross_user_edit_policy === 'ALLOW'
                      ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Unlock className="w-4 h-4 text-emerald-600" />
                        자유 협업 모드 (상시 허용)
                      </div>
                      <input
                        type="radio"
                        name="cross_user_edit_policy"
                        value="ALLOW"
                        checked={settings.cross_user_edit_policy === 'ALLOW'}
                        onChange={() =>
                          setSettings((s) => ({
                            ...s,
                            cross_user_edit_policy: 'ALLOW',
                            cross_user_approve_policy: 'ALLOW'
                          }))
                        }
                        className="text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                      신속 협업
                    </span>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      모든 견적 담당자가 상호 자유롭게 타 담당자 건의 도면 분석, 단가 수정, 견적서 승인을 직접 수행할 수 있습니다.
                    </p>
                  </div>
                </label>

                {/* Option 3: DENY (Strict Isolation) */}
                <label
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    settings.cross_user_edit_policy === 'DENY'
                      ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        타 담당자 수정 완전 차단
                      </div>
                      <input
                        type="radio"
                        name="cross_user_edit_policy"
                        value="DENY"
                        checked={settings.cross_user_edit_policy === 'DENY'}
                        onChange={() =>
                          setSettings((s) => ({
                            ...s,
                            cross_user_edit_policy: 'DENY',
                            cross_user_approve_policy: 'DENY'
                          }))
                        }
                        className="text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">
                      엄격한 격리
                    </span>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      본인 담당건 외에는 최고관리자를 제외한 어떤 사용자도 타인 건의 단가나 BOM을 수정할 수 없도록 원천 차단합니다.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Policy Card 2: 추가 세부 통제 옵션 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-slate-700" />
                추가 세부 결재 옵션
              </h3>

              <div className="divide-y divide-slate-100 mt-4">
                <div className="py-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      견적서 최종 발행 시 최고관리자 결재 필수 여부
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      활성화 시 담당자가 최종 견적서를 발행하기 전 최고관리자의 최종 결재가 완료되어야 확정됩니다.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.require_admin_final_quote_approval)}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        require_admin_final_quote_approval: e.target.checked ? 1 : 0
                      }))
                    }
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                <div className="py-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      승인된 수정 권한의 유효 시간 (시간 단위)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      최고관리자가 승인 결재를 완료한 시점부터 해당 담당자에게 수정 권한이 부여되는 기간 (기본 48시간)
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={settings.approval_valid_hours}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          approval_valid_hours: Math.max(1, Number(e.target.value) || 48)
                        }))
                      }
                      className="w-24 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-center font-bold"
                    />
                    <span className="text-xs text-slate-600 font-semibold">시간</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSavePolicyAndMatrix}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? '저장 중...' : '전역 승인 정책 저장'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 5인 견적 담당자 권한 매트릭스 */}
        {activeTab === 'MATRIX' && isSuperAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  견적 담당자 5인 개별 승인 권한 매트릭스
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 담당자별로 본인 건 및 타 담당자 건에 대한 수정/승인 권한을 개별적으로 맞춤 제어할 수 있습니다.
                </p>
              </div>

              <button
                onClick={handleSavePolicyAndMatrix}
                disabled={saving}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>권한 변경 사항 저장</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">담당자 (사용자)</th>
                    <th className="py-3 px-4">직책 / 권한 등급</th>
                    <th className="py-3 px-4 text-center">본인 건 수정/승인</th>
                    <th className="py-3 px-4 text-center">타 담당자 건 수정 권한</th>
                    <th className="py-3 px-4 text-center">단가 수기 수정 권한</th>
                    <th className="py-3 px-4 text-center">견적서 최종 승인권</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {userPermissions.map((up) => {
                    const isAdmin = up.user_role === 'SUPER_ADMIN';
                    return (
                      <tr key={up.user_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-black flex items-center justify-center border border-blue-200">
                              {up.user_name.slice(0, 1)}
                            </span>
                            <div>
                              <div>{up.user_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{up.user_login_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {isAdmin ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800">
                              최고관리자 (SUPER_ADMIN)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              영업견적 담당자
                            </span>
                          )}
                        </td>
                        {/* 본인 건 수정/승인 */}
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            disabled={isAdmin}
                            checked={Boolean(up.can_edit_own)}
                            onChange={(e) => updateManagerPerm(up.user_id, 'can_edit_own', e.target.checked ? 1 : 0)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        {/* 타 담당자 건 수정 권한 */}
                        <td className="py-3 px-4 text-center">
                          {isAdmin ? (
                            <span className="text-purple-700 font-bold text-[11px]">항상 허용 (관리자)</span>
                          ) : (
                            <select
                              value={up.can_edit_others}
                              onChange={(e) => updateManagerPerm(up.user_id, 'can_edit_others', e.target.value)}
                              className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="REQUIRE_APPROVAL">최고관리자 승인 필요</option>
                              <option value="ALLOW">상시 허용 (협업)</option>
                              <option value="DENY">완전 차단</option>
                            </select>
                          )}
                        </td>
                        {/* 단가 수기 수정 권한 */}
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            disabled={isAdmin}
                            checked={Boolean(up.can_edit_price)}
                            onChange={(e) => updateManagerPerm(up.user_id, 'can_edit_price', e.target.checked ? 1 : 0)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        {/* 견적서 최종 승인권 */}
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            disabled={isAdmin}
                            checked={Boolean(up.can_approve_quote)}
                            onChange={(e) => updateManagerPerm(up.user_id, 'can_approve_quote', e.target.checked ? 1 : 0)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Decision Confirmation Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-4 text-white flex items-center justify-between ${
              decisionType === 'APPROVED' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              <div className="font-bold flex items-center gap-2">
                {decisionType === 'APPROVED' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                <span>타 담당자 견적건 수정 권한 {decisionType === 'APPROVED' ? '승인' : '반려'} 결재</span>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">요청자:</span>
                  <strong className="text-slate-800">{selectedReq.requester_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">원 담당자:</span>
                  <strong className="text-slate-800">{selectedReq.owner_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">대상 견적건:</span>
                  <strong className="text-blue-600">{selectedReq.case_no}</strong>
                </div>
                <div className="pt-1 border-t border-slate-200">
                  <span className="text-slate-500 block mb-1">신청 사유:</span>
                  <p className="text-slate-800 font-medium whitespace-pre-wrap">{selectedReq.reason}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  최고관리자 결재 의견 (선택 사항)
                </label>
                <textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="승인 또는 반려 사유를 입력하세요."
                  rows={3}
                  className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setSelectedReq(null)}
                  disabled={decisionLoading}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleExecuteDecision}
                  disabled={decisionLoading}
                  className={`px-4 py-2 text-xs font-bold text-white rounded-lg transition-colors flex items-center gap-1.5 ${
                    decisionType === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {decisionLoading ? (
                    <span>처리 중...</span>
                  ) : (
                    <>
                      {decisionType === 'APPROVED' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      <span>{decisionType === 'APPROVED' ? '최종 승인 확정' : '반려 처리'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
