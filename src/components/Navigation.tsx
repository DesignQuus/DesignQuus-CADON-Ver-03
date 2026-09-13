'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Layers, FileText, CheckCircle2, ShieldAlert, ShieldCheck, LogOut, UserCheck, Sliders, ArrowLeft, Home, Users } from 'lucide-react';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const cached = localStorage.getItem('cadon_user');
      if (cached) setUser(JSON.parse(cached));
    } catch {}

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        setUser(data.user);
        if (data.user) {
          try { localStorage.setItem('cadon_user', JSON.stringify(data.user)); } catch {}
          fetch('/api/admin/permissions')
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
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  };

  if (pathname === '/login') return null;

  return (
    <header className="no-print print:hidden bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <Link href="/cases" className="flex items-center space-x-2" title="견적의뢰 관리 메인 대시보드로 이동">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg leading-tight tracking-tight block">
                CADON-BOM <span className="text-blue-600 font-extrabold">AI</span>
              </span>
              <span className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase block">
                Server POC Ver-02
              </span>
            </div>
          </Link>

          {pathname.startsWith('/cases/') && (
            <Link
              href="/cases"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all shadow-2xs cursor-pointer group"
              title="견적의뢰 관리 메인 목록(대시보드)으로 이동"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>견적 메인목록</span>
            </Link>
          )}

          <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-200">
            <Link
              href="/cases"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                pathname === '/cases'
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>견적의뢰 관리</span>
            </Link>
            <Link
              href="/admin/golden"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                pathname.startsWith('/admin/golden')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>골든 데이터셋 검증</span>
            </Link>
            <Link
              href="/admin/audit"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                pathname.startsWith('/admin/audit')
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>사용자 활동 로그</span>
            </Link>
            <Link
              href="/admin/permissions"
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
            <Link
              href="/admin/members"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                pathname.startsWith('/admin/members')
                  ? 'bg-indigo-50 text-indigo-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>임직원 및 회원사 관리</span>
            </Link>
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
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
