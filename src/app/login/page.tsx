'use client';

import React, { useState } from 'react';
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
  Info
} from 'lucide-react';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('admin');
  const [password, setPassword] = useState('Cadon1234!@');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const executeLogin = async (idToLogin: string, passToLogin: string) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
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
        const redirectUrl = params.get('redirect') || '/cases';
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

  const handleFillAdmin = () => {
    setLoginId('admin');
    setPassword('Cadon1234!@');
    setError('');
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

        <form onSubmit={handleLogin} className="space-y-4">
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
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="아이디를 입력하세요 (예: admin)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Quick Admin Fill Helper */}
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between">
            <div className="text-[11px] text-blue-800 font-medium">
              최고관리자 기본 계정: <span className="font-mono font-bold">admin</span>
            </div>
            <button
              type="button"
              onClick={handleFillAdmin}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white px-2.5 py-1 rounded-lg border border-blue-200 hover:border-blue-300 shadow-2xs transition-colors cursor-pointer"
            >
              자동 채우기
            </button>
          </div>

          {/* Tenant / Member Company Login Note */}
          <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-2 text-[11px] text-slate-600">
            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>회원사 임직원/대표는 발급받은 본인 계정으로 동일하게 로그인하시면 해당 회원사 모드로 자동 접속됩니다.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? '로그인 중...' : '로그인'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
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
