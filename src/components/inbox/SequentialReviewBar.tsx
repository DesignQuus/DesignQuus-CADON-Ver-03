'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  ArrowRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface SequentialReviewBarProps {
  currentCaseId: string;
  onSaveAndNext?: () => Promise<void>;
}

export default function SequentialReviewBar({ currentCaseId, onSaveAndNext }: SequentialReviewBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFromInbox = searchParams?.get('from') === 'inbox';

  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);

  useEffect(() => {
    // inbox에서 진입했거나 대기열 모드일 때 큐 목록 가져오기
    apiFetch('/api/inbox?status=READY')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.items) {
          // 중복 quotation_case_id 제거
          const distinctCases: any[] = [];
          const seen = new Set<string>();
          for (const it of data.items) {
            if (it.quotation_case_id && !seen.has(it.quotation_case_id)) {
              seen.add(it.quotation_case_id);
              distinctCases.push(it);
            }
          }
          setQueueItems(distinctCases);
          const idx = distinctCases.findIndex(it => it.quotation_case_id === currentCaseId);
          setCurrentIndex(idx);
        }
      })
      .catch(() => {});
  }, [currentCaseId]);

  if (!isFromInbox && queueItems.length <= 1) {
    return null;
  }

  const prevItem = currentIndex > 0 ? queueItems[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < queueItems.length - 1 ? queueItems[currentIndex + 1] : null;

  const handleNextClick = async () => {
    if (!nextItem) return;
    setIsNavigating(true);
    try {
      if (onSaveAndNext) {
        await onSaveAndNext();
      }
      router.push(`/cases/${nextItem.quotation_case_id}?from=inbox`);
    } finally {
      setIsNavigating(false);
    }
  };

  return (
    <div className="bg-slate-900 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs border-b border-slate-800">
      <div className="flex items-center gap-3">
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-medium"
        >
          <Inbox className="w-3.5 h-3.5 text-indigo-400" />
          <span>일괄 접수함으로</span>
        </Link>
        <div className="h-3.5 w-px bg-slate-700" />
        <div className="flex items-center gap-1.5 text-slate-300 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>대기열 순차 검토 진행 중</span>
          {currentIndex >= 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-600/60 text-indigo-200 font-bold font-mono text-[11px]">
              {currentIndex + 1} / {queueItems.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {prevItem ? (
          <Link
            href={`/cases/${prevItem.quotation_case_id}?from=inbox`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>이전 건</span>
          </Link>
        ) : (
          <span className="px-2.5 py-1 text-slate-600 cursor-not-allowed inline-flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>이전 건</span>
          </span>
        )}

        {nextItem ? (
          <button
            onClick={handleNextClick}
            disabled={isNavigating}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors shadow-2xs disabled:opacity-50"
          >
            <span>저장 후 다음 건</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>대기열 완료 (접수함으로)</span>
          </Link>
        )}
      </div>
    </div>
  );
}
