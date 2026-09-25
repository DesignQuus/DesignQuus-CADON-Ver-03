'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Database, Plus, Upload, Search, Download, Trash2, CheckCircle2,
  RefreshCw, FileSpreadsheet, ArrowLeft, Sliders, DollarSign,
  AlertCircle, Layers, X, Scissors, Flame, Sparkles, Wrench, Percent, Factory, ShieldCheck,
  Target, Calculator, TrendingUp, ArrowRight
} from 'lucide-react';

const MATERIAL_NAMES: Record<string, string> = {
  'SS400': '일반구조용 탄소강',
  'S45C': '기계구조용 탄소강',
  'SCM440': '크롬몰리브덴강 (열처리용)',
  'SUS304': '스테인리스강 (일반내식)',
  'SUS316': '스테인리스강 (고내식/내약품)',
  'AL6061': '알루미늄 합금 (가공용)',
  'AL5052': '알루미늄 판재 (절곡용)',
  'FC250': '회주철 (기계베이스/하우징 주물)',
  'FCD450': '구상흑연주철 (고강도 주물)',
  'SKD11': '냉간금형용 합금공구강',
  'BsBM': '쾌삭 황동 / 동합금',
  'MC-NYLON': 'MC 나일론 (엔지니어링 플라스틱)',
  'POM': '아세탈 (POM 폴리아세탈)'
};

// 💡 3단계 담당자 눈높이: 실시간 단가 영향도 시뮬레이션용 대표 5대 부품
const BENCHMARK_PARTS = [
  {
    id: 0,
    name: 'MOTOR BRACKET',
    type: 'SHEET_METAL' as const,
    material: 'AL6061',
    spec: '660x400x10T',
    weightKg: 7.13,
    cuttingLengthM: 2.12,
    bendingCount: 2,
    pierceCount: 4,
    matKgRate: 5500,
    categoryLabel: '판금 절곡'
  },
  {
    id: 1,
    name: 'MOTOR SHAFT',
    type: 'MACHINING' as const,
    material: 'S45C',
    spec: 'Ø17 x L295',
    weightKg: 0.53,
    cuttingLengthM: 0.30,
    bendingCount: 0,
    pierceCount: 0,
    matKgRate: 1650,
    categoryLabel: '절삭 환봉'
  },
  {
    id: 2,
    name: 'BASE PLATE',
    type: 'SHEET_METAL' as const,
    material: 'SS400',
    spec: '620x375x3T',
    weightKg: 5.48,
    cuttingLengthM: 1.99,
    bendingCount: 0,
    pierceCount: 2,
    matKgRate: 1450,
    categoryLabel: '평판 레이저'
  },
  {
    id: 3,
    name: 'SENSOR BRACKET',
    type: 'SHEET_METAL' as const,
    material: 'AL6061',
    spec: '220x140x2T',
    weightKg: 0.17,
    cuttingLengthM: 0.72,
    bendingCount: 2,
    pierceCount: 4,
    matKgRate: 5500,
    categoryLabel: '판금 소형'
  },
  {
    id: 4,
    name: 'MOTOR END CAP',
    type: 'MACHINING' as const,
    material: 'S45C',
    spec: 'Ø25 x L35',
    weightKg: 0.14,
    cuttingLengthM: 0.05,
    bendingCount: 0,
    pierceCount: 0,
    matKgRate: 1650,
    categoryLabel: '절삭 소형'
  }
];

interface MasterProduct {
  id: string;
  master_code: string;
  standard_name: string;
  category: string;
  specification: string;
  material: string;
  unit: string;
  unit_price: number;
  price_type: string;
  created_at: string;
}

