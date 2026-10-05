'use client';

import React, { useState } from 'react';
import { 
  Layers, 
  X, 
  Eye, 
  EyeOff, 
  FolderPlus, 
  Folder, 
  Trash2, 
  Edit2, 
  Check, 
  RotateCcw, 
  Sparkles,
  Info,
  ChevronRight,
  Sliders,
  Maximize2
} from 'lucide-react';

export interface UserEstimateGroup {
  id: string;
  name: string;
  itemIds: string[];
  color: string;
  isVisible: boolean;
}

export interface EstimateLayerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Traffic Light Layer Counts & Visibilities
  layerVisibility: {
    unreviewed: boolean;
    reviewed: boolean;
    inProgress: boolean;
    excluded: boolean;
  };
  onToggleLayerVisibility: (layer: 'unreviewed' | 'reviewed' | 'inProgress' | 'excluded') => void;
  counts: {
    unreviewed: number;
    reviewed: number;
    inProgress: number;
    excluded: number;
  };
  // Groups
  userGroups: UserEstimateGroup[];
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupVisibility: (groupId: string) => void;
  onResetAllReviews: () => void;
  selectedCount: number;
  onGroupSelectedItems: () => void;
}

export default function EstimateLayerPanel({
  isOpen,
  onClose,
  layerVisibility,
  onToggleLayerVisibility,
  counts,
  userGroups = [],
  onCreateGroup,
  onDeleteGroup,
  onToggleGroupVisibility,
  onResetAllReviews,
  selectedCount,
  onGroupSelectedItems
}: EstimateLayerPanelProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  if (!isOpen) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setIsCreatingGroup(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none">
      {/* 1. Header */}
      <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">캐드온 스마트 견적 레이어</h3>
            <p className="text-[10.5px] text-slate-400">설계 레이어와 분리된 견적자 전용 검토 대장</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Traffic Light Estimate Layers */}
      <div className="p-4 border-b border-slate-800 space-y-2.5 bg-slate-900/40 shrink-0">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>4색 신호등 견적 레이어</span>
          <span className="text-[10px] text-teal-400 font-mono">실시간 동기화</span>
        </div>

        {/* 🔴 Unreviewed Layer */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onToggleLayerVisibility('unreviewed')}
              className={`p-1.5 rounded-lg transition-colors ${
                layerVisibility.unreviewed 
                  ? 'text-rose-400 hover:bg-rose-950/50' 
                  : 'text-slate-600 hover:bg-slate-800'
              }`}
              title="미검토 부품 가시성 토글"
            >
              {layerVisibility.unreviewed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-bold text-xs text-white">미검토 부품 (To-Do)</span>
              </div>
              <span className="text-[10.5px] text-slate-400">아직 단가/수량 미확인</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800/80">
            {counts.unreviewed}개
          </span>
        </div>

        {/* 🟢 Reviewed Layer */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onToggleLayerVisibility('reviewed')}
              className={`p-1.5 rounded-lg transition-colors ${
                layerVisibility.reviewed 
                  ? 'text-emerald-400 hover:bg-emerald-950/50' 
                  : 'text-slate-600 hover:bg-slate-800'
              }`}
              title="검토 완료 부품 가시성 토글"
            >
              {layerVisibility.reviewed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-bold text-xs text-white">검토 완료 (Done)</span>
              </div>
              <span className="text-[10.5px] text-slate-400">15% 고스트 또는 숨김</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/80">
            {counts.reviewed}개
          </span>
        </div>

        {/* 🟡 In-Progress Layer */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onToggleLayerVisibility('inProgress')}
              className={`p-1.5 rounded-lg transition-colors ${
                layerVisibility.inProgress 
                  ? 'text-amber-400 hover:bg-amber-950/50' 
                  : 'text-slate-600 hover:bg-slate-800'
              }`}
              title="견적 진행중 부품 가시성 토글"
            >
              {layerVisibility.inProgress ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-bold text-xs text-white">견적 진행중 (In-Progress)</span>
              </div>
              <span className="text-[10.5px] text-slate-400">외주/협력사 단가 문의중</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800/80">
            {counts.inProgress}개
          </span>
        </div>

        {/* 🟣 Excluded Layer */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onToggleLayerVisibility('excluded')}
              className={`p-1.5 rounded-lg transition-colors ${
                layerVisibility.excluded 
                  ? 'text-purple-400 hover:bg-purple-950/50' 
                  : 'text-slate-600 hover:bg-slate-800'
              }`}
              title="사급/가공제외 부품 가시성 토글"
            >
              {layerVisibility.excluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="font-bold text-xs text-white">가공 제외 / 사급 (Skip)</span>
              </div>
              <span className="text-[10.5px] text-slate-400">BOM 기재용, 가공비 산출 제외</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800/80">
            {counts.excluded}개
          </span>
        </div>
      </div>

      {/* 3. User Defined Assembly Groups (Group / Ungroup) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            조립체 그룹 대장 ({userGroups.length}개)
          </span>

          {selectedCount > 0 && (
            <button
              onClick={onGroupSelectedItems}
              className="px-2 py-1 bg-teal-950 hover:bg-teal-900 border border-teal-500/60 text-teal-200 text-xs font-bold rounded-lg flex items-center space-x-1 cursor-pointer"
              title="선택된 부품들을 1개 그룹으로 묶기 (Ctrl+G)"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>선택 {selectedCount}개 그룹핑</span>
            </button>
          )}
        </div>

        {/* Create Group Input */}
        {isCreatingGroup ? (
          <form onSubmit={handleCreateSubmit} className="p-2.5 bg-slate-950 rounded-xl border border-teal-500/50 space-y-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="예: 모터 구동부 세트, 베이스 프레임"
              autoFocus
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-hidden focus:border-teal-400"
            />
            <div className="flex justify-end space-x-1.5">
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="px-2.5 py-1 text-slate-400 hover:text-white text-xs rounded"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-lg"
              >
                생성
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsCreatingGroup(true)}
            className="w-full py-2 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl text-slate-400 hover:text-slate-200 text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-teal-400" />
            <span>+ 새 조립체 그룹 만들기</span>
          </button>
        )}

        {/* Group Items List */}
        {userGroups.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs space-y-1">
            <Folder className="w-8 h-8 mx-auto stroke-1" />
            <p>생성된 어셈블리 그룹이 없습니다.</p>
            <p className="text-[10px]">도면에서 마우스 드래그로 영역을 묶어 그룹핑할 수 있습니다.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {userGroups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 group transition-all"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <button
                    onClick={() => onToggleGroupVisibility(group.id)}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    {group.isVisible ? <Eye className="w-3.5 h-3.5 text-teal-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                  </button>

                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color || '#2dd4bf' }} />

                  <span className="font-bold text-xs text-white truncate max-w-[140px]" title={group.name}>
                    {group.name}
                  </span>

                  <span className="text-[10px] text-slate-400 font-mono">
                    ({group.itemIds.length}개)
                  </span>
                </div>

                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="그룹 해제 (언그룹)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Keyboard Shortcuts Quick Reference Banner */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 shrink-0 space-y-1">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>⚡ 초고속 단축키 안내</span>
          <Info className="w-3 h-3 text-teal-400" />
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] font-mono">
          <div><kbd className="px-1 py-0.2 bg-slate-900 border border-slate-700 rounded text-amber-300">Space</kbd> : 검토완료 스탬프</div>
          <div><kbd className="px-1 py-0.2 bg-slate-900 border border-slate-700 rounded text-teal-300">2x Space</kbd> : 동일부품 연쇄완료</div>
          <div><kbd className="px-1 py-0.2 bg-slate-900 border border-slate-700 rounded text-rose-300">X</kbd> : 누락 X-Ray 토글</div>
          <div><kbd className="px-1 py-0.2 bg-slate-900 border border-slate-700 rounded text-purple-300">Ctrl+G</kbd> : 선택항목 그룹핑</div>
        </div>
      </div>

      {/* 5. Bottom Reset Action */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
        <button
          onClick={() => {
            if (confirm('현재 견적건의 모든 검토 상태(고스트 처리)를 초기화하시겠습니까?')) {
              onResetAllReviews();
            }
          }}
          className="text-slate-500 hover:text-rose-400 text-xs flex items-center space-x-1 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>전체 검토상태 초기화</span>
        </button>

        <button
          onClick={onClose}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
        >
          패널 닫기
        </button>
      </div>
    </div>
  );
}
