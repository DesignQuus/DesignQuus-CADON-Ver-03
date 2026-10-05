'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export default function QuoteLoading() {
  return (
    <div className="w-full min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-bold text-slate-800">견적 검토 및 단가 매칭 화면 준비 중</h3>
          <p className="text-xs text-slate-500 mt-1">도면 CAD 벡터 데이터 및 마스터 단가 지식풀을 연결하고 있습니다...</p>
        </div>
        <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full animate-pulse w-2/3" />
        </div>
      </div>
    </div>
  );
}