export default function MasterDataManagerPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'settings'>('products');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MasterProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // New Item Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('MACHINING');
  const [newSpec, setNewSpec] = useState('');
  const [newMaterial, setNewMaterial] = useState('SS400');
  const [newPrice, setNewPrice] = useState<number>(0);
  const [savingItem, setSavingItem] = useState(false);

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedPreview, setImportedPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<{
    total: number;
    machining: number;
    sheetMetal: number;
    casting: number;
    commercial: number;
    electrical: number;
    assembly: number;
  }>({ total: 0, machining: 0, sheetMetal: 0, casting: 0, commercial: 0, electrical: 0, assembly: 0 });

  // Settings State
  const [materialRates, setMaterialRates] = useState<Record<string, number>>({});
  const [processRates, setProcessRates] = useState<Record<string, number>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // 💡 3단계 담당자 눈높이 UX 상태
  const [selectedEstimatorIndex, setSelectedEstimatorIndex] = useState<number>(0);
  const [targetPriceInput, setTargetPriceInput] = useState<number>(30000);
  const [reverseEstimating, setReverseEstimating] = useState<boolean>(false);
  const [reverseResult, setReverseResult] = useState<any>(null);
  const [appliedNotice, setAppliedNotice] = useState<string>('');

  // 기준 표준 단가 vs 현재 임률 시뮬레이션 계산
  const calculateBenchmarkPrice = (part: typeof BENCHMARK_PARTS[0], rates: Record<string, number>) => {
    const matRate = materialRates[part.material] || part.matKgRate;
    const matCost = Math.round(part.weightKg * matRate * 1.08);
    let procCost = 0;
    if (part.type === 'SHEET_METAL') {
      const cutRate = rates['SHEET_LASER_PER_METER'] || 1800;
      const bendRate = rates['SHEET_BEND_PER_STROKE'] || 800;
      const pierceRate = rates['SHEET_PIERCING_RATE'] || 80;
      procCost = Math.round(part.cuttingLengthM * cutRate) + (part.bendingCount * bendRate) + (part.pierceCount * pierceRate);
    } else {
      const machRate = rates['HOURLY_MACHINE_RATE'] || 45000;
      const setup = rates['SETUP_BASE_COST'] || 30000;
      const hours = part.weightKg > 1.0 ? 0.46 : (part.weightKg > 0.5 ? 0.43 : 0.40);
      procCost = Math.round(setup * 0.3 + hours * machRate * 0.6);
    }
    const margin = rates['DEFAULT_MARGIN_RATE'] || 0.18;
    const subtotal = matCost + procCost;
    return Math.ceil((subtotal * (1 + margin)) / 100) * 100;
  };

  // 목표 단가 역산 실행
  const handleRunReverseEstimate = async () => {
    const part = BENCHMARK_PARTS[selectedEstimatorIndex];
    if (!part) return;
    setReverseEstimating(true);
    setAppliedNotice('');
    try {
      const matRate = materialRates[part.material] || part.matKgRate;
      const matCost = Math.round(part.weightKg * matRate * 1.08);
      const res = await apiFetch('/api/admin/masters/reverse-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processType: part.type,
          targetPrice: Number(targetPriceInput) || 30000,
          materialCost: matCost,
          cuttingLengthMeter: part.cuttingLengthM,
          bendingCount: part.bendingCount,
          weightKg: part.weightKg,
          currentRates: {
            laserRatePerMeter: processRates['SHEET_LASER_PER_METER'] || 1800,
            bendRatePerStroke: processRates['SHEET_BEND_PER_STROKE'] || 800,
            machineRatePerHour: processRates['HOURLY_MACHINE_RATE'] || 45000
          }
        })
      });
      if (res.ok) {
        const json = await res.json();
        setReverseResult(json.result);
      }
    } catch (e: any) {
      alert('역산 실패: ' + e.message);
    } finally {
      setReverseEstimating(false);
    }
  };

  // 역산된 추천 임률 폼에 반영
  const handleApplyRecommendedRates = (rateType: 'bend' | 'cut' | 'mach') => {
    if (!reverseResult) return;
    if (rateType === 'bend' && reverseResult.recommendedBendRate) {
      setProcessRates({ ...processRates, SHEET_BEND_PER_STROKE: reverseResult.recommendedBendRate });
      setAppliedNotice(`절곡 단가가 ${reverseResult.recommendedBendRate.toLocaleString()}원/회(으)로 임률표에 반영되었습니다.`);
    } else if (rateType === 'cut' && reverseResult.recommendedCutRate) {
      setProcessRates({ ...processRates, SHEET_LASER_PER_METER: reverseResult.recommendedCutRate });
      setAppliedNotice(`절단 단가가 ${reverseResult.recommendedCutRate.toLocaleString()}원/m(으)로 임률표에 반영되었습니다.`);
    } else if (rateType === 'mach' && reverseResult.recommendedMachineRate) {
      setProcessRates({ ...processRates, HOURLY_MACHINE_RATE: reverseResult.recommendedMachineRate });
      setAppliedNotice(`기계가공 임률이 ${reverseResult.recommendedMachineRate.toLocaleString()}원/h(으)로 임률표에 반영되었습니다.`);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/masters?q=${encodeURIComponent(searchTerm)}&category=${categoryFilter}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setStats(data.stats || { total: 0, machining: 0, sheetMetal: 0, casting: 0, commercial: 0, electrical: 0, assembly: 0 });
      }

      const settingsRes = await apiFetch('/api/admin/masters?type=settings');
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setMaterialRates(sData.materialRates || {});
        setProcessRates(sData.processRates || {});
      }
    } catch (e) {
      console.error('Failed to load masters:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [categoryFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      alert('품목 코드와 품명은 필수 입력 항목입니다.');
      return;
    }

    setSavingItem(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_product',
          master_code: newCode,
          standard_name: newName,
          category: newCategory,
          specification: newSpec,
          material: newMaterial,
          unit_price: newPrice
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewCode('');
        setNewName('');
        setNewSpec('');
        setNewPrice(0);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '품목 등록에 실패했습니다.');
      }
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (id: string, code: string) => {
    if (!confirm(`정말로 마스터 품목 [${code}]을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/admin/masters?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(it => it.id !== id));
      } else {
        alert('삭제 실패');
      }
    } catch (e) {
      alert('삭제 중 오류 발생');
    }
  };

  // Excel Template Download Handler (.xlsx)
  const handleDownloadExcelTemplate = async () => {
    try {
      const XLSX = await import('xlsx');

      // 1. 등록 템플릿 양식 시트 (실무 6대 분류 대표 샘플 포함)
      const templateData = [
        {
          '품목코드(필수)': 'SF-001',
          '품명(필수)': 'MOTOR SHAFT',
          '규격(Spec)': 'DIA 25x300L',
          '재질': 'S45C',
          '부품분류': '가공품',
          '기준단가(원)': 45000,
          '단위': 'EA',
          '비고': '선반/밀링 가공'
        },
        {
          '품목코드(필수)': 'MB-001',
          '품명(필수)': 'MOTOR BASE BRACKET',
          '규격(Spec)': '150x120x10T',
          '재질': 'SS400',
          '부품분류': '판금/제관',
          '기준단가(원)': 28000,
          '단위': 'EA',
          '비고': '레이저 절단 및 절곡'
        },
        {
          '품목코드(필수)': 'CS-001',
          '품명(필수)': 'BEARING HOUSING',
          '규격(Spec)': 'DIA 120x80H',
          '재질': 'FC250',
          '부품분류': '주조품',
          '기준단가(원)': 55000,
          '단위': 'EA',
          '비고': '주물 성형 후 정밀가공'
        },
        {
          '품목코드(필수)': 'ST-B01',
          '품명(필수)': 'HEX SOCKET BOLT',
          '규격(Spec)': 'M8x25L',
          '재질': 'SCM435',
          '부품분류': '규격철물',
          '기준단가(원)': 350,
          '단위': 'EA',
          '비고': '기계 표준 규격볼트'
        },
        {
          '품목코드(필수)': 'EL-001',
          '품명(필수)': 'SERVO MOTOR 750W',
          '규격(Spec)': 'HG-KR73',
          '재질': 'STANDARD',
          '부품분류': '전장/모터',
          '기준단가(원)': 380000,
          '단위': 'EA',
          '비고': '미쓰비시 서보모터'
        },
        {
          '품목코드(필수)': 'AS-001',
          '품명(필수)': 'X-AXIS SLIDE MODULE',
          '규격(Spec)': 'STROKE 500mm',
          '재질': 'AL6061',
          '부품분류': '조립품',
          '기준단가(원)': 1250000,
          '단위': 'SET',
          '비고': '서브 조립체 모듈'
        }
      ];

      const wsTemplate = XLSX.utils.json_to_sheet(templateData);

      // 열 너비 자동 최적화
      wsTemplate['!cols'] = [
        { wch: 18 }, // 품목코드(필수)
        { wch: 28 }, // 품명(필수)
        { wch: 22 }, // 규격(Spec)
        { wch: 14 }, // 재질
        { wch: 14 }, // 부품분류
        { wch: 16 }, // 기준단가(원)
        { wch: 10 }, // 단위
        { wch: 24 }  // 비고
      ];

      // 2. 작성 가이드 및 분류 안내 시트
      const guideData = [
        { '항목': '품목코드', '필수여부': '필수', '허용값 / 설명': '사내 고유 품번 또는 도면번호 (예: SF-001, 10U+00B0 등). 중복 시 기존 정보가 갱신됩니다.' },
        { '항목': '품명', '필수여부': '필수', '허용값 / 설명': '표준 부품 명칭 (예: MOTOR SHAFT, BASE PLATE 등)' },
        { '항목': '규격(Spec)', '필수여부': '선택', '허용값 / 설명': '치수 또는 사양 (예: 150x120x10T, DIA 25x300L, M8x25L 등)' },
        { '항목': '재질', '필수여부': '선택', '허용값 / 설명': 'SS400, S45C, SUS304, SUS316, AL6061, FC250 등 (미입력 시 기본값 SS400)' },
        { '항목': '부품분류', '필수여부': '선택', '허용값 / 설명': '가공품, 판금/제관, 주조품, 규격철물, 전장/모터, 조립품 중 하나 입력 (미입력 시 가공품)' },
        { '항목': '기준단가', '필수여부': '선택', '허용값 / 설명': '숫자만 입력 (단위: 원, 쉼표 제외 권장, 예: 45000)' },
        { '항목': '단위', '필수여부': '선택', '허용값 / 설명': 'EA, SET, M, KG 등 (미입력 시 기본값 EA)' },
        { '항목': '비고', '필수여부': '선택', '허용값 / 설명': '용도, 가공 특이사항, 구매처 등 참고사항' }
      ];

      const wsGuide = XLSX.utils.json_to_sheet(guideData);
      wsGuide['!cols'] = [
        { wch: 16 },
        { wch: 12 },
        { wch: 80 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsTemplate, '마스터기준정보_등록양식');
      XLSX.utils.book_append_sheet(wb, wsGuide, '작성가이드');

      XLSX.writeFile(wb, 'CADON_마스터기준정보_등록템플릿.xlsx');
    } catch (error) {
      console.error('Failed to download template:', error);
      alert('엑셀 템플릿 다운로드 중 오류가 발생했습니다.');
    }
  };

  // CSV/Excel (.xlsx, .xls, .csv) 통합 파서
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rows || rows.length === 0) {
            alert('시트에 유효한 데이터가 존재하지 않습니다.');
            return;
          }

          // 다양한 헤더 명칭 유연하게 정규화
          const normalizedRows = rows.map((row: any) => {
            // 부품분류 텍스트를 영문 카테고리 코드로 변환
            const rawCategory = (row['부품분류'] || row['분류'] || row['카테고리'] || row['category'] || '').toString().trim();
            let category = 'MACHINING';
            if (rawCategory.includes('판금') || rawCategory.includes('제관') || rawCategory === 'SHEET_METAL') category = 'SHEET_METAL';
            else if (rawCategory.includes('주조') || rawCategory.includes('주물') || rawCategory === 'CASTING') category = 'CASTING';
            else if (rawCategory.includes('철물') || rawCategory.includes('규격') || rawCategory.includes('볼트') || rawCategory === 'COMMERCIAL') category = 'COMMERCIAL';
            else if (rawCategory.includes('전장') || rawCategory.includes('모터') || rawCategory.includes('공압') || rawCategory === 'ELECTRICAL') category = 'ELECTRICAL';
            else if (rawCategory.includes('조립') || rawCategory.includes('모듈') || rawCategory === 'ASSEMBLY') category = 'ASSEMBLY';
            else if (rawCategory.includes('가공') || rawCategory === 'MACHINING') category = 'MACHINING';

            return {
              master_code: (row['품목코드(필수)'] || row['품목코드'] || row['도면번호'] || row['코드'] || row['master_code'] || '').toString().trim(),
              standard_name: (row['품명(필수)'] || row['품명'] || row['표준품명'] || row['부품명'] || row['standard_name'] || '').toString().trim(),
              specification: (row['규격(Spec)'] || row['규격'] || row['specification'] || row['spec'] || '').toString().trim(),
              material: (row['재질'] || row['소재'] || row['material'] || 'SS400').toString().trim(),
              category,
              unit: (row['단위'] || row['unit'] || 'EA').toString().trim(),
              unit_price: Number(String(row['기준단가(원)'] || row['기준단가'] || row['단가'] || row['unit_price'] || '0').replace(/[^0-9.-]+/g, '')) || 0,
              notes: (row['비고'] || row['notes'] || '').toString().trim()
            };
          }).filter(r => r.master_code || r.standard_name);

          if (normalizedRows.length === 0) {
            alert('유효한 품목코드 또는 품명이 포함된 데이터 행을 찾을 수 없습니다.');
            return;
          }

          setImportedPreview(normalizedRows);
        } catch (err: any) {
          console.error('File parse error:', err);
          alert('파일을 읽는 도중 오류가 발생했습니다. 올바른 엑셀/CSV 파일인지 확인해 주세요.');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error('XLSX module load error:', err);
      alert('엑셀 파서 모듈 로드 실패');
    }
  };

  const handleConfirmImport = async () => {
    if (importedPreview.length === 0) return;
    setImporting(true);

    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_import',
          items: importedPreview
        })
      });

      if (res.ok) {
        const result = await res.json();
        alert(`총 ${result.count}건의 마스터 품목이 성공적으로 데이터베이스에 적재되었습니다.`);
        setShowImportModal(false);
        setImportedPreview([]);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '대량 일괄 업로드 실패');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/admin/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          materialRates,
          processRates
        })
      });

      if (res.ok) {
        alert('소재 시세 및 공정 임률 설정이 안전하게 저장되었습니다.');
      } else {
        alert('설정 저장 실패');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-2xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link href="/cases" className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Database className="w-5 h-5" />
              </span>
              <h1 className="text-lg font-bold text-slate-900">기준정보(마스터) 관리 센터</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              사내 공인 표준 부품, 단가표, 소재 시세 및 가공 임률을 등록하고 관리합니다.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'products' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>표준 품목 및 단가 대장</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'settings' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>소재 시세 & 가공 임률 설정</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'products' ? (
          <>
            {/* Top Stat Cards: 6대 실무 분류 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-slate-500 block">전체 마스터</span>
                <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{stats.total.toLocaleString()}개</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-blue-600 block">기계 가공품</span>
                <span className="text-xl font-black text-blue-700 font-mono mt-0.5 block">{stats.machining.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-cyan-600 block">판금/제관품</span>
                <span className="text-xl font-black text-cyan-700 font-mono mt-0.5 block">{stats.sheetMetal.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-orange-600 block">주조/주물품</span>
                <span className="text-xl font-black text-orange-700 font-mono mt-0.5 block">{stats.casting.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-emerald-600 block">규격 철물</span>
                <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">{stats.commercial.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-purple-600 block">전장/공압품</span>
                <span className="text-xl font-black text-purple-700 font-mono mt-0.5 block">{stats.electrical.toLocaleString()}종</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-medium text-indigo-600 block">조립품(모듈)</span>
                <span className="text-xl font-black text-indigo-700 font-mono mt-0.5 block">{stats.assembly.toLocaleString()}종</span>
              </div>
            </div>

            {/* Toolbar: Search, Filters, Actions */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <form onSubmit={handleSearch} className="flex items-center space-x-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="품목코드, 품명, 규격, 재질 검색..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  검색
                </button>
              </form>

              {/* Category Filter Chips (6대 실무 분류) */}
              <div className="flex items-center flex-wrap gap-1 text-xs">
                {[
                  { id: 'ALL', label: '전체' },
                  { id: 'MACHINING', label: '가공품' },
                  { id: 'SHEET_METAL', label: '판금/제관' },
                  { id: 'CASTING', label: '주조품' },
                  { id: 'COMMERCIAL', label: '규격철물' },
                  { id: 'ELECTRICAL', label: '전장/공압' },
                  { id: 'ASSEMBLY', label: '조립품' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      categoryFilter === cat.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="사내 단가 대량 등록용 표준 엑셀 템플릿 서식 다운로드 (.xlsx)"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>엑셀 템플릿 다운로드</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>엑셀 일괄 업로드</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>신규 품목 등록</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 w-12 text-center">No</th>
                    <th className="p-3 w-36">마스터 코드</th>
                    <th className="p-3">표준 품명</th>
                    <th className="p-3 w-36">규격 (Spec)</th>
                    <th className="p-3 w-28 text-center">재질</th>
                    <th className="p-3 w-28 text-center">부품 유형</th>
                    <th className="p-3 w-32 text-right">공인 기준단가</th>
                    <th className="p-3 w-16 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        기준정보 데이터를 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        등록된 마스터 품목이 없습니다. 상단 [신규 품목 등록] 또는 [엑셀 일괄 업로드]를 진행해 주세요.
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr key={it.id || it.master_code || `master-item-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{it.master_code}</td>
                        <td className="p-3 font-medium text-slate-900">{it.standard_name}</td>
                        <td className="p-3 font-mono text-slate-600">{it.specification || '-'}</td>
                        <td className="p-3 text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px]">
                            {it.material || 'SS400'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            it.category === 'MACHINING' ? 'bg-blue-100 text-blue-800' :
                            it.category === 'SHEET_METAL' ? 'bg-cyan-100 text-cyan-800' :
                            it.category === 'CASTING' ? 'bg-orange-100 text-orange-800' :
                            it.category === 'COMMERCIAL' ? 'bg-emerald-100 text-emerald-800' :
                            it.category === 'ELECTRICAL' ? 'bg-purple-100 text-purple-800' :
                            it.category === 'ASSEMBLY' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {it.category === 'MACHINING' ? '가공품' :
                             it.category === 'SHEET_METAL' ? '판금/제관' :
                             it.category === 'CASTING' ? '주조품' :
                             it.category === 'COMMERCIAL' ? '규격철물' :
                             it.category === 'ELECTRICAL' ? '전장/공압' :
                             it.category === 'ASSEMBLY' ? '조립품' : (it.category || '미분류')}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-blue-700 text-sm">
                          {it.unit_price > 0 ? `₩${it.unit_price.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteItem(it.id, it.master_code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* Tab 2: Settings (소재 시세 & 임률 설정) */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">공학 표준 원가 기초 파라미터 설정</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  마스터에 없는 신규 부품 견적 시, 도면 치수와 결합되어 표준 원가를 자동 계산하는 사내 공인 기준표입니다.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>설정 저장</span>
              </button>
            </div>

            {/* 💡 출발점(기본 추정치) 안내 배너 */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>안내: 가공 임률은 업계 표준 추정값(출발점)입니다</span>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 text-[10px] rounded font-mono font-medium">출발점 (Base Heuristic)</span>
                </p>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  본 임률은 공인 절대값이 아닌 초기 계산을 위한 출발 기준선입니다. 
                  담당자가 견적 검토 화면에서 실제 거래 단가를 확정함에 따라, 시스템이 누적된 오차(Delta)와 도면 형상 피처를 분석하여 실제 공장 맞춤형 임률을 역산하고 자동 보정해 나갑니다.
                </p>
              </div>
            </div>

            {/* 🔒 회귀 엔진 상태 배너: 데이터 축적 중 명시 */}
            <div className="bg-slate-100/90 border border-slate-300 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800">
                  실거래 단가 기반 회귀 임률 역산 엔진
                </span>
                <span className="text-[10px] bg-amber-100 border border-amber-300 text-amber-800 px-2 py-0.5 rounded font-mono font-bold">
                  데이터 축적 모드 (가동 보류)
                </span>
              </div>
              <div className="text-[11px] text-slate-600">
                실무자 확정 표본: <strong className="text-slate-900 font-mono">0건</strong> (공정별 최소 10건 축적 시 자동 활성화)
              </div>
            </div>

            {/* 💡 3단계 담당자 눈높이 도구: 1) 실시간 견적 영향도 미리보기 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-800">
                    실시간 견적 영향도 미리보기 (대표 5대 부품 시뮬레이션)
                  </h3>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                    임률 수정 즉시 연동
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  ※ 아래 임률표의 수치를 변경하면 대표 부품들의 견적 변동액이 실시간으로 계산됩니다.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {BENCHMARK_PARTS.map((p) => {
                  const basePrice = calculateBenchmarkPrice(p, {
                    SHEET_LASER_PER_METER: 1800,
                    SHEET_BEND_PER_STROKE: 800,
                    SHEET_PIERCING_RATE: 80,
                    HOURLY_MACHINE_RATE: 45000,
                    SETUP_BASE_COST: 30000,
                    DEFAULT_MARGIN_RATE: 0.18
                  });
                  const currentPrice = calculateBenchmarkPrice(p, processRates);
                  const diff = currentPrice - basePrice;
                  const diffPct = basePrice > 0 ? Number(((diff / basePrice) * 100).toFixed(1)) : 0;

                  return (
                    <div key={p.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {p.categoryLabel}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{p.material}</span>
                      </div>
                      <div className="font-bold text-xs text-slate-800 truncate" title={p.name}>
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{p.spec}</div>
                      <div className="pt-1.5 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[10px] text-slate-400">예상 견적</span>
                        <span className="font-mono font-bold text-sm text-slate-900">
                          ₩{currentPrice.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">기준 대비</span>
                        <span className={`font-mono font-bold ${
                          diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-blue-600' : 'text-slate-400'
                        }`}>
                          {diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? diff.toLocaleString() : '0'} ({diffPct > 0 ? `+${diffPct}` : diffPct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 💡 3단계 담당자 눈높이 도구: 2) 목표 단가 기반 임률 역산기 */}
            <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-indigo-950">
                    목표 단가 기반 임률 역산기 (Reverse Rate Estimator)
                  </h3>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">
                    "이 부품 3만원 맞추기"
                  </span>
                </div>
                {appliedNotice && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg animate-pulse">
                    ✓ {appliedNotice}
                  </span>
                )}
              </div>

              <div className="bg-white p-3 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">대상 부품 선택</label>
                  <select
                    value={selectedEstimatorIndex}
                    onChange={(e) => setSelectedEstimatorIndex(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {BENCHMARK_PARTS.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        [{p.categoryLabel}] {p.name} ({p.spec})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">목표 희망 단가 (원)</label>
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-400 font-mono">₩</span>
                    <input
                      type="number"
                      value={targetPriceInput}
                      onChange={(e) => setTargetPriceInput(Number(e.target.value))}
                      placeholder="30000"
                      className="w-full text-right font-mono font-bold border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 md:pt-0">
                  <button
                    onClick={handleRunReverseEstimate}
                    disabled={reverseEstimating || targetPriceInput <= 0}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {reverseEstimating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                    <span>임률 역산</span>
                  </button>
                </div>

                <div className="md:col-span-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                  {reverseResult ? (
                    <div className="space-y-1.5">
                      <p className="text-slate-700 leading-snug">{reverseResult.guidance}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {reverseResult.recommendedBendRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('bend')}
                            className="px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            절곡 {reverseResult.recommendedBendRate.toLocaleString()}원 적용
                          </button>
                        )}
                        {reverseResult.recommendedCutRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('cut')}
                            className="px-2 py-0.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            절단 {reverseResult.recommendedCutRate.toLocaleString()}원 적용
                          </button>
                        )}
                        {reverseResult.recommendedMachineRate && (
                          <button
                            onClick={() => handleApplyRecommendedRates('mach')}
                            className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-[10px] cursor-pointer"
                          >
                            임률 {reverseResult.recommendedMachineRate.toLocaleString()}원 적용
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      부품과 목표 단가를 입력하고 [임률 역산] 버튼을 누르면 추천 임률이 가이드됩니다.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 좌측: 소재별 시세 (5 cols) */}
              <div className="lg:col-span-5 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>소재별 kg당 기준 시세 (원/kg)</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">총 {Object.keys(materialRates).length}개 강종</span>
                </div>
                <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {Object.entries(materialRates).map(([mat, rate]) => (
                    <div key={mat} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-xs hover:border-slate-300 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-slate-800">{mat}</span>
                        <span className="text-[10px] text-slate-400">{MATERIAL_NAMES[mat] || '일반 금속/수지재'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-slate-400 font-mono">₩</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={(e) => setMaterialRates({ ...materialRates, [mat]: Number(e.target.value) })}
                          className="w-24 text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500 bg-slate-50 focus:bg-white"
                        />
                        <span className="text-slate-500 text-[11px]">/kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 우측: 공정별 가공 임률 및 표준 원가 파라미터 (7 cols) */}
              <div className="lg:col-span-7 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>제조업 공정별 표준 가공 임률 & 파라미터</span>
                </h3>

                <div className="space-y-3.5 max-h-[640px] overflow-y-auto pr-1">
                  {/* 1. 기계 가공 (절삭) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-blue-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                        <Factory className="w-3.5 h-3.5 text-blue-600" />
                        <span>1. 기계 가공 (절삭 / 선반 / 밀링)</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">기본 추정치</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">CNC / 머시닝센터 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_MACHINE_RATE'] || 45000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_MACHINE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">범용 선반 / 밀링 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_LATHE_RATE'] || 40000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_LATHE_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-blue-700 font-medium">가공 준비 셋업 기본료 (소량보전)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SETUP_BASE_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'SETUP_BASE_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-blue-200 rounded px-2 py-1 text-blue-900 bg-blue-50/30 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 판금 / 제관 (Sheet Metal) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-cyan-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-800">
                        <Scissors className="w-3.5 h-3.5 text-cyan-600" />
                        <span>2. 판금 / 제관 (레이저 절단 / 피어싱 / 절곡 / 용접)</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">기본 추정치</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">레이저 외곽 절단 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_LASER_PER_METER'] || 1800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_LASER_PER_METER': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/m</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-cyan-700 font-medium">레이저 피어싱(홀당) 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_PIERCING_RATE'] || 80}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_PIERCING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-cyan-200 rounded px-2 py-1 text-cyan-900 bg-cyan-50/30 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/홀</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">절곡(Bending) 1회 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['SHEET_BEND_PER_STROKE'] || 800}
                            onChange={(e) => setProcessRates({ ...processRates, 'SHEET_BEND_PER_STROKE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/회</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">제관 용접 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_WELDING_RATE'] || 38000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_WELDING_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-cyan-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 주조 / 주물 (Casting) */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-amber-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                        <span>3. 주조 / 주물 (형상 성형 및 주물 가공)</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">기본 추정치</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">주조 형상 성형 kg당 공정비</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['CASTING_PER_KG_RATE'] || 2500}
                            onChange={(e) => setProcessRates({ ...processRates, 'CASTING_PER_KG_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. 후처리 / 열처리 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-purple-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>4. 표면처리 & 열처리 (도장 / 아노다이징 / 열처리)</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">기본 추정치</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">분체도장 ㎡당 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['PAINTING_PER_SQM'] || 9000}
                            onChange={(e) => setProcessRates({ ...processRates, 'PAINTING_PER_SQM': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/㎡</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">아노다이징 개당 기본료</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['ANODIZING_PER_UNIT'] || 1500}
                            onChange={(e) => setProcessRates({ ...processRates, 'ANODIZING_PER_UNIT': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/개</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">열처리(Q/T) kg당 단가</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HEAT_TREATMENT_PER_KG'] || 1200}
                            onChange={(e) => setProcessRates({ ...processRates, 'HEAT_TREATMENT_PER_KG': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/kg</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-purple-700 font-medium">외주 최소 로트 기본료 (소량보전)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['TREATMENT_MIN_LOT_COST'] || 30000}
                            onChange={(e) => setProcessRates({ ...processRates, 'TREATMENT_MIN_LOT_COST': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-purple-200 rounded px-2 py-1 text-purple-900 bg-purple-50/30 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/건</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. 조달 관리 & 모듈 조립 & 물류 & 마진율 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 pb-1 border-b border-slate-100">
                      <Wrench className="w-3.5 h-3.5 text-slate-600" />
                      <span>5. 조달 관리비율 & 조립 공수 & 물류 & 표준 마진</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">전장/구매품 조달관리율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['ELECTRICAL_OVERHEAD_RATE'] ?? 0.08) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'ELECTRICAL_OVERHEAD_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">%</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">유닛 조립/배선 시간당 임률</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">₩</span>
                          <input
                            type="number"
                            value={processRates['HOURLY_ASSEMBLY_RATE'] || 35000}
                            onChange={(e) => setProcessRates({ ...processRates, 'HOURLY_ASSEMBLY_RATE': Number(e.target.value) })}
                            className="w-full text-right font-mono font-bold border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">원/h</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block text-slate-700 font-medium">포장 및 출하 물류비율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['PACKAGING_SHIPPING_RATE'] ?? 0.03) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'PACKAGING_SHIPPING_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-slate-300 rounded px-2 py-1 text-slate-900 bg-slate-50 focus:outline-none focus:border-slate-500"
                          />
                          <span className="text-slate-500 text-[11px] shrink-0">% (3%)</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">표준 목표 마진율 (%)</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <input
                            type="number"
                            step="1"
                            value={((processRates['DEFAULT_MARGIN_RATE'] ?? 0.18) * 100).toFixed(0)}
                            onChange={(e) => setProcessRates({ ...processRates, 'DEFAULT_MARGIN_RATE': Number(e.target.value) / 100 })}
                            className="w-full text-right font-mono font-bold border border-blue-200 rounded px-2 py-1 text-blue-900 bg-blue-50/50 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-blue-600 font-bold text-[11px] shrink-0">% (기준 18%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal 1: Create Single Item */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>신규 마스터 품목 등록</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">마스터 코드 *</label>
                  <input
                    type="text"
                    required
                    placeholder="예: SF-101, MB-001"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">부품 유형</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2"
                  >
                    <option value="MACHINING">가공품 (Machining)</option>
                    <option value="SHEET_METAL">판금/제관품 (Sheet Metal / Weldment)</option>
                    <option value="CASTING">주조품 (Casting)</option>
                    <option value="COMMERCIAL">표준 규격품/철물 (Hardware / Fasteners)</option>
                    <option value="ELECTRICAL">전장/공압/구동품 (Electric & Pneumatic)</option>
                    <option value="ASSEMBLY">조립품/모듈 (Sub-Assembly)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">표준 품명 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: MOTOR BRACKET, SHAFT"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">규격 (Specification)</label>
                  <input
                    type="text"
                    placeholder="예: 150x120x10T, DIA 25x300L"
                    value={newSpec}
                    onChange={(e) => setNewSpec(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">표준 재질</label>
                  <input
                    type="text"
                    placeholder="예: SS400, AL6061, S45C"
                    value={newMaterial}
                    onChange={(e) => setNewMaterial(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">공인 기준단가 (원)</label>
                <input
                  type="number"
                  placeholder="예: 45000"
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg p-2 font-mono text-blue-700 font-bold"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                >
                  {savingItem ? '저장 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Bulk Import */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>엑셀/CSV 마스터 단가 대량 일괄 등록</span>
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 템플릿 다운로드 안내 박스 */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center space-x-1.5 text-emerald-900 font-bold">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>표준 엑셀 템플릿 양식에 맞춰 작성 후 업로드하세요</span>
                  </div>
                  <p className="text-emerald-700 text-[11px] mt-1">
                    <strong>품목코드, 품명, 규격, 재질, 부품분류, 기준단가</strong> 열이 포함된 엑셀(.xlsx) 및 CSV 파일을 완벽 지원합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center space-x-1.5 shrink-0 cursor-pointer shadow-2xs transition-colors"
                  title="CADON 마스터 기준정보 표준 엑셀 서식 다운로드"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>양식 다운로드 (.xlsx)</span>
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="w-full p-3 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600"
              />

              {importedPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>미리보기 ({importedPreview.length}건 감지됨)</span>
                  </div>
                  <div className="max-h-56 overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2">품목코드</th>
                          <th className="p-2">품명</th>
                          <th className="p-2">규격</th>
                          <th className="p-2">재질</th>
                          <th className="p-2 text-right">단가</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedPreview.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            <td className="p-2 font-mono">{row.master_code || row['품목코드'] || row['도면번호']}</td>
                            <td className="p-2">{row.standard_name || row['품명']}</td>
                            <td className="p-2 font-mono">{row.specification || row['규격']}</td>
                            <td className="p-2">{row.material || row['재질']}</td>
                            <td className="p-2 text-right font-mono font-bold text-blue-700">
                              ₩{Number(row.unit_price || row['기준단가'] || row['단가'] || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importedPreview.length > 10 && (
                    <span className="text-[10px] text-slate-400 block text-right">외 {importedPreview.length - 10}건 생략...</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={importing || importedPreview.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {importing ? '적재 중...' : `${importedPreview.length}건 DB로 적재하기`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
