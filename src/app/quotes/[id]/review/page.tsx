'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, CheckCircle2, RefreshCw, FileText, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, Sparkles, Layers, Zap, Database
} from 'lucide-react';
import QuoteLineGrid, { QuoteReviewLine } from '@/components/review/QuoteLineGrid';
import CostBreakdownPanel from '@/components/review/CostBreakdownPanel';
import MasterRecommendationCard, { RecommendationItem } from '@/components/review/MasterRecommendationCard';
import ReviewCadViewer from '@/components/review/ReviewCadViewer';
import PipelineNavigator from '@/components/common/PipelineNavigator';
import {
  calculateCastingCost,
  calculateMachiningCost,
  calculateSheetMetalCost,
  calculateElectricalCost,
  calculateCommercialCost,
  CostCalculationResult,
  PartType
} from '@/lib/cost-engine-v2';

export default function QuoteReviewWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [caseInfo, setCaseInfo] = useState<any>(null);
  const [lines, setLines] = useState<QuoteReviewLine[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);

  // 실제 CAD 도면 및 2D 벡터 오브젝트 상태
  const [files, setFiles] = useState<any[]>([]);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [cadObjects, setCadObjects] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [bomAreas, setBomAreas] = useState<any[]>([]);
  const [rawBomItems, setRawBomItems] = useState<any[]>([]);
  const [calculatingEngineering, setCalculatingEngineering] = useState<boolean>(false);

  // 실제 사내 마스터 DB 및 과거 수주 지식풀 추천 목록
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(false);
  const [submittingQuote, setSubmittingQuote] = useState<boolean>(false);

  // 케이스 데이터 로드 (실데이터 우선 바인딩 & CAD 벡터 도면 동기화)
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/quotation-cases/${caseId}`);
        if (res.ok) {
          const json = await res.json();
          setCaseInfo(json.case);
          setFiles(json.files || []);
          setDrawings(json.drawings || []);
          setCadObjects(json.cadObjects || []);
          setRelationships(json.relationships || []);
          setBomAreas(json.bomAreas || []);
          setRawBomItems(json.rawBomItems || []);

          // 1. 실제 견적서 품목(quoteItems)이 이미 생성되어 있는 경우
          if (Array.isArray(json.quoteItems) && json.quoteItems.length > 0) {
            setLines(
              json.quoteItems.map((qi: any, idx: number) => {
                const hasPrice = Number(qi.unit_price) > 0;
                const specLower = (qi.specification || '').toLowerCase();
                const matLower = (qi.material || '').toLowerCase();
                const nameLower = (qi.item_name || '').toLowerCase();
                const isAssembly = qi.drawing_type === 'MAIN_ASSEMBLY' || qi.drawing_type === 'SUB_ASSEMBLY' ||
                                   nameLower.includes('조립') || nameLower.includes('assembly') || nameLower.includes('line');
                const isConfirmed = isAssembly || (hasPrice && qi.is_included !== 0);

                // 6대 실무 부품 유형 자동 분류
                let partType: PartType = 'MACHINING';
                if (isAssembly) {
                  partType = 'ASSEMBLY';
                } else if (
                  nameLower.includes('판금') || nameLower.includes('커버') || nameLower.includes('브라켓') ||
                  nameLower.includes('cover') || nameLower.includes('bracket') || nameLower.includes('duct') ||
                  specLower.includes('sheet') || (specLower.includes('t') && (nameLower.includes('plate') || nameLower.includes('frame')))
                ) {
                  partType = 'SHEET_METAL';
                } else if (
                  nameLower.includes('모터') || nameLower.includes('센서') || nameLower.includes('실린더') ||
                  nameLower.includes('motor') || nameLower.includes('sensor') || nameLower.includes('cylinder') ||
                  nameLower.includes('valve') || nameLower.includes('plc') || nameLower.includes('servo')
                ) {
                  partType = 'ELECTRICAL';
                } else if (
                  specLower.includes('bolt') || specLower.includes('nut') || specLower.includes('washer') ||
                  specLower.includes('screw') || specLower.includes('pin') || specLower.includes('o-ring') ||
                  nameLower.includes('볼트') || nameLower.includes('너트') || nameLower.includes('와셔')
                ) {
                  partType = 'COMMERCIAL';
                } else if (
                  matLower.includes('scs') || matLower.includes('cast') || matLower.includes('gcd') || matLower.includes('fcd') ||
                  nameLower.includes('주물') || nameLower.includes('주조')
                ) {
                  partType = 'CASTING';
                }

                const supplyPrice = Number(qi.unit_price) || 0;
                const unitCost = Math.round(supplyPrice * 0.82);

                const isIncluded = !isAssembly && qi.is_included !== 0;

                return {
                  id: qi.id,
                  itemNo: qi.item_no || idx + 1,
                  partNo: qi.drawing_no || qi.master_code || `PART-${idx + 1}`,
                  partName: qi.item_name || 'BOM 부품',
                  partType: partType,
                  material: qi.material || 'SS400',
                  quantity: Number(qi.quantity) || 1,
                  unitCost: isAssembly ? 0 : unitCost,
                  supplyPrice: isAssembly ? 0 : supplyPrice,
                  status: isAssembly ? 'CONFIRMED' : (hasPrice && isIncluded ? 'CONFIRMED' : 'NEEDS_REVIEW'),
                  balloonNo: String(qi.item_no || idx + 1),
                  memo: qi.remark || '',
                  specification: qi.specification || '',
                  isAssembly,
                  isIncluded,
                  excludeReason: isAssembly ? '조립도 (가공품 제외)' : (isIncluded ? undefined : '견적 제외')
                };
              })
            );
          } else if (Array.isArray(json.normalizedItems) && json.normalizedItems.length > 0) {
            // 2. 견적서 생성 전 정규화 BOM 항목(normalizedItems)이 있는 경우
            const isCaseReady = json.case?.quote_readiness === 'READY_FOR_QUOTE';
            setLines(
              json.normalizedItems.map((it: any, idx: number) => {
                const specLower = (it.spec_candidate || '').toLowerCase();
                const matLower = (it.material_candidate || '').toLowerCase();
                const nameLower = (it.normalized_name || it.raw_name || '').toLowerCase();
                const isAssembly = it.drawing_type === 'MAIN_ASSEMBLY' || it.drawing_type === 'SUB_ASSEMBLY' ||
                                   nameLower.includes('조립') || nameLower.includes('assembly') || nameLower.includes('line');
                const isApproved = isAssembly || isCaseReady || it.approval_status === 'APPROVED' || it.is_quote_included !== 0;

                // 6대 실무 부품 유형 자동 분류
                let partType: PartType = 'MACHINING';
                if (isAssembly) {
                  partType = 'ASSEMBLY';
                } else if (
                  nameLower.includes('판금') || nameLower.includes('커버') || nameLower.includes('브라켓') ||
                  nameLower.includes('cover') || nameLower.includes('bracket') || nameLower.includes('duct') ||
                  specLower.includes('sheet') || (specLower.includes('t') && (nameLower.includes('plate') || nameLower.includes('frame')))
                ) {
                  partType = 'SHEET_METAL';
                } else if (
                  nameLower.includes('모터') || nameLower.includes('센서') || nameLower.includes('실린더') ||
                  nameLower.includes('motor') || nameLower.includes('sensor') || nameLower.includes('cylinder') ||
                  nameLower.includes('valve') || nameLower.includes('plc') || nameLower.includes('servo')
                ) {
                  partType = 'ELECTRICAL';
                } else if (
                  specLower.includes('bolt') || specLower.includes('nut') || specLower.includes('washer') ||
                  specLower.includes('screw') || specLower.includes('pin') || specLower.includes('o-ring') ||
                  nameLower.includes('볼트') || nameLower.includes('너트') || nameLower.includes('와셔')
                ) {
                  partType = 'COMMERCIAL';
                } else if (
                  matLower.includes('scs') || matLower.includes('cast') || matLower.includes('gcd') || matLower.includes('fcd') ||
                  nameLower.includes('주물') || nameLower.includes('주조')
                ) {
                  partType = 'CASTING';
                }

                const unitCost = isAssembly ? 0 :
                                 partType === 'CASTING' ? 345000 :
                                 partType === 'SHEET_METAL' ? 28500 :
                                 partType === 'MACHINING' ? 34500 :
                                 partType === 'ELECTRICAL' ? 185000 : 420;
                const supplyPrice = isAssembly ? 0 : Math.ceil(unitCost * 1.18 / 100) * 100;
                const isIncluded = !isAssembly && it.is_quote_included !== 0;

                return {
                  id: it.id,
                  itemNo: idx + 1,
                  partNo: it.spec_candidate || it.drawing_no || `BOM-${idx + 1}`,
                  partName: it.normalized_name || it.raw_name || 'BOM 부품',
                  partType: partType,
                  material: it.material_candidate || it.drawing_material || 'SS400',
                  quantity: Number(it.quantity) || 1,
                  unitCost,
                  supplyPrice,
                  status: isAssembly ? 'CONFIRMED' : (isApproved && isIncluded ? 'CONFIRMED' : 'NEEDS_REVIEW'),
                  balloonNo: String(idx + 1),
                  specification: it.specification || it.spec_candidate || '',
                  isAssembly,
                  isIncluded,
                  excludeReason: isAssembly ? '조립도 (가공품 제외)' : (isIncluded ? undefined : '견적 제외')
                };
              })
            );
          } else if (Array.isArray(json.drawings) && json.drawings.length > 0) {
            // 3. 3중 Fallback: 정규화 전 도면 목록(drawings) 기반 즉시 라인 생성
            setLines(
              json.drawings.map((d: any, idx: number) => {
                const nameLower = (d.drawing_name_raw || d.drawing_name_normalized || '').toLowerCase();
                const matLower = (d.material || '').toLowerCase();
                const specLower = (d.scale || '').toLowerCase();
                const isAssembly = d.drawing_type === 'MAIN_ASSEMBLY' || d.drawing_type === 'SUB_ASSEMBLY' ||
                                   nameLower.includes('조립') || nameLower.includes('assembly') || nameLower.includes('line');
                
                let partType: PartType = 'MACHINING';
                if (isAssembly) {
                  partType = 'ASSEMBLY';
                } else if (
                  nameLower.includes('판금') || nameLower.includes('커버') || nameLower.includes('브라켓') ||
                  nameLower.includes('cover') || nameLower.includes('bracket') || nameLower.includes('duct') ||
                  specLower.includes('sheet')
                ) {
                  partType = 'SHEET_METAL';
                } else if (
                  nameLower.includes('모터') || nameLower.includes('센서') || nameLower.includes('실린더') ||
                  nameLower.includes('motor') || nameLower.includes('sensor') || nameLower.includes('cylinder')
                ) {
                  partType = 'ELECTRICAL';
                } else if (
                  nameLower.includes('볼트') || nameLower.includes('너트') || nameLower.includes('와셔')
                ) {
                  partType = 'COMMERCIAL';
                }

                const unitCost = isAssembly ? 0 :
                                 partType === 'SHEET_METAL' ? 28500 :
                                 partType === 'MACHINING' ? 34500 :
                                 partType === 'ELECTRICAL' ? 185000 : 420;
                const supplyPrice = isAssembly ? 0 : Math.ceil(unitCost * 1.18 / 100) * 100;
                const isIncluded = !isAssembly && d.is_quote_included !== 0;

                return {
                  id: d.id || `dwg_${idx + 1}`,
                  itemNo: idx + 1,
                  partNo: d.drawing_no_raw || d.drawing_no_normalized || `DWG-${idx + 1}`,
                  partName: d.drawing_name_raw || d.drawing_name_normalized || '부품 도면',
                  partType: partType,
                  material: d.material || 'SS400',
                  quantity: 1,
                  unitCost,
                  supplyPrice,
                  status: isAssembly ? 'CONFIRMED' : 'NEEDS_REVIEW',
                  balloonNo: String(idx + 1),
                  specification: d.scale || '',
                  isAssembly,
                  isIncluded,
                  excludeReason: isAssembly ? '조립도 (가공품 제외)' : (isIncluded ? undefined : '견적 제외')
                };
              })
            );
          } else {
            setLines([]);
          }
        }
      } catch (e) {
        console.error('Failed to load review case:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [caseId]);

  const selectedLine = lines[selectedIndex] || null;

  // 💎 2단계: 실제 Master DB & 수기 단가 지식풀(manual_price_pool) 실시간 추천 조회
  useEffect(() => {
    if (!selectedLine) {
      setRecommendations([]);
      return;
    }
    const qName = selectedLine.partName || selectedLine.partNo;
    if (!qName) return;

    let active = true;
    setLoadingRecs(true);

    apiFetch(`/api/manual-prices?name=${encodeURIComponent(qName)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const recs: RecommendationItem[] = [];

        // 1. 사내 기준 단가 마스터 (price_masters + product_masters)
        if (Array.isArray(json.priceMasters)) {
          for (const pm of json.priceMasters) {
            recs.push({
              id: `pm_${pm.price_master_id || pm.master_id}`,
              sourceCompany: '기준 단가 마스터',
              partNo: pm.master_code || pm.standard_name,
              revision: 'STD',
              unitPrice: Number(pm.unit_price || 0),
              confirmedDate: '사내 표준',
              isOrdered: true,
              matchReason: pm.master_code === selectedLine.partNo ? 'REVISION_MATCH' : 'SPEC_SIMILAR',
              specDesc: `${pm.material || ''} ${pm.specification || ''}`.trim() || '기준 규격 마스터'
            });
            if (recs.length >= 3) break;
          }
        }

        // 2. 수기 단가 지식 풀 (과거 실제 견적 승인/도면 검수 이력)
        if (Array.isArray(json.manualPrices)) {
          for (const mp of json.manualPrices) {
            if (recs.some((r) => r.unitPrice === mp.unit_price)) continue;
            recs.push({
              id: `mp_${mp.id}`,
              sourceCompany: mp.company_name || '과거 수주 이력',
              partNo: mp.item_name,
              revision: 'A',
              unitPrice: Number(mp.unit_price || 0),
              confirmedDate: mp.last_used_at?.slice(0, 7) || '수주 완료',
              isOrdered: (mp.approval_count || 0) > 0,
              matchReason: 'NAME_SIMILAR',
              specDesc: `${mp.material || ''} ${mp.specification || ''}`.trim() || '실제 수주 채택 단가'
            });
            if (recs.length >= 3) break;
          }
        }

        setRecommendations(recs);
      })
      .catch(() => {
        if (active) setRecommendations([]);
      })
      .finally(() => {
        if (active) setLoadingRecs(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLine?.id, selectedLine?.partName, selectedLine?.partNo]);

  // 단가 확정 토글
  const handleToggleConfirm = async (lineId: string) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;

    if (target.partType === 'UNCLASSIFIED' && !target.isAssembly) {
      alert('부품 유형이 [미분류]인 항목은 확정할 수 없습니다. 유형을 지정해 주세요.');
      return;
    }

    const nextStatus = target.status === 'CONFIRMED' ? 'NEEDS_REVIEW' : 'CONFIRMED';
    const isNowConfirmed = nextStatus === 'CONFIRMED';

    // 로컬 상태 즉각 반영
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, status: nextStatus } : l))
    );

    // API 호출 (백그라운드 동기화 및 DB 축적)
    try {
      await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: target.id,
          partKey: `PARTNER_A:${target.partNo}:B`,
          isConfirmed: isNowConfirmed,
          unitPrice: target.supplyPrice,
          unitCost: target.unitCost,
          qtyTier: target.quantity <= 9 ? '1~9' : target.quantity <= 99 ? '10~99' : '100~',
          lotQuantity: target.quantity
        })
      });
    } catch (e) {
      console.error('Confirm toggle error:', e);
    }
  };

  // 단가 수기 수정 및 DB 즉시 동기화
  const handleUpdateLinePrice = async (lineId: string, updates: Partial<QuoteReviewLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, ...updates } : l))
    );

    const target = lines.find((l) => l.id === lineId);
    if (!target) return;
    const nextTarget = { ...target, ...updates };

    try {
      await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: nextTarget.id,
          partKey: `PARTNER_A:${nextTarget.partNo}:B`,
          isConfirmed: nextTarget.status === 'CONFIRMED' || nextTarget.supplyPrice > 0,
          unitPrice: nextTarget.supplyPrice,
          unitCost: nextTarget.unitCost,
          qtyTier: nextTarget.quantity <= 9 ? '1~9' : nextTarget.quantity <= 99 ? '10~99' : '100~',
          lotQuantity: nextTarget.quantity
        })
      });
    } catch (e) {
      console.error('Update line price DB sync error:', e);
    }
  };

  // 선택 행 업데이트
  const handleUpdateSelected = (updated: Partial<QuoteReviewLine>) => {
    if (!selectedLine) return;
    handleUpdateLinePrice(selectedLine.id, updated);
  };

  // ⚡ 2순위: AI 공학 표준원가 일괄 산출 엔진 가동
  // [도면 바운딩박스 체적 × 재질 비중 × 소재 단가] + [부품 유형별 표준 가공비]
  const handleCalculateEngineeringCosts = async () => {
    setCalculatingEngineering(true);
    try {
      // 1. 최신 시스템 설정 (소재단가 / 임률) 불러오기
      let materialRates: Record<string, number> = {
        'SS400': 1800, 'S45C': 2200, 'AL6061': 6500, 'AL5052': 6200,
        'SUS304': 5500, 'SUS316': 7800, 'SKD11': 9500, 'SCS13': 7500,
        'GCD': 3800, 'FCD': 3900, 'FC250': 2200, 'FCD450': 2600, 'SCM440': 3200, 'BsBM': 12000
      };
      let hourlyMachineRate = 45000;
      let setupBaseCost = 30000;
      let sheetLaserRate = 1800;
      let sheetPiercingRate = 80;
      let sheetBendRate = 800;
      let castingRate = 2500;
      let treatmentMinLotCost = 30000;
      let packagingShippingRate = 0.03;
      let electricalOverhead = 0.08;
      let defaultMargin = 0.18;

      try {
        const settingsRes = await apiFetch('/api/admin/masters?type=settings');
        if (settingsRes.ok) {
          const sJson = await settingsRes.json();
          if (sJson.materialRates) materialRates = { ...materialRates, ...sJson.materialRates };
          if (sJson.processRates) {
            if (sJson.processRates.HOURLY_MACHINE_RATE) hourlyMachineRate = sJson.processRates.HOURLY_MACHINE_RATE;
            if (sJson.processRates.SETUP_BASE_COST) setupBaseCost = sJson.processRates.SETUP_BASE_COST;
            if (sJson.processRates.SHEET_LASER_PER_METER) sheetLaserRate = sJson.processRates.SHEET_LASER_PER_METER;
            if (sJson.processRates.SHEET_PIERCING_RATE) sheetPiercingRate = sJson.processRates.SHEET_PIERCING_RATE;
            if (sJson.processRates.SHEET_BEND_PER_STROKE) sheetBendRate = sJson.processRates.SHEET_BEND_PER_STROKE;
            if (sJson.processRates.CASTING_PER_KG_RATE) castingRate = sJson.processRates.CASTING_PER_KG_RATE;
            if (sJson.processRates.TREATMENT_MIN_LOT_COST) treatmentMinLotCost = sJson.processRates.TREATMENT_MIN_LOT_COST;
            if (sJson.processRates.PACKAGING_SHIPPING_RATE) packagingShippingRate = sJson.processRates.PACKAGING_SHIPPING_RATE;
            if (sJson.processRates.ELECTRICAL_OVERHEAD_RATE) electricalOverhead = sJson.processRates.ELECTRICAL_OVERHEAD_RATE;
            if (sJson.processRates.DEFAULT_MARGIN_RATE) defaultMargin = sJson.processRates.DEFAULT_MARGIN_RATE;
          }
        }
      } catch (e) {
        console.warn('Using default rates for engineering calculation:', e);
      }

      let updatedCount = 0;
      const updatedLines = await Promise.all(
        lines.map(async (line) => {
          // 조립도이거나 이미 0원이 아닌 확정 단가가 있는 경우 보존
          if (line.isAssembly) {
            return { ...line, status: 'CONFIRMED' as const };
          }
          if (line.status === 'CONFIRMED' && line.supplyPrice > 0) {
            return line;
          }

          // 2. 도면 바운딩박스 매칭
          const dwg = drawings.find((d: any) =>
            (d.drawing_no_raw && d.drawing_no_raw.trim().toLowerCase() === line.partNo.trim().toLowerCase()) ||
            (d.drawing_no_normalized && d.drawing_no_normalized.trim().toLowerCase() === line.partNo.trim().toLowerCase()) ||
            (d.drawing_name_raw && d.drawing_name_raw.trim().toLowerCase() === line.partName.trim().toLowerCase())
          );

          let width = 100;
          let height = 80;
          let thickness = 15;

          if (dwg && dwg.max_x && dwg.min_x && dwg.max_y && dwg.min_y) {
            width = Math.max(10, Math.min(2000, Math.round(Math.abs(dwg.max_x - dwg.min_x))));
            height = Math.max(10, Math.min(2000, Math.round(Math.abs(dwg.max_y - dwg.min_y))));
          }

          // 규격 텍스트에 치수 표기 파싱 (예: 120x80x15, PL-12T 등)
          const spec = line.specification || '';
          const dimMatch = spec.match(/(\d+)\s*[xX*]\s*(\d+)(\s*[xX*]\s*(\d+))?/);
          if (dimMatch) {
            width = parseInt(dimMatch[1], 10) || width;
            height = parseInt(dimMatch[2], 10) || height;
            if (dimMatch[4]) thickness = parseInt(dimMatch[4], 10) || thickness;
          }

          // 3. 재질 비중 산출 (g/cm³)
          const matUpper = (line.material || 'SS400').toUpperCase();
          const density = matUpper.includes('AL') ? 2.70 :
                          matUpper.includes('SUS') || matUpper.includes('SCS') ? 7.93 :
                          matUpper.includes('FC') || matUpper.includes('GCD') || matUpper.includes('CAST') ? 7.25 :
                          matUpper.includes('BS') || matUpper.includes('BRASS') || matUpper.includes('CU') ? 8.50 :
                          matUpper.includes('POM') || matUpper.includes('NYLON') ? 1.40 : 7.85;

          // 체적 (mm³ -> cm³) & 중량 (kg)
          const volumeCm3 = (width * height * thickness) / 1000;
          const rawWeightKg = Math.max(0.2, Number(((volumeCm3 * density) / 1000).toFixed(2)));

          // 소재 단가 (원/kg)
          const matKey = Object.keys(materialRates).find(k => matUpper.includes(k)) || 'SS400';
          const materialKgRate = materialRates[matKey] || 2200;

          // 4. 부품 유형별 공학 원가 산출 (cost-engine-v2)
          let calculated: CostCalculationResult;
          if (line.partType === 'CASTING') {
            calculated = calculateCastingCost({
              netWeightKg: rawWeightKg,
              materialKgRate,
              castingProcessRatePerKg: castingRate,
              marginRate: defaultMargin,
              quantity: line.quantity
            });
          } else if (line.partType === 'SHEET_METAL') {
            const areaM2 = (width * height) / 1000000;
            calculated = calculateSheetMetalCost({
              areaM2: Math.max(0.01, areaM2),
              thicknessMm: Math.min(20, thickness),
              materialKgRate,
              density,
              cuttingLengthMeter: Math.max(0.4, Number((((width + height) * 2) / 1000).toFixed(2))),
              laserRatePerMeter: sheetLaserRate,
              piercingRate: sheetPiercingRate,
              bendingCount: 2,
              bendRatePerStroke: sheetBendRate,
              treatmentMinLotCost,
              packagingShippingRate,
              marginRate: defaultMargin,
              quantity: line.quantity
            });
          } else if (line.partType === 'ELECTRICAL') {
            calculated = calculateElectricalCost({
              catalogUnitPrice: 185000,
              overheadRate: electricalOverhead,
              marginRate: 0.15,
              quantity: line.quantity
            });
          } else if (line.partType === 'COMMERCIAL') {
            calculated = calculateCommercialCost({
              catalogUnitPrice: 1200,
              quantity: line.quantity
            });
          } else {
            // MACHINING 기본
            const machiningHours = Math.max(0.4, Number((rawWeightKg * 0.12 + 0.35).toFixed(2)));
            calculated = calculateMachiningCost({
              rawWeightKg,
              materialKgRate,
              machiningHours,
              hourlyMachineRate,
              setupBaseCost,
              treatmentMinLotCost,
              packagingShippingRate,
              marginRate: defaultMargin,
              quantity: line.quantity
            });
          }

          updatedCount++;

          // 5. 백그라운드 DB 영구 동기화
          try {
            await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lineId: line.id,
                partKey: `ENGINEERING:${line.partNo}:STD`,
                isConfirmed: true,
                unitPrice: calculated.unitPrice,
                unitCost: calculated.subtotalCost,
                qtyTier: calculated.qtyTier,
                lotQuantity: line.quantity,
                basis: calculated.basis
              })
            });
          } catch (err) {
            console.warn('Sync line to DB warning:', err);
          }

          return {
            ...line,
            unitCost: calculated.subtotalCost,
            supplyPrice: calculated.unitPrice,
            status: 'CONFIRMED' as const,
            memo: `AI공학표준원가 (${rawWeightKg}kg)`
          };
        })
      );

      setLines(updatedLines);
      alert(`총 ${updatedCount}개 항목의 AI 공학 표준원가 산출 및 DB 주입이 완료되었습니다.`);
    } catch (e: any) {
      alert('AI 공학 표준원가 산출 중 오류가 발생했습니다: ' + (e.message || ''));
    } finally {
      setCalculatingEngineering(false);
    }
  };

  const quoteActiveLines = lines.filter((l) => !l.isAssembly && l.isIncluded !== false);
  const unconfirmedCount = quoteActiveLines.filter((l) => l.status !== 'CONFIRMED').length;
  const totalCost = quoteActiveLines.reduce((acc, l) => acc + (l.unitCost * l.quantity), 0);
  const totalSupply = quoteActiveLines.reduce((acc, l) => acc + (l.supplyPrice * l.quantity), 0);
  const avgMargin = totalSupply > 0 ? Math.round(((totalSupply - totalCost) / totalSupply) * 1000) / 10 : 0;

  const handleSubmitQuote = async () => {
    if (unconfirmedCount > 0) {
      alert(`미확정 항목이 ${unconfirmedCount}건 남아있습니다. 전 항목 단가를 확정한 후 결재 상신해주세요.`);
      return;
    }
    setSubmittingQuote(true);
    try {
      // 1. 견적서 생성 API 시도
      try {
        await apiFetch(`/api/quotation-cases/${caseId}/create-quote`, {
          method: 'POST'
        });
      } catch (err) {
        console.warn('create-quote attempt:', err);
      }

      // 2. 3단계 공식 견적서 및 결재/출력 화면으로 라우팅
      router.push(`/quotes/${caseId}/publish`);
    } catch (e: any) {
      alert('결재 상신 처리 중 오류가 발생했습니다: ' + (e.message || ''));
    } finally {
      setSubmittingQuote(false);
    }
  };

  // 단축키 이벤트 리스너 (F2, F4, Space, ↑/↓, Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, lines.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (selectedLine) handleToggleConfirm(selectedLine.id);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setIsBottomCollapsed((prev) => !prev);
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (recommendations.length > 0 && selectedLine) {
          handleUpdateSelected({ supplyPrice: recommendations[0].unitPrice });
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmitQuote();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lines, selectedIndex, selectedLine, recommendations, unconfirmedCount]);

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      {/* 🚀 CADON v2.0: 3단계 직관적 파이프라인 네비게이터 */}
      <PipelineNavigator
        caseId={caseId}
        currentStep={2}
        stats={{
          unconfirmedCount,
          marginWarning: avgMargin < 12.0
        }}
      />

      {/* 1. 상단 워크스페이스 헤더 */}
      <header className="bg-white border-b border-slate-200 px-5 py-2 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/cases/${caseId}`}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="1단계 도면·BOM 검증으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                2단계 : 3분할 통합 단가 검토
              </span>
              <span className="text-xs text-slate-400 font-mono">{caseInfo?.case_no || caseId}</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 mt-0.5">
              {caseInfo?.case_name || '견적 검토'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden md:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span>원가 합계: <strong className="font-mono text-slate-700">₩{totalCost.toLocaleString()}</strong></span>
            <span className="text-slate-300">|</span>
            <span>공급 합계: <strong className="font-mono text-blue-700 font-bold">₩{totalSupply.toLocaleString()}</strong></span>
            <span className="text-slate-300">|</span>
            <span>평균 마진: <strong className="font-mono text-emerald-700 font-bold">{avgMargin}%</strong></span>
          </div>

          {/* ⚡ 2순위 AI 공학 표준원가 일괄 산출 버튼 */}
          <button
            onClick={handleCalculateEngineeringCosts}
            disabled={calculatingEngineering}
            className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-xs border transition-all cursor-pointer ${
              calculatingEngineering
                ? 'bg-amber-100 text-amber-800 border-amber-300 cursor-wait'
                : 'bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-amber-600 shadow-sm'
            }`}
            title="DB에 없는 신규 품목에 대해 [바운딩박스 체적 × 재질 비중 × 소재 단가] + [표준 가공비] 공학 원가를 자동 산출하여 기본값으로 주입합니다."
          >
            {calculatingEngineering ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 fill-white" />
            )}
            <span>{calculatingEngineering ? '공학 표준원가 산출 중...' : '⚡ AI 공학 표준원가 일괄 산출'}</span>
          </button>

          {/* 마스터 기준정보 관리 이동 버튼 */}
          <Link
            href="/admin/masters"
            target="_blank"
            className="hidden lg:flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs transition-colors shadow-2xs"
            title="표준 품목, 기준단가 및 소재/가공 임률 설정 관리"
          >
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>마스터 기준정보</span>
          </Link>

          <button
            onClick={handleSubmitQuote}
            disabled={unconfirmedCount > 0 || submittingQuote}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors ${
              unconfirmedCount > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : submittingQuote
                ? 'bg-emerald-700 text-white cursor-wait opacity-80'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
            }`}
          >
            {submittingQuote ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submittingQuote
              ? '견적서 생성 및 이동 중...'
              : unconfirmedCount > 0
              ? `결재 상신 (${unconfirmedCount}행 미확정)`
              : '결재 상신'}
          </button>
        </div>
      </header>

      {/* 2. 상단 2열 (좌: 도면 뷰어 45%, 우: BOM 그리드 55%) */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* 좌측 45%: Three.js / WebGL CAD 도면 뷰어 */}
        <div className="w-[45%] h-full">
          <ReviewCadViewer
            caseId={caseId}
            cadObjects={cadObjects}
            drawings={drawings}
            relationships={relationships}
            bomAreas={bomAreas}
            rawBomItems={rawBomItems}
            allFiles={files}
            selectedBalloonNo={selectedLine?.balloonNo}
            selectedPartNo={selectedLine?.partNo}
          />
        </div>

        {/* 우측 55%: BOM & 단가 그리드 */}
        <div className="w-[55%] h-full">
          <QuoteLineGrid
            lines={lines}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onToggleConfirm={handleToggleConfirm}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        </div>
      </div>

      {/* 하단 패널 접기/펼치기 토글 바 */}
      <div className="bg-slate-200 border-t border-b border-slate-300 px-4 py-1 flex items-center justify-between text-xs text-slate-600 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[11px] text-slate-600">
            {isBottomCollapsed ? '하단 원가·마스터 패널이 접혀 있습니다 (F2로 펼치기)' : '원가 상세 분해 & 사내 마스터 TOP-3 추천 비교'}
          </span>
        </div>
        <button
          onClick={() => setIsBottomCollapsed(!isBottomCollapsed)}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-medium transition-colors shadow-2xs cursor-pointer"
        >
          {isBottomCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
              <span>원가·마스터 패널 펼치기 (F2)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              <span>패널 접기 (F2)</span>
            </>
          )}
        </button>
      </div>

      {/* 3. 하단 패널 (원가 상세 내역 50% + MASTER Top-3 추천 카드 50%) */}
      {!isBottomCollapsed && (
        <div className="h-[264px] bg-slate-100 px-3 pb-3 pt-1.5 flex gap-3 shrink-0">
          <div className="w-1/2 h-full">
            <CostBreakdownPanel
              line={selectedLine}
              caseId={caseId}
              onUpdateLine={handleUpdateSelected}
              onConfirmLine={handleToggleConfirm}
            />
          </div>
          <div className="w-1/2 h-full">
            <MasterRecommendationCard
              recommendations={recommendations}
              onApplyPrice={(prc) => handleUpdateSelected({ supplyPrice: prc })}
            />
          </div>
        </div>
      )}

      {/* 4. 최하단 단축키 가이드 바 (가독성 향상) */}
      <footer className="bg-slate-900 border-t border-slate-700 text-slate-100 text-xs px-6 py-2 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-6 font-medium">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">Space</kbd>
            <span className="text-slate-200">확정 / 취소</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">F2</kbd>
            <span className="text-slate-200">하단패널 접기/펼치기</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">F4</kbd>
            <span className="text-slate-200">추천단가 즉시채택</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">↑ / ↓</kbd>
            <span className="text-slate-200">행 간 이동</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">Ctrl + Enter</kbd>
            <span className="text-slate-200">결재 상신</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400 font-semibold text-[11px]">CADON v2.0 Workspace Ready</span>
        </div>
      </footer>
    </div>
  );
}
