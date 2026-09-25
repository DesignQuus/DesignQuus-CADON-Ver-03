'use client';

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  User,
  ArrowRight,
  Lock,
  Building,
  Eye,
  EyeOff
} from 'lucide-react';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 브라우저 캐시 자동완성 강제 주입 차단
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoginId('');
      setPassword('');
      setIsReadOnly(false);
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  const executeLogin = async (idToLogin: string, passToLogin: string) => {
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: idToLogin, password: passToLogin })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.');
      }

      // Cache user and token in localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('cadon_user', JSON.stringify(data.user));
          if (data.token) {
            localStorage.setItem('cadon_token', data.token);
          }
        } catch {}

        const params = new URLSearchParams(window.location.search);
        const redirectUrl = params.get('redirect') || (data.user?.role === 'SUPER_ADMIN' ? '/admin/companies' : '/');
        window.location.replace(redirectUrl);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    executeLogin(loginId.trim(), password);
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="text-center max-w-xl mx-auto mb-8">
        <Link href="/cases" className="inline-block group" title="견적의뢰 관리 메인 대시보드로 이동">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-md mb-3 group-hover:scale-105 transition-transform">
            <Layers className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
            CADON-BOM <span className="text-blue-600">AI</span>
          </h1>
        </Link>
        <p className="mt-2 text-sm text-slate-600">
          CAD 도면 자동 분석 & BOM 견적 산출 엔터프라이즈 시스템
        </p>
      </div>

      {/* Main Login Card */}
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200/80 p-6 sm:p-8 max-w-md w-full">
        <div className="mb-6">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center space-x-2">
            <Lock className="w-5 h-5 text-blue-600" />
            <span>시스템 로그인</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            등록된 계정 아이디와 비밀번호를 입력하세요.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
          {/* Login ID Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              계정 아이디
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                autoComplete="off"
                readOnly={isReadOnly}
                onFocus={() => setIsReadOnly(false)}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="아이디를 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                비밀번호
              </label>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
                readOnly={isReadOnly}
                onFocus={() => setIsReadOnly(false)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 transition-colors select-none"
                title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tenant / Member Company Login Note */}
          <div className="px-3.5 py-2.5 bg-slate-50/90 rounded-xl border border-slate-200 flex items-center space-x-2.5 text-[11px] text-slate-600">
            <Building className="w-4 h-4 text-slate-400 shrink-0" />
            <span>회원사 및 본사 임직원은 발급받은 계정으로 로그인하시면 전용 모드로 접속됩니다.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? '로그인 중...' : '로그인'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* 김세창 견적담당자 퀵 원클릭 로그인 버튼 */}
          <div className="pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLoginId('001');
                setPassword('1234');
                executeLogin('001', '1234');
              }}
              className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300 rounded-xl font-semibold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <User className="w-4 h-4 text-blue-600 shrink-0" />
              <span>김세창 견적담당자 (001) 원클릭 로그인</span>
            </button>
          </div>
        </form>

        {/* Audit Log Guarantee Note */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-start space-x-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <span>단가수정, 견적 산출, 엑셀 출력 등 모든 업무 활동은 시스템 감사 로그에 안전하게 기록됩니다.</span>
        </div>

        {/* Bottom System Info */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">보안 엔터프라이즈 견적 시스템</span>
          <span className="text-[11px] text-slate-400 font-semibold">CADON-BOM AI</span>
        </div>
      </div>
    </div>
  );
}
