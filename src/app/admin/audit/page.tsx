'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  DollarSign,
  FileSpreadsheet,
  Layers,
  ArrowUpDown,
  CheckCircle2,
  LogIn,
  LogOut,
  Sliders,
  Calendar,
  AlertCircle
} from 'lucide-react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalLogs: 0,
    todayLogins: 0,
    priceUpdates: 0,
    excelExports: 0,
    quoteToggles: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async (pageNum = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', '30');
      if (selectedUser) params.set('userId', selectedUser);
      if (selectedType) params.set('activityType', selectedType);
      if (searchQuery) params.set('search', searchQuery);

      const res = await apiFetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setStats(data.stats || {});
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
        if (data.users) {
          setUsers(data.users);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [selectedUser, selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const getActionBadge = (type: string) => {
    switch (type) {
      case 'LOGIN':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <LogIn className="w-3 h-3 text-emerald-600" />
            <span>로그인</span>
          </span>
        );
      case 'LOGOUT':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <LogOut className="w-3 h-3 text-slate-500" />
            <span>로그아웃</span>
          </span>
        );
      case 'PRICE_UPDATE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <DollarSign className="w-3 h-3 text-blue-600" />
            <span>단가 수정</span>
          </span>
        );
      case 'QUOTE_TOGGLE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Sliders className="w-3 h-3 text-purple-600" />
            <span>견적 토글</span>
          </span>
        );
      case 'EXCEL_EXPORT':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <FileSpreadsheet className="w-3 h-3 text-teal-600" />
            <span>엑셀 출력</span>
          </span>
        );
      case 'BOM_APPROVAL':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <CheckCircle2 className="w-3 h-3 text-amber-600" />
            <span>BOM 승인</span>
          </span>
        );
      case 'FILE_UPLOAD':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
            <Layers className="w-3 h-3 text-orange-600" />
            <span>도면 업로드</span>
          </span>
        );
      case 'ANALYSIS_START':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <RefreshCw className="w-3 h-3 text-indigo-600" />
            <span>도면 분석</span>
          </span>
        );
      case 'CASE_CREATE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
            <Calendar className="w-3 h-3 text-cyan-600" />
            <span>의뢰 등록</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            <span>{type}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                사용자 활동 감사 로그 <span className="text-blue-600 font-bold text-lg">(Audit Trail)</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                누가 로그인하여 어떤 작업(단가 수정, 견적 토글, 엑셀 다운로드 등)을 수행했는지 실시간으로 모니터링하는 거버넌스 센터
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchLogs(1)}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>전체 작업 기록</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-extrabold text-slate-900">
            {stats.totalLogs?.toLocaleString() || 0}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1">건</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>오늘 로그인</span>
            <LogIn className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-extrabold text-emerald-600">
            {stats.todayLogins?.toLocaleString() || 0}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1">회</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>단가 수정 이력</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-extrabold text-blue-600">
            {stats.priceUpdates?.toLocaleString() || 0}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1">건</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>엑셀 견적서 출력</span>
            <FileSpreadsheet className="w-4 h-4 text-teal-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-extrabold text-teal-600">
            {stats.excelExports?.toLocaleString() || 0}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1">건</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* User Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-slate-600 shrink-0">담당자:</span>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
            >
              <option value="">전체 담당자</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'SUPER_ADMIN' ? '최고관리자' : u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Activity Type Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-slate-600 shrink-0">작업유형:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
            >
              <option value="">전체 유형</option>
              <option value="LOGIN">로그인</option>
              <option value="LOGOUT">로그아웃</option>
              <option value="PRICE_UPDATE">단가 수정 (Manual Price)</option>
              <option value="QUOTE_TOGGLE">견적 포함/제외 토글</option>
              <option value="EXCEL_EXPORT">엑셀 견적서 다운로드</option>
              <option value="BOM_APPROVAL">BOM 부품 마스터 승인</option>
              <option value="FILE_UPLOAD">도면 파일 업로드</option>
              <option value="ANALYSIS_START">도면 자동 분석</option>
              <option value="CASE_CREATE">신규 견적의뢰 등록</option>
            </select>
          </div>
        </div>

        {/* Search Query Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="작업 내용, 케이스명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
            >
            </input>
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            검색
          </button>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 font-medium">감사 로그 조회 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">조회된 활동 로그가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4 w-36">일시 (Timestamp)</th>
                  <th className="py-3 px-4 w-32">담당자</th>
                  <th className="py-3 px-3 w-28 text-center">작업 유형</th>
                  <th className="py-3 px-4 w-52">대상 프로젝트 / 케이스</th>
                  <th className="py-3 px-4">상세 작업 내역</th>
                  <th className="py-3 px-3 w-28 text-center">접속 IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const dt = new Date(log.created_at);
                  const formattedDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center space-x-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{log.user_name}</span>
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-400">{log.user_login_id}</div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {getActionBadge(log.activity_type)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {log.case_name || (log.quotation_case_id ? `ID: ${log.quotation_case_id}` : '-')}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-900 break-all leading-relaxed">
                        {log.details}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-400 whitespace-nowrap">
                        {log.ip_address || '127.0.0.1'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="py-3 px-4 border-t border-slate-100 flex items-center justify-center space-x-4 text-xs text-slate-500">
            <button
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md disabled:opacity-40 cursor-pointer transition-colors"
            >
              이전
            </button>
            <div className="font-medium">
              페이지 <span className="font-bold text-slate-800">{page}</span> / {totalPages}
            </div>
            <button
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md disabled:opacity-40 cursor-pointer transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
