'use client';

import React from 'react';
import { ArrowRight, Check, AlertTriangle, Trash2, PlusCircle } from 'lucide-react';

export type DiffChangeType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'IDENTICAL';

export interface DiffRowItem {
  id: string;
  changeType: DiffChangeType;
  partNo: string;
  changeField?: string;
  oldValue?: string;
  newValue?: string;
  oldPrice?: number;
  suggestedPrice?: number;
  priceNote?: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXCLUDED';
}

interface RevisionDiffTableProps {
  items: DiffRowItem[];
  onAcceptRow: (id: string) => void;
}

export default function RevisionDiffTable({ items, onAcceptRow }: RevisionDiffTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3 w-16 text-center">구분</th>
              <th className="p-3 w-28">도번</th>
              <th className="p-3 w-28">변경 항목</th>
              <th className="p-3">이전값 (Rev.A)</th>
              <th className="p-3">현재값 (Rev.B)</th>
              <th className="p-3 w-24 text-right">이전 단가</th>
              <th className="p-3 w-28 text-right">제안 단가</th>
              <th className="p-3 w-20 text-center">조치</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
            {items.map((row) => {
              const isAdded = row.changeType === 'ADDED';
              const isMod = row.changeType === 'MODIFIED';
              const isDel = row.changeType === 'DELETED';
              const isIdent = row.changeType === 'IDENTICAL';

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    isAdded ? 'bg-emerald-50/50' :
                    isMod ? 'bg-amber-50/50' :
                    isDel ? 'bg-rose-50/40 text-slate-400' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <td className="p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                      isAdded ? 'bg-emerald-100 text-emerald-800' :
                      isMod ? 'bg-amber-100 text-amber-800' :
                      isDel ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isAdded ? '추가' : isMod ? '변경' : isDel ? '삭제' : '동일'}
                    </span>
                  </td>

                  <td className="p-3 font-mono font-bold text-slate-900">{row.partNo}</td>
                  <td className="p-3 text-slate-600 font-medium">{row.changeField || '-'}</td>

                  <td className="p-3 font-mono text-slate-500">
                    {row.oldValue || '-'}
                  </td>

                  <td className="p-3 font-mono font-semibold text-slate-900">
                    {row.newValue || '-'}
                  </td>

                  <td className="p-3 text-right font-mono text-slate-400">
                    {row.oldPrice ? `₩${row.oldPrice.toLocaleString()}` : '-'}
                  </td>

                  <td className="p-3 text-right font-mono font-bold text-blue-700">
                    {row.suggestedPrice ? `₩${row.suggestedPrice.toLocaleString()}` : '-'}
                    {row.priceNote && (
                      <span className="block text-[10px] text-slate-400 font-normal">{row.priceNote}</span>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    {isDel ? (
                      <span className="text-[11px] text-slate-400">제외됨</span>
                    ) : row.status === 'ACCEPTED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                        <Check className="w-3.5 h-3.5" /> 반영완료
                      </span>
                    ) : (
                      <button
                        onClick={() => onAcceptRow(row.id)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-[11px] transition-colors"
                      >
                        검토/반영
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
