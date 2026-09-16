'use client';

import React from 'react';
import { AlertTriangle, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';

export interface BomRowItem {
  id: string;
  itemNo: string;
  partNo: string;
  partName: string;
  material: string;
  quantity: number;
  postProcess?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  actionNote?: string;
}

interface BomMappingTableProps {
  items: BomRowItem[];
  onChangeItem: (id: string, updated: Partial<BomRowItem>) => void;
  onDeleteItem: (id: string) => void;
}

export default function BomMappingTable({ items, onChangeItem, onDeleteItem }: BomMappingTableProps) {
  const lowConfidenceCount = items.filter((it) => it.confidence === 'LOW').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-slate-800 text-sm">BOM 추출 행 목록 ({items.length}행)</h4>
          {lowConfidenceCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5" />
              미해결 {lowConfidenceCount}건 (승인 차단)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              전체 검증 완료
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          신뢰도 낮음(풍선 중복, 수량 누락, 주기 텍스트)은 수정 또는 삭제 후 승인 가능합니다.
        </p>
      </div>

      <div className="overflow-x-auto max-h-[360px]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200 z-10">
            <tr>
              <th className="p-2.5 w-12 text-center">No</th>
              <th className="p-2.5 w-28">도번</th>
              <th className="p-2.5">품명</th>
              <th className="p-2.5 w-28">재질</th>
              <th className="p-2.5 w-20 text-center">수량</th>
              <th className="p-2.5 w-28">후처리</th>
              <th className="p-2.5 w-20 text-center">신뢰도</th>
              <th className="p-2.5">조치 및 주의사항</th>
              <th className="p-2.5 w-12 text-center">삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
            {items.map((row, idx) => {
              const isLow = row.confidence === 'LOW';
              const isMed = row.confidence === 'MEDIUM';

              return (
                <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${isLow ? 'bg-rose-50/40' : ''}`}>
                  <td className="p-2.5 text-center text-slate-400 font-mono">{row.itemNo || idx + 1}</td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.partNo}
                      onChange={(e) => onChangeItem(row.id, { partNo: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.partName}
                      onChange={(e) => onChangeItem(row.id, { partName: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-semibold"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.material}
                      onChange={(e) => onChangeItem(row.id, { material: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.quantity}
                      onChange={(e) => onChangeItem(row.id, { quantity: Number(e.target.value) || 1 })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.postProcess || ''}
                      onChange={(e) => onChangeItem(row.id, { postProcess: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      isLow ? 'bg-rose-100 text-rose-700' :
                      isMed ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {row.confidence}
                    </span>
                  </td>
                  <td className="p-2">
                    {isLow ? (
                      <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{row.actionNote || '풍선 중복 또는 형식 이상 — 확인 필요'}</span>
                        <button
                          onClick={() => onChangeItem(row.id, { confidence: 'MEDIUM', actionNote: '수동 확인 완료' })}
                          className="ml-auto text-[11px] px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded font-semibold transition-colors"
                        >
                          해결
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">{row.actionNote || '-'}</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => onDeleteItem(row.id)}
                      title="주기/오인식 행 삭제"
                      className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
