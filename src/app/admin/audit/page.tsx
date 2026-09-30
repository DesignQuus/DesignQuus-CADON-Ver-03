'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState } from 'react';
import SmartTruncateTooltip from '@/components/common/SmartTruncateTooltip';
import { getClientCache, setClientCache } from '@/lib/cacheStore';
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
  AlertCircle,
  ChevronLeft,
  ChevronRight
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
  const [loading, setLoading] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [period, setPeriod] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const fetchLogs = async (
    pageNum = page,
    currentSize = pageSize,
    isSilent = false,
    overridePeriod?: string,
    overrideStart?: string,
    overrideEnd?: string
  ) => {
    if (!isSilent && logs.length === 0) setLoading(true);
    try {
      const activePeriod = overridePeriod !== undefined ? overridePeriod : period;
      const activeStart = overrideStart !== undefined ? overrideStart : customStartDate;
      const activeEnd = overrideEnd !== undefined ? overrideEnd : customEndDate;

      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', String(currentSize));
      if (selectedUser) params.set('userId', selectedUser);
      if (selectedType) params.set('activityType', selectedType);
      if (searchQuery) params.set('search', searchQuery);
      if (activePeriod && activePeriod !== 'all') params.set('period', activePeriod);
      if (activePeriod === 'custom') {
        if (activeStart) params.set('startDate', activeStart);
        if (activeEnd) params.set('endDate', activeEnd);
      }

      const res = await apiFetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setStats(data.stats || {});
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
        setTotalCount(data.total || 0);
        if (data.users) {
          setUsers(data.users);
        }
        // Cache initial view
        if (pageNum === 1 && !selectedUser && !selectedType && !searchQuery && activePeriod === 'all') {
          setClientCache('audit_logs_p1', data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let hasCache = false;
    try {
      const cached = getClientCache('audit_logs_p1');
      if (cached && !selectedUser && !selectedType && !searchQuery && period === 'all') {
        if (cached.logs) setLogs(cached.logs);
        if (cached.stats) setStats(cached.stats);
        if (cached.total) setTotalCount(cached.total);
        if (cached.totalPages) setTotalPages(cached.totalPages);
        hasCache = true;
      }
    } catch {}
    fetchLogs(1, pageSize, hasCache);
  }, [selectedUser, selectedType]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      fetchLogs(1, pageSize, false, newPeriod);
    }
  };

  const handleCustomRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStartDate && !customEndDate) return;
    fetchLogs(1, pageSize, false, 'custom', customStartDate, customEndDate);
  };

  const formatDateGroupTitle = (dateStr: string) => {
    if (!dateStr) return { formatted: '', isToday: false };
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[dateObj.getDay()] || '';

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;

    return {
      formatted: `${y}년 ${m}월 ${d}일 (${dayName}요일)`,
      isToday,
    };
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    fetchLogs(1, newSize);
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = startPage + maxButtons - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }
    return pages;
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return '최고관리자';
      case 'TENANT_ADMIN':
        return '기업관리자';
      case 'SALES_USER':
        return '영업·견적 실무';
      case 'REVIEWER':
        return '가공·설계 검토';
      case 'GUEST':
        return '조회 전용';
      default:
        return role || '일반';
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

      {/* 1-클릭 퀵 기간 분류 세그먼트 바 (일별 / 주별 / 월별 / 년별 / 직접지정) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1.5 shrink-0">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>기간 분류:</span>
          </span>

          {[
            { key: 'all', label: '전체', count: stats.totalLogs },
            { key: 'today', label: '오늘 (일별)', count: stats.todayCount },
            { key: 'week', label: '최근 7일 (주별)', count: stats.weekCount },
            { key: 'month', label: '이번 달 (월별)', count: stats.monthCount },
            { key: 'year', label: '올해 (년별)', count: stats.yearCount },
            { key: 'custom', label: '📅 직접 기간 지정', count: null },
          ].map((item) => {
            const isActive = period === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handlePeriodChange(item.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                }`}
              >
                <span>{item.label}</span>
                {item.count !== null && item.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-mono font-bold ${
                      isActive ? 'bg-blue-700/60 text-white' : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {item.count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 직접 기간 지정 인라인 입력 폼 */}
        {period === 'custom' && (
          <form onSubmit={handleCustomRangeSubmit} className="flex flex-wrap items-center gap-2 bg-blue-50/60 p-2 rounded-lg border border-blue-200 self-start md:self-auto">
            <span className="text-[11px] font-bold text-blue-900 shrink-0">날짜 직접 선택:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono shadow-2xs"
            />
            <span className="text-slate-400 text-xs font-bold">~</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono shadow-2xs"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            >
              조회
            </button>
          </form>
        )}
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
                  {u.name} ({getRoleLabel(u.role)})
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
      {/* 4. Logs Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-16 text-center text-slate-500 font-medium">감사 로그 조회 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">조회된 활동 로그가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[520px] 2xl:max-h-[640px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-2xs">
                <tr className="text-slate-600 font-bold">
                  <th className="py-2.5 px-3 w-14 text-center bg-slate-50">No.</th>
                  <th className="py-2.5 px-3.5 w-44 bg-slate-50">일시 (Timestamp)</th>
                  <th className="py-2.5 px-3.5 w-36 bg-slate-50">담당자</th>
                  <th className="py-2.5 px-3 w-28 text-center bg-slate-50">작업 유형</th>
                  <th className="py-2.5 px-3.5 w-72 bg-slate-50">대상 프로젝트 / 케이스</th>
                  <th className="py-2.5 px-3.5 min-w-[340px] bg-slate-50">상세 작업 내역</th>
                  <th className="py-2.5 px-3.5 w-24 text-center bg-slate-50">접속 IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log, idx) => {
                  const globalIdx = (page - 1) * pageSize + idx + 1;
                  const dt = new Date(log.created_at);
                  const formattedDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
                  const isLatestRow = page === 1 && idx === 0;

                  const currentDateStr = (log.created_at || '').slice(0, 10);
                  const prevDateStr = idx > 0 ? (logs[idx - 1]?.created_at || '').slice(0, 10) : null;
                  const isNewDateGroup = currentDateStr && currentDateStr !== prevDateStr;
                  const dateInfo = isNewDateGroup ? formatDateGroupTitle(currentDateStr) : null;

                  return (
                    <React.Fragment key={log.id}>
                      {isNewDateGroup && dateInfo && (
                        <tr className="bg-slate-100/90 border-y border-slate-200 select-none">
                          <td colSpan={7} className="py-2 px-3.5 bg-slate-100/95">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="font-bold text-slate-800 text-xs tracking-tight">
                                {dateInfo.formatted}
                              </span>
                              {dateInfo.isToday && (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-2xs">
                                  오늘 (Today)
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr
                        className={`transition-colors hover:bg-blue-50/50 ${
                          isLatestRow ? 'bg-blue-50/30' : ''
                        }`}
                      >
                      {/* 0. 행번호 (No.) */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="font-mono text-slate-400 text-xs font-bold">
                          {String(globalIdx).padStart(2, '0')}
                        </span>
                      </td>

                      {/* 1. 일시 (Timestamp) */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          {isLatestRow && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-blue-600 text-white animate-pulse shrink-0">
                              최신
                            </span>
                          )}
                          <span className="font-mono text-slate-600 text-[11.5px] font-medium">
                            {formattedDate}
                          </span>
                        </div>
                      </td>

                      {/* 2. 담당자 */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900 flex items-center space-x-1 text-xs">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{log.user_name}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 pl-4.5">{log.user_login_id}</div>
                      </td>

                      {/* 3. 작업 유형 */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {getActionBadge(log.activity_type)}
                      </td>

                      {/* 4. 대상 프로젝트 / 케이스 (1행 말줄임 및 인라인 툴팁) */}
                      <td className="py-2.5 px-3.5 max-w-[288px]">
                        {log.case_name || log.quotation_case_id ? (
                          <SmartTruncateTooltip
                            text={log.case_name || `ID: ${log.quotation_case_id}`}
                            className="font-semibold text-slate-800 text-xs block"
                            maxWidthClass="max-w-[260px]"
                            showCopy={true}
                          />
                        ) : (
                          <span className="text-slate-300 font-mono text-xs pl-1">-</span>
                        )}
                      </td>

                      {/* 5. 상세 작업 내역 (1행 말줄임 및 고딕 폰트 적용) */}
                      <td className="py-2.5 px-3.5 min-w-[340px]">
                        {log.details ? (
                          <SmartTruncateTooltip
                            text={log.details}
                            className="text-slate-700 font-normal text-xs block font-sans"
                            maxWidthClass="max-w-[550px] 2xl:max-w-[800px]"
                            showCopy={true}
                          />
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>

                      {/* 6. 접속 IP */}
                      <td className="py-2.5 px-3.5 text-center font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200/80 rounded text-slate-600">
                          {log.ip_address || '127.0.0.1'}
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
              </tbody>
            </table>
          </div>
        )}

        {/* Standard Pagination Navigation Bar (중앙 정렬 배치) */}
        <div className="py-3.5 px-5 border-t border-slate-200/90 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-6 text-xs text-slate-500 shrink-0">
          {/* 중앙 번호 네비게이션 버튼 그룹 */}
          {totalPages > 1 && (
            <div className="flex items-center space-x-1">
              {/* 이전 버튼 */}
              <button
                type="button"
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                title="이전 페이지"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>이전</span>
              </button>

              {/* 페이지 번호 버튼 목록 */}
              {getPageNumbers().map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => fetchLogs(pageNum)}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    page === pageNum
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              {/* 다음 버튼 */}
              <button
                type="button"
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                title="다음 페이지"
              >
                <span>다음</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {totalPages > 1 && <span className="hidden sm:inline text-slate-300">|</span>}

          {/* 건수 정보 및 페이지당 표시 행수 선택기 */}
          <div className="flex items-center space-x-3 text-slate-600">
            <div>
              총 <strong className="text-slate-900 font-bold">{totalCount}</strong>건 중{' '}
              <span className="font-mono font-semibold text-slate-800">
                {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(totalCount, page * pageSize)}
              </span>
              건 표시
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 text-[11.5px]">페이지당 행 수:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs"
              >
                <option value={10}>10개씩 보기</option>
                <option value={20}>20개씩 보기</option>
                <option value={30}>30개씩 보기</option>
                <option value={50}>50개씩 보기</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
