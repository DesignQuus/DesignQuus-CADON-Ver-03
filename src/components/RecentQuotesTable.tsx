'use client';

import { apiFetch } from '@/lib/api';
import React, { useState } from 'react';
import Link from 'next/link';
import { Download, Clock, Plus, ChevronRight, FileSpreadsheet } from 'lucide-react';

interface QuoteItem {
  id: string;
  quotation_case_id: string;
  quote_no: string;
  quote_version: number;
  company_id: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  quote_date: string;
  is_locked: number;
  created_at: string;
  case_no: string;
  case_name: string;
  company_name: string;
  author_name: string;
  item_count: number;
}

interface RecentQuotesTableProps {
  quotes: QuoteItem[];
}

export default function RecentQuotesTable({ quotes }: RecentQuotesTableProps) {
  const [downloadingQuoteId, setDownloadingQuoteId] = useState<string | null>(null);

  const handleDownloadExcel = async (quoteId: string, quoteNo: string) => {
    setDownloadingQuoteId(quoteId);
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/export-excel`);
      if (!res.ok) {
        alert('엑셀 다운로드에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `견적서_${quoteNo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setDownloadingQuoteId(null);
    }
  };

  const recentQuotes = quotes.slice(0, 5); // Still show only 5 recent quotes

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 via-white to-white">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>최근 발행된 공식 견적서</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {quotes.length}건 보관
              </span>
            </h2>
            <p className="text-xs text-slate-500">정식 채번 및 원가 단가가 매칭되어 발행된 견적서 목록입니다.</p>
          </div>
        </div>
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
        >
          <span>견적서 대장 전체보기</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {recentQuotes.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold">발행된 공식 견적서가 아직 없습니다.</p>
          <p className="text-xs text-slate-400 mt-1">도면 의뢰건에서 [최종 견적서 즉시 산출]을 실행해보세요.</p>
          <Link
            href="/cases"
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>견적의뢰에서 견적서 생성하기</span>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 font-bold">견적번호 / 버전</th>
                <th className="py-3 px-4 font-bold">연동 케이스명</th>
                <th className="py-3 px-4 font-bold">고객사</th>
                <th className="py-3 px-4 font-bold text-center">품목 수</th>
                <th className="py-3 px-4 font-bold text-right">견적 총액 (VAT포함)</th>
                <th className="py-3 px-4 font-bold text-center">상태</th>
                <th className="py-3 px-4 font-bold text-center">원클릭 엑셀</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentQuotes.map((q) => {
                let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                let statusLabel = '임시저장 (DRAFT)';
                if (q.status === 'APPROVED') {
                  statusBadge = 'bg-blue-50 text-blue-700 border-blue-200';
                  statusLabel = '승인완료';
                } else if (q.status === 'ISSUED') {
                  statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  statusLabel = '공식발행';
                }

                return (
                  <tr
                    key={q.id}
                    className="hover:bg-emerald-50/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1.5">
                        <Link
                          href={`/cases/${q.quotation_case_id}`}
                          className="font-mono text-xs font-black text-blue-600 hover:text-blue-800 hover:underline"
                          title="해당 도면 견적 워크벤치로 이동"
                        >
                          {q.quote_no}
                        </Link>
                        <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
                          V{q.quote_version}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {q.quote_date || new Date(q.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 max-w-[200px] truncate">
                      {q.case_name || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {q.company_name || '미지정 고객사'}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700 font-mono">
                      {q.item_count || 0}개
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900 font-mono text-sm">
                      ₩{Number(q.total_amount || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-bold border ${statusBadge}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDownloadExcel(q.id, q.quote_no)}
                        disabled={downloadingQuoteId === q.id}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                        title="한국 표준 견적서 양식 Excel (.xlsx) 즉시 다운로드"
                      >
                        {downloadingQuoteId === q.id ? (
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>엑셀출력</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
