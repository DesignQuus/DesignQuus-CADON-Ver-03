'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Layers, FileText, CheckCircle2, ShieldAlert, ShieldCheck, LogOut, UserCheck, Sliders, ArrowLeft, Home, Users, Building2, LayoutDashboard, FileSpreadsheet, Database } from 'lucide-react';
import { prefetchPageData, warmupRoute } from '@/lib/cacheStore';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const router = useRouter();
  const pathname = usePathname();

  // 페이지 이동 완료 시 낙관적 경로 리셋
  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  const activeRoute = pendingPath || pathname;

  // ⚡ 0ms 즉각 반응 라우팅 가속기 (마우스 버튼을 누르는 순간 즉시 활성화 및 라우팅 시작)
  const handleNavigate = (route: string) => {
    if (pathname === route) return;
    setPendingPath(route);
    try {
      router.prefetch(route);
      warmupRoute(route);
    } catch {}
    router.push(route);
  };

  // 라우트 프리웜 헬퍼 (Next.js 번들 컴파일 선행 + 데이터 캐싱)
  const handleLinkWarmup = (route: string) => {
    try {
      router.prefetch(route);
      warmupRoute(route);
    } catch {}
  };

  // 마운트 후 유휴 시간(Idle)에 GNB 주요 라우트 백그라운드 선행 컴파일 & 프리웜
  useEffect(() => {
    const warmTimer = setTimeout(() => {
      const priorityRoutes = [
        '/cases',
        '/quotes',
        '/admin/companies',
        '/admin/masters',
        '/admin/members',
        '/admin/audit',
      ];

      priorityRoutes.forEach((route, idx) => {
        setTimeout(() => {
          handleLinkWarmup(route);
        }, idx * 120);
      });
    }, 600);

    return () => clearTimeout(warmTimer);
  }, []);

  const fetchSession = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        if (data.user) {
          try {
            localStorage.setItem('cadon_user', JSON.stringify(data.user));
          } catch {}
          if (['SUPER_ADMIN', 'TENANT_ADMIN'].includes(data.user.role)) {
            apiFetch('/api/admin/permissions')
              .then((r) => (r.ok ? r.json() : null))
              .then((pData) => {
                if (pData?.pendingCount !== undefined) {
                  setPendingCount(pData.pendingCount);
                }
              })
              .catch(() => {});
          }
        } else {
          try {
            localStorage.removeItem('cadon_user');
          } catch {}
        }
      } else {
        setUser(null);
        try {
          localStorage.removeItem('cadon_user');
        } catch {}
      }
    } catch {
      // keep current state on transient network error
    }
  };

  useEffect(() => {
    // 1. 빠른 캐시 복원 (화면 깜빡임 방지)
    try {
      const cached = localStorage.getItem('cadon_user');
      if (cached) {
        setUser(JSON.parse(cached));
      }
    } catch {}

    // 2. 세션 즉시 재검증 (1.5초 이내 반복 호출만 방지)
    const now = Date.now();
    if (now - lastFetchRef.current > 1500) {
      lastFetchRef.current = now;
      fetchSession();
    }

    // 3. 외부 세션 변경 이벤트(로그인, 로그아웃, 계정 전환) 동기화
    const handleAuthEvent = () => {
      fetchSession();
    };
    window.addEventListener('cadon_auth_change', handleAuthEvent);
    window.addEventListener('storage', handleAuthEvent);

    return () => {
      window.removeEventListener('cadon_auth_change', handleAuthEvent);
      window.removeEventListener('storage', handleAuthEvent);
    };
  }, [pathname]);

  const handleLogout = async () => {
    try { localStorage.removeItem('cadon_user'); } catch {}
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.dispatchEvent(new Event('cadon_auth_change'));
    router.push('/login');
  };

  // 로그인 전용 화면에서는 상단 GNB 숨김
  if (pathname === '/login') return null;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isTenantAdmin = user?.role === 'TENANT_ADMIN';
  const isAnyAdmin = isSuperAdmin || isTenantAdmin;

  return (
    <header className="no-print print:hidden bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs relative">
      {/* ⚡ 0ms 즉각 반응 상단 프로그레스 인디케이터 (버튼 클릭 즉시 활성화) */}
      {pendingPath && (
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 animate-pulse z-[60]" />
      )}
      <div className="w-full px-2.5 sm:px-3 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <Link
            href="/"
            prefetch={true}
            onMouseEnter={() => handleLinkWarmup('/')}
            onTouchStart={() => handleLinkWarmup('/')}
            onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/'); }}
            onClick={(e) => { e.preventDefault(); handleNavigate('/'); }}
            className="flex items-center space-x-2"
            title="CADON 홈으로 이동"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm font-bold ${
              isSuperAdmin ? 'bg-indigo-600' : 'bg-blue-600'
            }`}>
              {isSuperAdmin ? <Building2 className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg leading-tight tracking-tight block">
                CADON-BOM <span className={isSuperAdmin ? 'text-indigo-600 font-extrabold' : 'text-blue-600 font-extrabold'}>AI</span>
              </span>
              <span className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase block">
                {isSuperAdmin ? '👑 시스템 총괄 관제' : 'BOM 견적 시스템'}
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-0.5 lg:space-x-1 pl-3 lg:pl-4 border-l border-slate-200 overflow-x-auto no-scrollbar">
            {/* 1. 홈 */}
            <Link
              href="/"
              prefetch={true}
              onMouseEnter={() => handleLinkWarmup('/')}
              onTouchStart={() => handleLinkWarmup('/')}
              onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/'); }}
              onClick={(e) => { e.preventDefault(); handleNavigate('/'); }}
              className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                activeRoute === '/'
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Home className="w-4 h-4 text-blue-600" />
              <span suppressHydrationWarning={true}>홈</span>
            </Link>

            {/* 2. 견적의뢰 */}
            <Link
              href="/cases"
              prefetch={true}
              onMouseEnter={() => handleLinkWarmup('/cases')}
              onTouchStart={() => handleLinkWarmup('/cases')}
              onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/cases'); }}
              onClick={(e) => { e.preventDefault(); handleNavigate('/cases'); }}
              className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                (activeRoute === '/cases' || activeRoute.startsWith('/cases/'))
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title={user?.name ? `${user.name} 님의 담당 견적의뢰` : '견적의뢰'}
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>견적의뢰</span>
              {user?.name && !isSuperAdmin && (user.myActiveCasesCount ?? 0) > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-black inline-flex items-center gap-0.5 tracking-tight transition-all ${
                    (activeRoute === '/cases' || activeRoute.startsWith('/cases/'))
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                  title={`${user.name} 담당 진행 견적: ${user.myActiveCasesCount}건`}
                >
                  <span className="text-[10px] opacity-85 font-medium">내</span>
                  <span>{user.myActiveCasesCount}</span>
                </span>
              )}
            </Link>

            {/* 3. 견적서 관리 */}
            <Link
              href="/quotes"
              prefetch={true}
              onMouseEnter={() => handleLinkWarmup('/quotes')}
              onTouchStart={() => handleLinkWarmup('/quotes')}
              onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/quotes'); }}
              onClick={(e) => { e.preventDefault(); handleNavigate('/quotes'); }}
              className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                activeRoute.startsWith('/quotes')
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>견적서 관리</span>
            </Link>

            {/* 기준정보 및 관리자 전용 메뉴 구분선 */}
            {isAnyAdmin && (
              <div className="h-4 w-px bg-slate-200 mx-1 lg:mx-1.5 self-center shrink-0" />
            )}

            {/* 4. 고객사(발주처) 관리 (관리자 권한) */}
            {isAnyAdmin && (
              <Link
                href="/admin/companies"
                prefetch={true}
                onMouseEnter={() => handleLinkWarmup('/admin/companies')}
                onTouchStart={() => handleLinkWarmup('/admin/companies')}
                onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/admin/companies'); }}
                onClick={(e) => { e.preventDefault(); handleNavigate('/admin/companies'); }}
                className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                  activeRoute.startsWith('/admin/companies')
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>고객사(발주처) 관리</span>
              </Link>
            )}

            {/* 5. 표준 단가·임률 */}
            <Link
              href="/admin/masters"
              prefetch={true}
              onMouseEnter={() => handleLinkWarmup('/admin/masters')}
              onTouchStart={() => handleLinkWarmup('/admin/masters')}
              onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/admin/masters'); }}
              onClick={(e) => { e.preventDefault(); handleNavigate('/admin/masters'); }}
              className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                activeRoute.startsWith('/admin/masters')
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="자재·가공비·외주비 표준 단가 및 가공 임률 관리"
            >
              <Database className="w-4 h-4 text-amber-600" />
              <span>표준 단가·임률</span>
            </Link>

            {/* 6. 사원·권한 관리 (사원 관리 + 권한 설정 통합) */}
            {isAnyAdmin && (
              <Link
                href="/admin/members"
                prefetch={true}
                onMouseEnter={() => handleLinkWarmup('/admin/members')}
                onTouchStart={() => handleLinkWarmup('/admin/members')}
                onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/admin/members'); }}
                onClick={(e) => { e.preventDefault(); handleNavigate('/admin/members'); }}
                className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                  activeRoute.startsWith('/admin/members') || activeRoute.startsWith('/admin/permissions')
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>사원·권한 관리</span>
                {pendingCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}

            {/* 7. 시스템 감사 로그 (최고관리자) */}
            {isSuperAdmin && (
              <Link
                href="/admin/audit"
                prefetch={true}
                onMouseEnter={() => handleLinkWarmup('/admin/audit')}
                onTouchStart={() => handleLinkWarmup('/admin/audit')}
                onMouseDown={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) handleNavigate('/admin/audit'); }}
                onClick={(e) => { e.preventDefault(); handleNavigate('/admin/audit'); }}
                className={`px-2.5 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                  activeRoute.startsWith('/admin/audit')
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>시스템 감사 로그</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-1.5 text-sm">
                <span className="font-bold text-slate-800">{user.name}</span>
                {user.loginId && (
                  <span className="text-xs font-semibold text-slate-400 font-mono tracking-tight">
                    ({user.loginId})
                  </span>
                )}
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
                    가공·설계 검토
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    영업 실무
                  </span>
                )}
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
