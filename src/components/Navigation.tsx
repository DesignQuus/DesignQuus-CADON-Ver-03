'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Layers, FileText, CheckCircle2, ShieldAlert, ShieldCheck, LogOut, UserCheck, Sliders, ArrowLeft, Home, Users, Building2, LayoutDashboard, FileSpreadsheet, Database } from 'lucide-react';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const lastFetchRef = useRef<number>(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 1. 빠른 캐시 우선 복원 (화면 깜빡임 방지)
    try {
      const cached = localStorage.getItem('cadon_user');
      if (cached) setUser(JSON.parse(cached));
    } catch {}

    const now = Date.now();
    // 30초 내 동일 세션 재요청 차단 (중복 네트워크 방지)
    if (now - lastFetchRef.current < 30000 && user) {
      return;
    }
    lastFetchRef.current = now;

    apiFetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        setUser(data.user);
        if (data.user) {
          try { localStorage.setItem('cadon_user', JSON.stringify(data.user)); } catch {}
          apiFetch('/api/admin/permissions')
            .then((r) => (r.ok ? r.json() : null))
            .then((pData) => {
              if (pData?.pendingCount !== undefined) {
                setPendingCount(pData.pendingCount);
              }
            })
            .catch(() => {});
        } else {
          try { localStorage.removeItem('cadon_user'); } catch {}
        }
      })
      .catch(() => setUser(null));
  }, [pathname]);

  const handleLogout = async () => {
    try { localStorage.removeItem('cadon_user'); } catch {}
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  };

  // 로그인 전용 화면에서는 상단 GNB 숨김
  if (pathname === '/login') return null;

  return (
    <header className="no-print print:hidden bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="w-full px-2.5 sm:px-3 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <Link
            href={user?.role === 'SUPER_ADMIN' ? '/admin/companies' : '/'}
            prefetch={true}
            className="flex items-center space-x-2"
            title={user?.role === 'SUPER_ADMIN' ? '최고관리자 회원사 관리 센터로 이동' : 'CADON 홈 대시보드로 이동'}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm font-bold ${
              user?.role === 'SUPER_ADMIN' ? 'bg-indigo-600' : 'bg-blue-600'
            }`}>
              {user?.role === 'SUPER_ADMIN' ? <Building2 className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg leading-tight tracking-tight block">
                CADON-BOM <span className={user?.role === 'SUPER_ADMIN' ? 'text-indigo-600 font-extrabold' : 'text-blue-600 font-extrabold'}>AI</span>
              </span>
              <span className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase block">
                {user?.role === 'SUPER_ADMIN' ? '👑 SaaS 운영자 센터' : 'BOM 견적 시스템'}
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-200">
            {user?.role === 'SUPER_ADMIN' ? (
              /* 최고관리자(SaaS 운영자) 전용 메뉴 */
              <>
                <Link
                  href="/admin/companies"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    pathname.startsWith('/admin/companies')
                      ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>회원사 관리 센터</span>
                </Link>
                <Link
                  href="/admin/audit"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    pathname.startsWith('/admin/audit')
                      ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>플랫폼 보안/감사 로그</span>
                </Link>
              </>
            ) : (
              /* 일반 회원사 실무자 메뉴: 대시보드, 견적의뢰 관리, 공식 견적서 관리, 마스터 기준정보 */
              <>
                <Link
                  href="/"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    pathname === '/'
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-blue-600" />
                  <span>대시보드</span>
                </Link>
                <Link
                  href="/cases"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    (pathname === '/cases' || pathname.startsWith('/cases/'))
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                  title={user?.name ? `${user.name} 님의 담당 견적의뢰 관리` : '견적의뢰 관리'}
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>견적의뢰 관리</span>
                  {user?.name && user.role !== 'SUPER_ADMIN' && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-black inline-flex items-center gap-0.5 tracking-tight transition-all ${
                        (pathname === '/cases' || pathname.startsWith('/cases/'))
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                      title={`${user.name} 담당 진행 견적: ${user.myActiveCasesCount ?? 0}건`}
                    >
                      <span className="text-[10px] opacity-85 font-medium">내</span>
                      <span>{user.myActiveCasesCount ?? 0}</span>
                    </span>
                  )}
                </Link>
                <Link
                  href="/quotes"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    pathname.startsWith('/quotes')
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>공식 견적서 관리</span>
                </Link>
                <Link
                  href="/admin/masters"
                  prefetch={true}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                    pathname.startsWith('/admin/masters')
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                  title="자재·가공비·외주비 마스터 단가표 관리"
                >
                  <Database className="w-4 h-4 text-amber-600" />
                  <span>마스터 기준정보</span>
                </Link>
                {user?.role === 'TENANT_ADMIN' && (
                  <Link
                    href="/admin/members"
                    prefetch={true}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                      pathname.startsWith('/admin/members')
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>사원 관리</span>
                  </Link>
                )}
                {['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user?.role) && (
                  <Link
                    href="/admin/permissions"
                    prefetch={true}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                      pathname.startsWith('/admin/permissions')
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Sliders className="w-4 h-4 text-purple-600" />
                    <span>승인권한 설정</span>
                    {pendingCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white animate-pulse">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-800 flex items-center justify-end space-x-1">
                  <span>{user.name}</span>
                  {user.role === 'SUPER_ADMIN' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                      최고관리자
                    </span>
                  ) : user.role === 'TENANT_ADMIN' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                      대표관리자
                    </span>
                  ) : user.role === 'REVIEWER' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      검토자
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                      영업담당
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{user.loginId}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="로그아웃"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-xs"
            >
              <UserCheck className="w-4 h-4" />
              <span>로그인</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
