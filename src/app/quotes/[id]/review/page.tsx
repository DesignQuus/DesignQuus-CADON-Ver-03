'use client';

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, CheckCircle2, RefreshCw, FileText, AlertTriangle, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles, Layers, Zap, Database, HelpCircle
} from 'lucide-react';
import QuoteLineGrid, { QuoteReviewLine, InclusionType } from '@/components/review/QuoteLineGrid';
import SmartBatchActionBar from '@/components/review/SmartBatchActionBar';
import CostBreakdownPanel from '@/components/review/CostBreakdownPanel';
import { isCadNoiseItem, addCustomNoiseKeyword } from '@/lib/cad-noise-detector';
import MasterRecommendationCard, { RecommendationItem } from '@/components/review/MasterRecommendationCard';
import MasterPriceReferenceDrawer from '@/components/review/MasterPriceReferenceDrawer';
import ReviewCadViewer from '@/components/review/ReviewCadViewer';
import PilotWelcomeModal from '@/components/review/PilotWelcomeModal';
import PipelineNavigator from '@/components/common/PipelineNavigator';
import { parseRemark, stringifyRemark } from '@/lib/remark-cost-helper';
import {
  calculateCastingCost,
  calculateMachiningCost,
  calculateSheetMetalCost,
  calculateElectricalCost,
  calculateCommercialCost,
  CostCalculationResult,
  PartType
} from '@/lib/cost-engine-v2';

// 📊 4대 항목 가중 평균(Weighted Average) 유사도 산출 헬퍼
// 품명/도번 40% + 재질 30% + 치수 20% + 공정 10%
function computeMasterSimilarity(
  partNoStr: string,
  partNameStr: string,
  materialStr: string,
  specStr: string,
  partTypeStr: string,
  pm: any
) {
  const cleanLineName = (partNameStr || '').trim().toUpperCase();
  const cleanLineNo = (partNoStr || '').trim().toUpperCase();
  const cleanMasterName = (pm.standard_name || '').trim().toUpperCase();
  const cleanMasterCode = (pm.master_code || '').trim().toUpperCase();

  // 1. 품명/도번 일치율 (가중치 40%)
  let nameScore = 50;
  if (cleanMasterName === cleanLineName || cleanMasterCode === cleanLineNo) {
    nameScore = 100;
  } else if (cleanMasterName === cleanLineNo || cleanMasterCode === cleanLineName) {
    nameScore = 95;
  } else if (cleanMasterName.replace(/\s+/g, '') === cleanLineName.replace(/\s+/g, '')) {
    nameScore = 98;
  } else if (cleanLineName.includes(cleanMasterName) || cleanMasterName.includes(cleanLineName)) {
    nameScore = 85;
  }

  // 2. 재질 일치율 (가중치 30%)
  const lineMat = (materialStr || '').trim().toUpperCase().replace(/\s+/g, '');
  const masterMat = (pm.material || '').trim().toUpperCase().replace(/\s+/g, '');
  let matScore = 70;
  if (!lineMat || !masterMat) {
    matScore = 80;
  } else if (lineMat === masterMat) {
    matScore = 100;
  } else if (
    (lineMat.includes('SS41') && masterMat.includes('SS400')) ||
    (lineMat.includes('SS400') && masterMat.includes('SS41')) ||
    (lineMat.includes('S45C') && masterMat.includes('SM45C'))
  ) {
    matScore = 95;
  } else if (lineMat.includes(masterMat) || masterMat.includes(lineMat)) {
    matScore = 85;
  } else {
    matScore = 30;
  }

  // 3. 치수/규격 일치율 (가중치 20%)
  const lineSpec = (specStr || '').trim().toUpperCase().replace(/\s+/g, '');
  const masterSpec = (pm.specification || '').trim().toUpperCase().replace(/\s+/g, '');
  let specScore = 75;
  if (!lineSpec || lineSpec === '-' || !masterSpec || masterSpec === '-') {
    specScore = 85;
  } else if (lineSpec === masterSpec) {
    specScore = 100;
  } else {
    const lineNums = lineSpec.match(/\d+(\.\d+)?/g) || [];
    const masterNums = masterSpec.match(/\d+(\.\d+)?/g) || [];
    if (lineNums.length > 0 && masterNums.length > 0) {
      const matchCount = lineNums.filter(n => masterNums.includes(n)).length;
      specScore = Math.max(40, Math.round((matchCount / Math.max(lineNums.length, masterNums.length)) * 100));
    }
  }

  // 4. 공정 일치율 (가중치 10%)
  const lineCat = partTypeStr || 'MACHINING';
  const masterCat = pm.category || 'MACHINING';
  let procScore = (lineCat === masterCat) ? 100 : 60;

  // 가중 평균 최종 일치도 (40% + 30% + 20% + 10%)
  const totalScore = Math.round(
    nameScore * 0.40 +
    matScore * 0.30 +
    specScore * 0.20 +
    procScore * 0.10
  );

  return {
    totalScore,
    nameMatchPct: nameScore,
    materialMatchPct: matScore,
    specMatchPct: specScore,
    processMatchPct: procScore,
    matchedMasterName: pm.standard_name,
    matchedMasterCode: pm.master_code,
    matchedUnitPrice: Number(pm.unit_price) || 0
  };
}

export default function QuoteReviewWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: caseId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [caseInfo, setCaseInfo] = useState<any>(null);
  const [lines, setLines] = useState<QuoteReviewLine[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);
  const [isMasterDrawerOpen, setIsMasterDrawerOpen] = useState<boolean>(false);
  const [isPilotModalOpen, setIsPilotModalOpen] = useState<boolean>(false);

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
        // 케이스 데이터와 사내 마스터 확정 단가표를 병렬 조회
        const [res, mastersRes] = await Promise.all([
          apiFetch(`/api/quotation-cases/${caseId}`),
          apiFetch('/api/admin/masters?type=products&onlyPriced=true')
        ]);

        let pricedMasters: any[] = [];
        if (mastersRes.ok) {
          try {
            const mastersJson = await mastersRes.json();
            pricedMasters = mastersJson.items || [];
          } catch (e) {}
        }



        // 🔍 마스터 단가 대조 헬퍼 (품명 또는 도번 일치 및 공백 제거 일치 지원)
        const matchMasterPrice = (partNoStr: string, partNameStr: string) => {
          const pNo = (partNoStr || '').trim().toUpperCase();
          const pName = (partNameStr || '').trim().toUpperCase();
          const pNoCompact = pNo.replace(/\s+/g, '');
          const pNameCompact = pName.replace(/\s+/g, '');

          return pricedMasters.find((pm: any) => {
            const pmCode = (pm.master_code || '').trim().toUpperCase();
            const pmName = (pm.standard_name || '').trim().toUpperCase();
            const pmCodeCompact = pmCode.replace(/\s+/g, '');
            const pmNameCompact = pmName.replace(/\s+/g, '');

            if (!pm.unit_price || Number(pm.unit_price) <= 0) return false;

            return (
              (pmCode && (pmCode === pNo || pmCode === pName || pmCodeCompact === pNoCompact || pmCodeCompact === pNameCompact)) ||
              (pmName && (pmName === pName || pmName === pNo || pmNameCompact === pNameCompact || pmNameCompact === pNoCompact))
            );
          });
        };

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
            const autoSyncItems: Array<{ id: string; partNo: string; price: number; cost: number; qty: number }> = [];

            setLines(
              json.quoteItems.map((qi: any, idx: number) => {
                const specLower = (qi.specification || '').toLowerCase();
                const matLower = (qi.material || '').toLowerCase();
                const nameLower = (qi.item_name || '').toLowerCase();
                const isAssembly = qi.drawing_type === 'MAIN_ASSEMBLY' || qi.drawing_type === 'SUB_ASSEMBLY' ||
                                   nameLower.includes('조립') || nameLower.includes('assembly') || nameLower.includes('line');

                const rawDwgNo = (qi.drawing_no || qi.master_code || '').trim();
                const isDwgNoReal = rawDwgNo && !rawDwgNo.startsWith('BOM-') && rawDwgNo !== '-';
                const resolvedPartNo = isDwgNoReal
                  ? rawDwgNo
                  : (qi.specification && !qi.specification.endsWith('T') && !qi.specification.startsWith('Ø') && qi.specification !== '-')
                  ? qi.specification
                  : rawDwgNo || `PART-${idx + 1}`;

                const resolvedSpec = (qi.specification && qi.specification !== resolvedPartNo && qi.specification !== '-')
                  ? qi.specification
                  : '';

                const pNoLower = resolvedPartNo.toLowerCase();
                const isCommercialPurchased =
                  nameLower.includes('misumi') || nameLower.includes('미스미') ||
                  nameLower.includes('itoh') || nameLower.includes('이토') ||
                  nameLower.includes('smc') || nameLower.includes('cdq2') || nameLower.includes('cq2') ||
                  nameLower.includes('festo') || nameLower.includes('ckd') || nameLower.includes('thk') ||
                  nameLower.includes('nsk') || nameLower.includes('iko') || nameLower.includes('bearing') ||
                  nameLower.includes('베어링') || nameLower.includes('스프링') || nameLower.includes('spring') ||
                  specLower.includes('cdq2') || specLower.includes('misumi') || pNoLower.includes('cdq2');

                // 🛡️ 모터/센서/실린더 키워드가 있더라도, 취부/가공용 부품(플랜지, 브라켓, 베이스, 바디, 플레이트 등)은 가공품(MACHINING)으로 분류
                const isMachiningFixture = /flange|bracket|base|plate|mount|block|dog|cover|body|spacer|stay|fixture|플랜지|브라켓|베이스|플레이트|블록|마운트|커버|바디/i.test(nameLower);

                const isElectricalPurchased =
                  !isMachiningFixture &&
                  (nameLower.includes('모터') || nameLower.includes('센서') || nameLower.includes('실린더') ||
                   nameLower.includes('motor') || nameLower.includes('sensor') || nameLower.includes('cylinder') ||
                   nameLower.includes('valve') || nameLower.includes('plc') || nameLower.includes('servo') ||
                   nameLower.includes('f3s') || nameLower.includes('sol'));

                // 6대 실무 부품 유형 자동 분류
                let partType: PartType = 'MACHINING';
                if (isAssembly) {
                  partType = 'ASSEMBLY';
                } else if (isElectricalPurchased) {
                  partType = 'ELECTRICAL';
                } else if (isCommercialPurchased) {
                  partType = 'COMMERCIAL';
                } else if (
                  nameLower.includes('판금') || nameLower.includes('커버') || nameLower.includes('브라켓') ||
                  nameLower.includes('cover') || nameLower.includes('bracket') || nameLower.includes('duct') ||
                  specLower.includes('sheet') || (specLower.includes('t') && (nameLower.includes('plate') || nameLower.includes('frame')))
                ) {
                  partType = 'SHEET_METAL';
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

                let cleanMaterial = qi.material || 'SS400';
                if (/tap|thru|hole|공차|±|c0\.|r[0-9]/i.test(cleanMaterial)) {
                  cleanMaterial = (partType === 'COMMERCIAL' || partType === 'ELECTRICAL') ? '-' : 'SS400';
                }

                let supplyPrice = Number(qi.unit_price) || 0;
                let unitCost = Math.round(supplyPrice * 0.82);
                let priceSource = qi.price_source;
                let priceStatus = qi.price_status;
                let isMatchedFromMaster = false;
                let similarityBreakdown = undefined;

                // 💡 마스터 단가 대조 및 유사도 산출
                if (!isAssembly) {
                  const matched = matchMasterPrice(qi.drawing_no || qi.master_code, qi.item_name);
                  if (matched && Number(matched.unit_price) > 0) {
                    similarityBreakdown = computeMasterSimilarity(
                      qi.drawing_no || qi.master_code,
                      qi.item_name,
                      qi.material,
                      qi.specification,
                      partType,
                      matched
                    );

                    // 단가가 0원이면 마스터 단가로 자동 채우기 및 동기화
                    if (supplyPrice === 0) {
                      supplyPrice = Number(matched.unit_price);
                      unitCost = Math.round(supplyPrice * 0.82);
                      priceSource = 'MASTER_MATCH';
                      priceStatus = 'READY';
                      isMatchedFromMaster = true;
                      autoSyncItems.push({
                        id: qi.id,
                        partNo: qi.drawing_no || qi.master_code || `PART-${idx + 1}`,
                        price: supplyPrice,
                        cost: unitCost,
                        qty: Number(qi.quantity) || 1
                      });
                    }
                  }
                }

                const noiseCheck = isCadNoiseItem({
                  partNo: qi.drawing_no || qi.master_code,
                  partName: qi.item_name,
                  material: qi.material,
                  specification: qi.specification
                });

                const hasPrice = supplyPrice > 0;
                let inclusionType: InclusionType = 'INCLUDED';
                if (isAssembly) {
                  inclusionType = 'EXCLUDED';
                } else if (qi.remark?.includes('[ANNOTATION_NOISE]') || noiseCheck.isNoise) {
                  // 🧹 도면 표제란/주석 노이즈(이경중, A3, 10U+00B0, 2 SET 등) 사전 자동 격리!
                  inclusionType = 'ANNOTATION_NOISE';
                } else if (qi.remark?.includes('[CUSTOMER_SUPPLIED]')) {
                  inclusionType = 'CUSTOMER_SUPPLIED';
                } else if (qi.remark?.includes('[FASTENER_EXCLUDED]')) {
                  inclusionType = 'FASTENER_EXCLUDED';
                } else if (qi.is_included === 0 || qi.remark?.includes('[EXCLUDED]')) {
                  inclusionType = 'EXCLUDED';
                } else if (partType === 'COMMERCIAL' && supplyPrice === 0) {
                  // 표준 체결구(볼트/너트/와셔)이고 단가 미확보 품목은 지능형 체결구 제외 기본 부여
                  inclusionType = 'FASTENER_EXCLUDED';
                }

                const isIncluded = !isAssembly && inclusionType === 'INCLUDED';
                const isConfirmed = isAssembly || inclusionType !== 'INCLUDED' || (hasPrice && isIncluded);
                const structured = parseRemark(qi.remark);

                return {
                  id: qi.id,
                  itemNo: qi.item_no || idx + 1,
                  partNo: resolvedPartNo,
                  partName: qi.item_name || 'BOM 부품',
                  partType: partType,
                  material: cleanMaterial,
                  quantity: Number(qi.quantity) || 1,
                  unitCost: isAssembly || inclusionType !== 'INCLUDED' ? 0 : unitCost,
                  supplyPrice: isAssembly || inclusionType !== 'INCLUDED' ? 0 : supplyPrice,
                  status: isAssembly || inclusionType !== 'INCLUDED' ? 'CONFIRMED' : (isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW'),
                  balloonNo: String(qi.item_no || idx + 1),
                  memo: structured.text,
                  specification: resolvedSpec,
                  isAssembly,
                  isIncluded,
                  inclusionType,
                  excludeReason: isAssembly
                    ? '조립도 (가공품 제외)'
                    : inclusionType === 'ANNOTATION_NOISE'
                    ? (noiseCheck.reason || '도면 주석/표제란 노이즈 격리')
                    : inclusionType === 'FASTENER_EXCLUDED'
                    ? '표준 체결구 제외'
                    : (inclusionType as string) === 'CUSTOMER_SUPPLIED'
                    ? '고객 사급품'
                    : (isIncluded ? undefined : '견적 제외'),
                  extraCost1Name: structured.extraCosts[0]?.name,
                  extraCost1Amount: structured.extraCosts[0]?.amount,
                  extraCost2Name: structured.extraCosts[1]?.name,
                  extraCost2Amount: structured.extraCosts[1]?.amount,
                  extraCost3Name: structured.extraCosts[2]?.name,
                  extraCost3Amount: structured.extraCosts[2]?.amount,
                  priceSource: priceSource,
                  priceStatus: priceStatus,
                  similarityBreakdown: similarityBreakdown
                };
              })
            );

            // 마스터 단가 자동 매칭된 품목들은 백엔드 DB에도 즉시 영구 저장(동기화)
            if (autoSyncItems.length > 0) {
              autoSyncItems.forEach((item) => {
                apiFetch(`/api/quotes/${caseId}/confirm-line`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    lineId: item.id,
                    partKey: `PARTNER_A:${item.partNo}:B`,
                    isConfirmed: true,
                    unitPrice: item.price,
                    unitCost: item.cost,
                    qtyTier: item.qty <= 9 ? '1~9' : item.qty <= 99 ? '10~99' : '100~',
                    lotQuantity: item.qty,
                    remark: '[MASTER_MATCH] 사내 마스터 단가 자동 매칭 및 확정'
                  })
                }).catch((err) => console.warn('Auto sync master line error:', err));
              });
            }
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

                const rawDwgNo = (it.drawing_no || '').trim();
                const isDwgNoReal = rawDwgNo && !rawDwgNo.startsWith('BOM-') && rawDwgNo !== '-';
                const resolvedPartNo = isDwgNoReal
                  ? rawDwgNo
                  : (it.spec_candidate && !it.spec_candidate.endsWith('T') && !it.spec_candidate.startsWith('Ø') && it.spec_candidate !== '-')
                  ? it.spec_candidate
                  : rawDwgNo || `DWG-${idx + 1}`;

                const resolvedSpec = (it.specification && it.specification !== resolvedPartNo && it.specification !== '-')
                  ? it.specification
                  : (it.spec_candidate && it.spec_candidate !== resolvedPartNo && it.spec_candidate !== '-')
                  ? it.spec_candidate
                  : '';

                const pNoLower = (it.drawing_no || '').toLowerCase();
                const isCommercialPurchased =
                  nameLower.includes('misumi') || nameLower.includes('미스미') ||
                  nameLower.includes('itoh') || nameLower.includes('이토') ||
                  nameLower.includes('smc') || nameLower.includes('cdq2') || nameLower.includes('cq2') ||
                  nameLower.includes('festo') || nameLower.includes('ckd') || nameLower.includes('thk') ||
                  nameLower.includes('nsk') || nameLower.includes('iko') || nameLower.includes('bearing') ||
                  nameLower.includes('베어링') || nameLower.includes('스프링') || nameLower.includes('spring') ||
                  specLower.includes('cdq2') || specLower.includes('misumi') || pNoLower.includes('cdq2');

                // 🛡️ 모터/센서/실린더 키워드가 있더라도, 취부/가공용 부품(플랜지, 브라켓, 베이스, 바디, 플레이트 등)은 가공품(MACHINING)으로 분류
                const isMachiningFixture = /flange|bracket|base|plate|mount|block|dog|cover|body|spacer|stay|fixture|플랜지|브라켓|베이스|플레이트|블록|마운트|커버|바디/i.test(nameLower);

                const isElectricalPurchased =
                  !isMachiningFixture &&
                  (nameLower.includes('모터') || nameLower.includes('센서') || nameLower.includes('실린더') ||
                   nameLower.includes('motor') || nameLower.includes('sensor') || nameLower.includes('cylinder') ||
                   nameLower.includes('valve') || nameLower.includes('plc') || nameLower.includes('servo') ||
                   nameLower.includes('f3s') || nameLower.includes('sol'));

                // 6대 실무 부품 유형 자동 분류
                let partType: PartType = 'MACHINING';
                if (isAssembly) {
                  partType = 'ASSEMBLY';
                } else if (isElectricalPurchased) {
                  partType = 'ELECTRICAL';
                } else if (isCommercialPurchased) {
                  partType = 'COMMERCIAL';
                } else if (
                  nameLower.includes('판금') || nameLower.includes('커버') || nameLower.includes('브라켓') ||
                  nameLower.includes('cover') || nameLower.includes('bracket') || nameLower.includes('duct') ||
                  specLower.includes('sheet') || (specLower.includes('t') && (nameLower.includes('plate') || nameLower.includes('frame')))
                ) {
                  partType = 'SHEET_METAL';
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

                let cleanMaterial = it.material_candidate || it.drawing_material || 'SS400';
                if (/tap|thru|hole|공차|±|c0\.|r[0-9]/i.test(cleanMaterial)) {
                  cleanMaterial = (partType === 'COMMERCIAL' || partType === 'ELECTRICAL') ? '-' : 'SS400';
                }

                let unitCost = 0;
                let supplyPrice = 0;
                let priceSource: string | undefined = undefined;
                let masterPrice: number | undefined = undefined;

                // 💡 마스터 단가 자동 매칭 시도
                if (!isAssembly) {
                  const matched = matchMasterPrice(resolvedPartNo || it.spec_candidate, it.normalized_name || it.raw_name);
                  if (matched && Number(matched.unit_price) > 0) {
                    supplyPrice = Number(matched.unit_price);
                    unitCost = Math.round(supplyPrice * 0.82);
                    priceSource = 'MASTER_MATCH';
                    masterPrice = supplyPrice;
                  }
                }

                const noiseCheck = isCadNoiseItem({
                  partNo: resolvedPartNo,
                  partName: it.normalized_name || it.raw_name,
                  material: cleanMaterial,
                  specification: resolvedSpec
                });

                let inclusionType: InclusionType = 'INCLUDED';
                if (isAssembly) {
                  inclusionType = 'EXCLUDED';
                } else if (noiseCheck.isNoise) {
                  inclusionType = 'ANNOTATION_NOISE';
                } else if (it.is_quote_included === 0) {
                  inclusionType = 'EXCLUDED';
                } else if (partType === 'COMMERCIAL' && supplyPrice === 0) {
                  inclusionType = 'FASTENER_EXCLUDED';
                }

                const isIncluded = !isAssembly && inclusionType === 'INCLUDED';

                return {
                  id: it.id,
                  itemNo: idx + 1,
                  partNo: resolvedPartNo,
                  partName: it.normalized_name || it.raw_name || 'BOM 부품',
                  partType: partType,
                  material: cleanMaterial,
                  quantity: Number(it.quantity) || 1,
                  unitCost: isAssembly || inclusionType !== 'INCLUDED' ? 0 : unitCost,
                  supplyPrice: isAssembly || inclusionType !== 'INCLUDED' ? 0 : supplyPrice,
                  status: isAssembly || inclusionType !== 'INCLUDED' || supplyPrice > 0 ? 'CONFIRMED' : 'NEEDS_REVIEW',
                  balloonNo: String(idx + 1),
                  specification: resolvedSpec,
                  isAssembly,
                  isIncluded,
                  inclusionType,
                  excludeReason: isAssembly
                    ? '조립도 (가공품 제외)'
                    : inclusionType === 'ANNOTATION_NOISE'
                    ? (noiseCheck.reason || '도면 주석/표제란 노이즈 격리')
                    : inclusionType === 'FASTENER_EXCLUDED'
                    ? '표준 체결구 제외'
                    : (inclusionType as string) === 'CUSTOMER_SUPPLIED'
                    ? '고객 사급품'
                    : (isIncluded ? undefined : '견적 제외'),
                  priceSource,
                  masterPrice
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

                // 하드코딩 Fallback 단가 전면 제거: 단가 미확보 품목은 0원 처리
                const unitCost = 0;
                const supplyPrice = 0;

                const noiseCheck = isCadNoiseItem({
                  partNo: d.drawing_no_raw || d.drawing_no_normalized,
                  partName: d.drawing_name_raw || d.drawing_name_normalized,
                  material: d.material,
                  specification: d.scale
                });

                let inclusionType: InclusionType = 'INCLUDED';
                if (isAssembly) {
                  inclusionType = 'EXCLUDED';
                } else if (noiseCheck.isNoise) {
                  inclusionType = 'ANNOTATION_NOISE';
                } else if (d.is_quote_included === 0) {
                  inclusionType = 'EXCLUDED';
                } else if (partType === 'COMMERCIAL') {
                  inclusionType = 'FASTENER_EXCLUDED';
                }

                const isIncluded = !isAssembly && inclusionType === 'INCLUDED';

                return {
                  id: d.id || `dwg_${idx + 1}`,
                  itemNo: idx + 1,
                  partNo: d.drawing_no_raw || d.drawing_no_normalized || `DWG-${idx + 1}`,
                  partName: d.drawing_name_raw || d.drawing_name_normalized || '부품 도면',
                  partType: partType,
                  material: d.material || 'SS400',
                  quantity: 1,
                  unitCost: isAssembly || inclusionType !== 'INCLUDED' ? 0 : unitCost,
                  supplyPrice: isAssembly || inclusionType !== 'INCLUDED' ? 0 : supplyPrice,
                  engineSuggestedPrice: undefined,
                  status: isAssembly || inclusionType !== 'INCLUDED' ? ('CONFIRMED' as const) : ('NEEDS_REVIEW' as const),
                  balloonNo: String(idx + 1),
                  specification: d.scale || '',
                  isAssembly,
                  isIncluded,
                  inclusionType,
                  excludeReason: isAssembly
                    ? '조립도 (가공품 제외)'
                    : inclusionType === 'ANNOTATION_NOISE'
                    ? (noiseCheck.reason || '도면 주석/표제란 노이즈 격리')
                    : inclusionType === 'FASTENER_EXCLUDED'
                    ? '표준 체결구 제외'
                    : (inclusionType as string) === 'CUSTOMER_SUPPLIED'
                    ? '고객 사급품'
                    : (isIncluded ? undefined : '견적 제외')
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

    // 조치 1: 조립도 배제(0원)는 의도된 정상이지만, 견적 대상 품목 중 공급단가 0원은 확정 차단
    if (!target.isAssembly && target.isIncluded !== false && (target.supplyPrice <= 0 || target.unitCost <= 0)) {
      alert('공급단가가 0원인 품목은 확정할 수 없습니다. 단가를 입력하거나 견적에서 제외해 주세요.');
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
      const engPrice = target.engineSuggestedPrice;
      const costDiff = engPrice && engPrice > 0 && target.supplyPrice > 0 ? {
        engineSuggestedPrice: engPrice,
        confirmedPrice: target.supplyPrice,
        delta: target.supplyPrice - engPrice,
        deltaPercent: Number((((target.supplyPrice - engPrice) / engPrice) * 100).toFixed(1)),
        recordedAt: new Date().toISOString()
      } : undefined;

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
          lotQuantity: target.quantity,
          engineSuggestedPrice: engPrice,
          costDiff
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

    const extraCosts = [];
    if (nextTarget.extraCost1Amount) extraCosts.push({ name: nextTarget.extraCost1Name || '추가비1', amount: nextTarget.extraCost1Amount });
    if (nextTarget.extraCost2Amount) extraCosts.push({ name: nextTarget.extraCost2Name || '추가비2', amount: nextTarget.extraCost2Amount });
    if (nextTarget.extraCost3Amount) extraCosts.push({ name: nextTarget.extraCost3Name || '추가비3', amount: nextTarget.extraCost3Amount });

    const engPrice = nextTarget.engineSuggestedPrice || target.engineSuggestedPrice;
    let costDiff;
    if (engPrice && engPrice > 0 && nextTarget.supplyPrice > 0) {
      costDiff = {
        engineSuggestedPrice: engPrice,
        confirmedPrice: nextTarget.supplyPrice,
        delta: nextTarget.supplyPrice - engPrice,
        deltaPercent: Number((((nextTarget.supplyPrice - engPrice) / engPrice) * 100).toFixed(1)),
        recordedAt: new Date().toISOString()
      };
    }
    const serializedRemark = stringifyRemark(nextTarget.memo, extraCosts, costDiff);

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
          lotQuantity: nextTarget.quantity,
          remark: serializedRemark,
          engineSuggestedPrice: engPrice,
          costDiff
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

  // 🎯 다중 선택 체크 토글
  const handleToggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 🎯 필터링된 전체 선택/해제
  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      const targetIds = lines
        .filter((l) => {
          const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
          if (filterType === 'ALL') return !l.isAssembly && inc !== 'EXCLUDED' && inc !== 'FASTENER_EXCLUDED';
          if (filterType === 'NEEDS_REVIEW') return !l.isAssembly && inc === 'INCLUDED' && l.status === 'NEEDS_REVIEW';
          if (filterType === 'UNCONFIRMED') return !l.isAssembly && inc === 'INCLUDED' && l.status !== 'CONFIRMED';
          if (filterType === 'SUPPLIED') return inc === 'CUSTOMER_SUPPLIED';
          if (filterType === 'EXCLUDED') return l.isAssembly || inc === 'EXCLUDED' || inc === 'FASTENER_EXCLUDED';
          return true;
        })
        .map((l) => l.id);
      setSelectedIds(targetIds);
    } else {
      setSelectedIds([]);
    }
  };

  // 🏷️ 단일 행 inclusionType 업데이트
  const handleUpdateLineInclusion = async (lineId: string, inclusionType: InclusionType) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;

    // 🛡️ 조립도는 노이즈가 아니므로 조립제외로 보호
    if (inclusionType === 'ANNOTATION_NOISE') {
      if (target.isAssembly) {
        alert('조립도(Assembly)는 도면 노이즈가 아니므로 [조립제외]로 관리됩니다.');
        return;
      }
      const check = isCadNoiseItem({
        partNo: target.partNo,
        partName: target.partName,
        material: target.material,
        specification: target.specification
      });
      if (!check.isNoise) {
        const ok = confirm(`'${target.partName}'은(는) 정상 가공 부품으로 분석됩니다.\n정말 도면 노이즈로 격리실에 보내시겠습니까?`);
        if (!ok) return;
      }
    }

    const isExcluded = inclusionType === 'EXCLUDED' || inclusionType === 'FASTENER_EXCLUDED' || inclusionType === 'ANNOTATION_NOISE';
    const isSupplied = inclusionType === 'CUSTOMER_SUPPLIED';
    const isNowConfirmed = inclusionType !== 'INCLUDED';

    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          inclusionType,
          isIncluded: !isExcluded,
          status: isNowConfirmed ? 'CONFIRMED' : (l.supplyPrice > 0 ? 'CONFIRMED' : 'NEEDS_REVIEW'),
          unitCost: isExcluded || isSupplied ? 0 : l.unitCost,
          supplyPrice: isExcluded || isSupplied ? 0 : l.supplyPrice,
          excludeReason: inclusionType === 'ANNOTATION_NOISE'
            ? '도면 주석/표제란 노이즈 격리'
            : inclusionType === 'FASTENER_EXCLUDED'
            ? '표준 체결구 제외'
            : isSupplied
            ? '고객 사급품'
            : isExcluded
            ? '견적 제외'
            : undefined
        };
      })
    );

    try {
      const tag = inclusionType === 'ANNOTATION_NOISE' ? '[ANNOTATION_NOISE]' :
                  inclusionType === 'FASTENER_EXCLUDED' ? '[FASTENER_EXCLUDED]' :
                  inclusionType === 'CUSTOMER_SUPPLIED' ? '[CUSTOMER_SUPPLIED]' :
                  inclusionType === 'EXCLUDED' ? '[EXCLUDED]' : '[INCLUDED]';
      await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId,
          isConfirmed: isNowConfirmed,
          unitPrice: isExcluded || isSupplied ? 0 : undefined,
          unitCost: isExcluded || isSupplied ? 0 : undefined,
          remark: tag
        })
      });
    } catch (e) {
      console.warn('Sync inclusion update error:', e);
    }
  };

  // 🚀 다중 행 inclusionType 일괄 업데이트
  const handleBatchUpdateInclusion = async (lineIds: string[], inclusionType: InclusionType) => {
    // 🛡️ [세이프가드] 노이즈 격리 선택 시, 실제 도면 노이즈만 선별하고 정상 가공품 및 조립도는 안전하게 보호
    let effectiveLineIds = lineIds;
    if (inclusionType === 'ANNOTATION_NOISE') {
      const genuineNoiseIds: string[] = [];
      let protectedCount = 0;

      lineIds.forEach((id) => {
        const line = lines.find((l) => l.id === id);
        if (!line) return;
        if (line.isAssembly) {
          protectedCount++;
          return;
        }
        const check = isCadNoiseItem({
          partNo: line.partNo,
          partName: line.partName,
          material: line.material,
          specification: line.specification
        });
        if (check.isNoise) {
          genuineNoiseIds.push(id);
        } else {
          protectedCount++;
        }
      });

      if (genuineNoiseIds.length === 0) {
        alert(`선택된 ${lineIds.length}개 항목 중 도면 주석/텍스트 노이즈로 판정된 항목이 없습니다.\n정상 가공 부품 및 조립도는 안전하게 보호되었습니다.\n(가공에서 배제하려면 [견적 제외] 또는 [사급품 지정]을 이용해 주세요.)`);
        setSelectedIds([]);
        return;
      }

      if (protectedCount > 0) {
        alert(`선택된 ${lineIds.length}개 중 실제 도면 노이즈 ${genuineNoiseIds.length}건만 격리실로 이동되었습니다.\n(정상 가공 부품 및 조립도 ${protectedCount}건은 안전하게 보호되었습니다.)`);
      }
      effectiveLineIds = genuineNoiseIds;
    }

    const isExcluded = inclusionType === 'EXCLUDED' || inclusionType === 'FASTENER_EXCLUDED' || inclusionType === 'ANNOTATION_NOISE';
    const isSupplied = inclusionType === 'CUSTOMER_SUPPLIED';

    setLines((prev) =>
      prev.map((l) => {
        if (!effectiveLineIds.includes(l.id)) return l;
        return {
          ...l,
          inclusionType,
          isIncluded: !isExcluded,
          status: 'CONFIRMED' as const,
          unitCost: isExcluded || isSupplied ? 0 : l.unitCost,
          supplyPrice: isExcluded || isSupplied ? 0 : l.supplyPrice,
          excludeReason: inclusionType === 'ANNOTATION_NOISE'
            ? '도면 주석/표제란 노이즈 격리'
            : inclusionType === 'FASTENER_EXCLUDED'
            ? '표준 체결구 제외'
            : isSupplied
            ? '고객 사급품'
            : isExcluded
            ? '견적 제외'
            : undefined
        };
      })
    );

    setSelectedIds([]);

    const tag = inclusionType === 'ANNOTATION_NOISE' ? '[ANNOTATION_NOISE]' :
                inclusionType === 'FASTENER_EXCLUDED' ? '[FASTENER_EXCLUDED]' :
                inclusionType === 'CUSTOMER_SUPPLIED' ? '[CUSTOMER_SUPPLIED]' :
                inclusionType === 'EXCLUDED' ? '[EXCLUDED]' : '[INCLUDED]';

    Promise.all(
      effectiveLineIds.map((id) =>
        apiFetch(`/api/quotes/${caseId}/confirm-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineId: id,
            isConfirmed: true,
            unitPrice: 0,
            unitCost: 0,
            remark: tag
          })
        }).catch((err) => console.warn('Batch sync err:', err))
      )
    );
  };

  // 🧹 도면 노이즈 일괄 격리 및 사내 블랙리스트 영구 학습 핸들러
  const handleBatchNoiseQuarantine = async (items: Array<{ id: string; keyword: string }>) => {
    const itemIds = items.map((it) => it.id);

    // 사내 블랙리스트에 영구 등록 (영구 학습)
    items.forEach((it) => {
      if (it.keyword) addCustomNoiseKeyword(it.keyword);
    });

    setLines((prev) =>
      prev.map((l) => {
        if (!itemIds.includes(l.id)) return l;
        return {
          ...l,
          inclusionType: 'ANNOTATION_NOISE' as const,
          isIncluded: false,
          status: 'CONFIRMED' as const,
          unitCost: 0,
          supplyPrice: 0,
          excludeReason: '도면 주석/표제란 노이즈 격리 (사내 블랙리스트 학습됨)'
        };
      })
    );

    setSelectedIds([]);

    // 백엔드 비동기 동기화
    Promise.all(
      itemIds.map((id) =>
        apiFetch(`/api/quotes/${caseId}/confirm-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineId: id,
            isConfirmed: true,
            unitPrice: 0,
            unitCost: 0,
            remark: '[ANNOTATION_NOISE] 사내 노이즈 블랙리스트 격리 및 학습'
          })
        }).catch((err) => console.warn('Batch noise sync err:', err))
      )
    );

    alert(`총 ${items.length}건의 도면 표제란/주석 노이즈가 격리실로 이동되었으며, 사내 노이즈 블랙리스트에 영구 학습되었습니다.`);
  };

  // 📝 사내 노이즈 블랙리스트 단건 추가 핸들러
  const handleAddNoiseBlacklist = (keyword: string) => {
    if (!keyword) return;
    addCustomNoiseKeyword(keyword);
    alert(`[사내 노이즈 블랙리스트 등록 완료]\n'${keyword}'(이)가 사내 노이즈 사전 DB에 등록되었습니다.\n다음 도면 파싱부터 자동으로 사전 제외됩니다.`);
  };

  // 🔩 표준 체결구 일괄 제외 핸들러
  const handleBatchFastenerExclude = (lineIds: string[]) => {
    handleBatchUpdateInclusion(lineIds, 'FASTENER_EXCLUDED');
  };

  // 📦 잔여 0원 품목 일괄 사급품 지정 핸들러
  const handleBatchSupplyConvert = (lineIds: string[]) => {
    handleBatchUpdateInclusion(lineIds, 'CUSTOMER_SUPPLIED');
  };

  // ⭐ 고신뢰(90%↑) 마스터 일괄 확정 핸들러
  const handleBatchMasterConfirm = async (
    items: Array<{ id: string; price: number; cost: number; similarity: any }>
  ) => {
    const idMap = new Map(items.map((it) => [it.id, it]));

    setLines((prev) =>
      prev.map((l) => {
        const matched = idMap.get(l.id);
        if (!matched) return l;
        return {
          ...l,
          supplyPrice: matched.price,
          unitCost: matched.cost,
          status: 'CONFIRMED' as const,
          priceSource: 'MASTER_MATCH',
          similarityBreakdown: matched.similarity,
          masterPrice: matched.price
        };
      })
    );

    Promise.all(
      items.map((it) =>
        apiFetch(`/api/quotes/${caseId}/confirm-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineId: it.id,
            isConfirmed: true,
            unitPrice: it.price,
            unitCost: it.cost,
            remark: `[MASTER_MATCH] 90% 이상 고신뢰 마스터 일괄 확정`
          })
        }).catch((err) => console.warn('Sync master batch error:', err))
      )
    );
  };

  // 🌟 1순위: 사내 마스터 확정 단가 일괄 자동 매칭 및 영구 동기화
  const [matchingMaster, setMatchingMaster] = useState(false);

  const handleAutoMatchMasterPrices = async () => {
    setMatchingMaster(true);
    try {
      const mastersRes = await apiFetch('/api/admin/masters?type=products&onlyPriced=true');
      if (!mastersRes.ok) throw new Error('마스터 단가 조회 실패');
      const mastersJson = await mastersRes.json();
      const pricedMasters: any[] = mastersJson.items || [];

      if (pricedMasters.length === 0) {
        alert('사내 마스터에 등록된 유효 단가가 없습니다.');
        return;
      }

      let matchedCount = 0;
      const updatedLines = await Promise.all(
        lines.map(async (line) => {
          if (line.isAssembly) return line;
          if (line.supplyPrice > 0 && line.status === 'CONFIRMED') return line;

          const pNo = (line.partNo || '').trim().toUpperCase();
          const pName = (line.partName || '').trim().toUpperCase();
          const pNoCompact = pNo.replace(/\s+/g, '');
          const pNameCompact = pName.replace(/\s+/g, '');

          const matched = pricedMasters.find((pm: any) => {
            const pmCode = (pm.master_code || '').trim().toUpperCase();
            const pmName = (pm.standard_name || '').trim().toUpperCase();
            const pmCodeCompact = pmCode.replace(/\s+/g, '');
            const pmNameCompact = pmName.replace(/\s+/g, '');

            if (!pm.unit_price || Number(pm.unit_price) <= 0) return false;

            return (
              (pmCode && (pmCode === pNo || pmCode === pName || pmCodeCompact === pNoCompact || pmCodeCompact === pNameCompact)) ||
              (pmName && (pmName === pName || pmName === pNo || pmNameCompact === pNameCompact || pmNameCompact === pNoCompact))
            );
          });

          if (matched && Number(matched.unit_price) > 0) {
            matchedCount++;
            const sPrice = Number(matched.unit_price);
            const uCost = Math.round(sPrice * 0.82);
            const similarityBreakdown = computeMasterSimilarity(
              line.partNo,
              line.partName,
              line.material,
              line.specification || '',
              line.partType,
              matched
            );

            try {
              await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lineId: line.id,
                  partKey: `PARTNER_A:${line.partNo}:B`,
                  isConfirmed: true,
                  unitPrice: sPrice,
                  unitCost: uCost,
                  qtyTier: line.quantity <= 9 ? '1~9' : line.quantity <= 99 ? '10~99' : '100~',
                  lotQuantity: line.quantity,
                  remark: `[MASTER_MATCH] 사내 마스터 단가 자동 매칭 (일치도 ${similarityBreakdown.totalScore}%)`
                })
              });
            } catch (e) {
              console.error('Failed to sync master match line:', e);
            }

            return {
              ...line,
              supplyPrice: sPrice,
              unitCost: uCost,
              status: 'CONFIRMED' as const,
              priceSource: 'MASTER_MATCH',
              similarityBreakdown,
              masterPrice: sPrice
            };
          }
          return line;
        })
      );

      setLines(updatedLines);
      if (matchedCount > 0) {
        alert(`사내 마스터 단가표와 일치하는 품목 총 ${matchedCount}건에 대해 확정 단가를 성공적으로 자동 매칭 및 영구 저장하였습니다!`);
      } else {
        alert('현재 목록에서 마스터 단가표와 일치하는 추가 0원 품목이 없습니다.');
      }
    } catch (e: any) {
      alert('마스터 단가 매칭 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setMatchingMaster(false);
    }
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
            // 조치 2: 카탈로그 단가 마스터 미연동 상태에서 임의 하드코딩(185,000)을 배제하고 0원(미확보) 처리
            calculated = {
              subtotalCost: 0,
              unitPrice: 0,
              marginRate: 0,
              qtyTier: '1~9',
              basis: { basisType: 'ELECTRICAL_UNPRICED' }
            } as any;
          } else if (line.partType === 'COMMERCIAL') {
            // 조치 2: 기성 철물도 카탈로그 마스터 미연동 상태에서 임의 하드코딩(1,200)을 배제하고 0원(미확보) 처리
            calculated = {
              subtotalCost: 0,
              unitPrice: 0,
              marginRate: 0,
              qtyTier: '1~9',
              basis: { basisType: 'COMMERCIAL_UNPRICED' }
            } as any;
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

          const hasValidPrice = calculated.unitPrice > 0;
          if (hasValidPrice) {
            updatedCount++;
          }

          // 5. 백그라운드 DB 동기화 (단가 확보 시에만 CONFIRMED 반영)
          try {
            await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lineId: line.id,
                partKey: `ENGINEERING:${line.partNo}:STD`,
                isConfirmed: hasValidPrice,
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
            engineSuggestedPrice: calculated.unitPrice,
            status: hasValidPrice ? ('CONFIRMED' as const) : ('NEEDS_REVIEW' as const),
            memo: hasValidPrice
              ? `AI공학표준원가 (${rawWeightKg}kg)`
              : '공학원가 미확보 (카탈로그 미연동)'
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

  // ⚡ 단일 품목(1개) AI 공학 표준원가 계산 핸들러
  const [calculatingSingleId, setCalculatingSingleId] = useState<string | null>(null);

  const handleCalculateSingleEngineering = async (lineId: string) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;

    if (target.isAssembly) {
      alert('조립도(Assembly)는 가공비가 자동 0원(배제) 처리됩니다.');
      return;
    }

    setCalculatingSingleId(lineId);
    try {
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
            if (sJson.processRates.DEFAULT_MARGIN_RATE) defaultMargin = sJson.processRates.DEFAULT_MARGIN_RATE;
          }
        }
      } catch {}

      // 도면 매칭
      const dwg = drawings.find((d: any) =>
        (d.drawing_no_raw && d.drawing_no_raw.trim().toLowerCase() === target.partNo.trim().toLowerCase()) ||
        (d.drawing_no_normalized && d.drawing_no_normalized.trim().toLowerCase() === target.partNo.trim().toLowerCase()) ||
        (d.drawing_name_raw && d.drawing_name_raw.trim().toLowerCase() === target.partName.trim().toLowerCase())
      );

      let width = 100;
      let height = 80;
      let thickness = 15;

      if (dwg && dwg.max_x && dwg.min_x && dwg.max_y && dwg.min_y) {
        width = Math.max(10, Math.min(2000, Math.round(Math.abs(dwg.max_x - dwg.min_x))));
        height = Math.max(10, Math.min(2000, Math.round(Math.abs(dwg.max_y - dwg.min_y))));
      }

      const spec = target.specification || '';
      const dimMatch = spec.match(/(\d+)\s*[xX*]\s*(\d+)(\s*[xX*]\s*(\d+))?/);
      if (dimMatch) {
        width = parseInt(dimMatch[1], 10) || width;
        height = parseInt(dimMatch[2], 10) || height;
        if (dimMatch[4]) thickness = parseInt(dimMatch[4], 10) || thickness;
      }

      const matUpper = (target.material || 'SS400').toUpperCase();
      const density = matUpper.includes('AL') ? 2.70 :
                      matUpper.includes('SUS') || matUpper.includes('SCS') ? 7.93 :
                      matUpper.includes('FC') || matUpper.includes('GCD') || matUpper.includes('CAST') ? 7.25 :
                      matUpper.includes('BS') || matUpper.includes('BRASS') || matUpper.includes('CU') ? 8.50 :
                      matUpper.includes('POM') || matUpper.includes('NYLON') ? 1.40 : 7.85;

      const volumeCm3 = (width * height * thickness) / 1000;
      const rawWeightKg = Math.max(0.2, Number(((volumeCm3 * density) / 1000).toFixed(2)));

      const matKey = Object.keys(materialRates).find(k => matUpper.includes(k)) || 'SS400';
      const materialKgRate = materialRates[matKey] || 2200;

      let calculated: CostCalculationResult;
      if (target.partType === 'CASTING') {
        calculated = calculateCastingCost({
          netWeightKg: rawWeightKg,
          materialKgRate,
          castingProcessRatePerKg: castingRate,
          marginRate: defaultMargin,
          quantity: target.quantity
        });
      } else if (target.partType === 'SHEET_METAL') {
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
          quantity: target.quantity
        });
      } else {
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
          quantity: target.quantity
        });
      }

      const hasValidPrice = calculated.unitPrice > 0;

      // 로컬 상태 즉시 반영
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          return {
            ...l,
            unitCost: calculated.subtotalCost,
            supplyPrice: calculated.unitPrice,
            engineSuggestedPrice: calculated.unitPrice,
            status: hasValidPrice ? ('CONFIRMED' as const) : ('NEEDS_REVIEW' as const),
            memo: hasValidPrice
              ? `AI공학표준원가 (${rawWeightKg}kg)`
              : '공학원가 미확보'
          };
        })
      );

      // DB 저장
      try {
        await apiFetch(`/api/quotes/${caseId}/confirm-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineId: target.id,
            partKey: `ENGINEERING:${target.partNo}:STD`,
            isConfirmed: hasValidPrice,
            unitPrice: calculated.unitPrice,
            unitCost: calculated.subtotalCost,
            qtyTier: calculated.qtyTier,
            lotQuantity: target.quantity,
            basis: calculated.basis
          })
        });
      } catch (err) {
        console.warn('Sync single line to DB warning:', err);
      }
    } catch (e: any) {
      alert('품목 AI 원가 계산 중 오류: ' + (e.message || ''));
    } finally {
      setCalculatingSingleId(null);
    }
  };

  // 실제 공급가액에 합산되는 유효 견적 대상 (조립도 및 제외품목 제외, 사급품은 0원으로 포함)
  const quoteActiveLines = lines.filter((l) => {
    if (l.isAssembly) return false;
    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return inc === 'INCLUDED' || inc === 'CUSTOMER_SUPPLIED';
  });

  // 미확정 건수: 견적 대상(INCLUDED) 품목 중 미확정 상태인 건수
  const unconfirmedCount = quoteActiveLines.filter((l) => {
    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return inc === 'INCLUDED' && l.status !== 'CONFIRMED';
  }).length;

  // 단가 미확보(0원): 견적 대상(INCLUDED)인데 공급단가가 0원 이하인 항목만 카운트!
  // (사급품 CUSTOMER_SUPPLIED 및 체결구 제외 FASTENER_EXCLUDED는 0원이어도 정상 처리되므로 차단하지 않음)
  const zeroPriceCount = lines.filter((l) => {
    if (l.isAssembly) return false;
    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
    return inc === 'INCLUDED' && l.supplyPrice <= 0;
  }).length;

  const totalCost = quoteActiveLines.reduce((acc, l) => acc + (l.unitCost * l.quantity), 0);
  const totalSupply = quoteActiveLines.reduce((acc, l) => acc + (l.supplyPrice * l.quantity), 0);
  const avgMargin = totalSupply > 0 ? Math.round(((totalSupply - totalCost) / totalSupply) * 1000) / 10 : 0;

  const handleSubmitQuote = async () => {
    if (unconfirmedCount > 0) {
      alert(`미확정 항목이 ${unconfirmedCount}건 남아있습니다. 전 항목 단가를 확정한 후 결재 상신해주세요.`);
      return;
    }

    // 0원 미확보 품목 최종 점검: 견적 포함 대상(INCLUDED) 중 공급단가가 0원인 품목이 있으면 차단 (사급품/제외품 제외)
    const activeZeroPrice = lines.filter((l) => {
      if (l.isAssembly) return false;
      const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
      return inc === 'INCLUDED' && l.supplyPrice <= 0;
    });
    if (activeZeroPrice.length > 0) {
      alert(`공급단가가 0원인 단가 미확보 품목이 ${activeZeroPrice.length}건 존재합니다.\n단가를 입력하거나 [사급품] 또는 [견적제외] 처리한 후 결재 상신해 주세요.`);
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
          handleUpdateSelected({ supplyPrice: recommendations[0].unitPrice, priceSource: 'MASTER_MATCH' });
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        setIsMasterDrawerOpen((prev) => !prev);
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

          {/* ⭐ 1순위: 사내 마스터 단가 자동 매칭 버튼 */}
          <button
            onClick={handleAutoMatchMasterPrices}
            disabled={matchingMaster}
            className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-xs border transition-all cursor-pointer ${
              matchingMaster
                ? 'bg-amber-100 text-amber-800 border-amber-300 cursor-wait'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 hover:border-emerald-400'
            }`}
            title="사내 마스터 단가표에 등록된 확정 단가를 품명/도번 일치 품목에 1초 만에 자동 매칭하고 견적 DB에 영구 저장합니다."
          >
            {matchingMaster ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            )}
            <span>{matchingMaster ? '단가 매칭 중...' : '⭐ 마스터 단가 자동 매칭'}</span>
          </button>

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

          {/* 📋 사내 마스터 단가표 참고 드로어 토글 버튼 */}
          <button
            onClick={() => setIsMasterDrawerOpen(true)}
            className="px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs border transition-all cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-300 text-xs"
            title="사내 표준 마스터 단가, 원자재 kg 시세 및 공정 임률표를 실시간으로 확인합니다 (단축키 F7)"
          >
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>📋 마스터 단가표 (F7)</span>
          </button>

          {/* 마스터 기준정보 관리 이동 버튼 */}
          <Link
            href="/admin/masters"
            target="_blank"
            className="hidden lg:flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs transition-colors shadow-2xs"
            title="표준 품목, 기준단가 및 소재/가공 임률 설정 관리"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>기준정보 관리</span>
          </Link>

          {/* ℹ️ 워크스페이스 이용 안내 모달 호출 버튼 */}
          <button
            onClick={() => setIsPilotModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-bold text-xs transition-all shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="견적 검토 워크스페이스 이용 안내 창을 다시 엽니다"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>이용 안내</span>
          </button>

          <button
            onClick={handleSubmitQuote}
            disabled={unconfirmedCount > 0 || zeroPriceCount > 0 || submittingQuote}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors ${
              unconfirmedCount > 0 || zeroPriceCount > 0
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
              : zeroPriceCount > 0
              ? `결재 상신 불가 (단가 미확보 ${zeroPriceCount}건)`
              : unconfirmedCount > 0
              ? `결재 상신 (${unconfirmedCount}행 미확정)`
              : '결재 상신'}
          </button>
        </div>
      </header>

      {/* 🤖 상단 지능형 일괄 액션 배너 (Macro: 도면 노이즈 격리, 표준 체결구 일괄 제외, 90% 이상 마스터 확정, 0원 사급품 지정) */}
      <SmartBatchActionBar
        lines={lines}
        onBatchNoiseQuarantine={handleBatchNoiseQuarantine}
        onBatchFastenerExclude={handleBatchFastenerExclude}
        onBatchMasterConfirm={handleBatchMasterConfirm}
        onBatchSupplyConvert={handleBatchSupplyConvert}
        onBatchZeroExclude={(ids) => handleBatchUpdateInclusion(ids, 'EXCLUDED')}
        loadingMaster={matchingMaster}
      />

      {/* ⚠️ 단가 미확보 요약 경고 배너 & 스마트 1건씩 순회 내비게이터 */}
      {zeroPriceCount > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 px-5 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs text-rose-800 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 animate-pulse" />
            <span>
              단가 미확보 <strong className="underline underline-offset-2">{zeroPriceCount}건</strong> — 단가가 0원이므로 <strong>결재 상신 불가</strong>
            </span>
            <span className="text-rose-300">|</span>
            <span className="text-slate-600">
              도면을 보며 <strong>1개씩 확인·적용</strong>하거나 하단 <strong>[⚡ 이 품목 AI 원가 계산]</strong> 또는 추천 단가를 채택하세요.
            </span>
          </div>

          {/* 🎯 1개씩 순회 내비게이터 (이전 / 다음 미확보 탐색) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 이전 미확보 품목 */}
            <button
              type="button"
              onClick={() => {
                const prevZeroIdx = lines.reduce((acc, l, idx) => {
                  if (idx >= selectedIndex) return acc;
                  if (l.isAssembly) return acc;
                  const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                  if (inc === 'INCLUDED' && l.supplyPrice <= 0) return idx;
                  return acc;
                }, -1);
                if (prevZeroIdx !== -1) {
                  setSelectedIndex(prevZeroIdx);
                } else {
                  // 앞에서 더 없으면 마지막 미확보 품목으로
                  const lastZeroIdx = lines.reduce((acc, l, idx) => {
                    if (l.isAssembly) return acc;
                    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                    if (inc === 'INCLUDED' && l.supplyPrice <= 0) return idx;
                    return acc;
                  }, -1);
                  if (lastZeroIdx !== -1) setSelectedIndex(lastZeroIdx);
                }
              }}
              className="px-2 py-1 rounded bg-white hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[11px] flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
              title="이전 단가 미확보 품목으로 이동"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>이전 미확보</span>
            </button>

            {/* 현재 포커스가 0원 품목인지 표시 & 직관적 1-클릭 AI 계산 버튼 */}
            {selectedLine && !selectedLine.isAssembly && (selectedLine.inclusionType === 'INCLUDED' || !selectedLine.inclusionType) && selectedLine.supplyPrice <= 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold text-[10.5px]">
                  선택: [No.{selectedLine.itemNo}] ₩0
                </span>
                <button
                  type="button"
                  onClick={() => handleCalculateSingleEngineering(selectedLine.id)}
                  disabled={calculatingSingleId === selectedLine.id}
                  className="px-2.5 py-1 rounded bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                  title="현재 선택된 품목의 도면 체적/가공비를 적용하여 AI 공학원가를 즉시 산출합니다"
                >
                  {calculatingSingleId === selectedLine.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-white" />
                  )}
                  <span>{calculatingSingleId === selectedLine.id ? '산출 중...' : '⚡ 이 품목 AI 계산'}</span>
                </button>
              </div>
            ) : null}

            {/* 다음 미확보 품목 */}
            <button
              type="button"
              onClick={() => {
                const nextZeroIdx = lines.findIndex((l, idx) => {
                  if (idx <= selectedIndex) return false;
                  if (l.isAssembly) return false;
                  const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                  return inc === 'INCLUDED' && l.supplyPrice <= 0;
                });
                if (nextZeroIdx !== -1) {
                  setSelectedIndex(nextZeroIdx);
                } else {
                  // 뒤쪽에 더 없으면 처음부터 다시 첫 번째 미확보 품목으로
                  const firstZeroIdx = lines.findIndex((l) => {
                    if (l.isAssembly) return false;
                    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                    return inc === 'INCLUDED' && l.supplyPrice <= 0;
                  });
                  if (firstZeroIdx !== -1) setSelectedIndex(firstZeroIdx);
                }
              }}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
              title="다음 단가 미확보 품목으로 순차 이동합니다"
            >
              <span>다음 미확보 ➔</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
            selectedIds={selectedIds}
            onToggleSelectId={handleToggleSelectId}
            onSelectAll={handleSelectAll}
            onUpdateLineInclusion={handleUpdateLineInclusion}
            onBatchUpdateInclusion={handleBatchUpdateInclusion}
            onAddNoiseBlacklist={handleAddNoiseBlacklist}
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
        <div className="h-[295px] bg-slate-100 px-3 pb-3 pt-1.5 flex gap-3 shrink-0">
          <div className="w-1/2 h-full">
            {(() => {
              const topMasterItem = recommendations.find(r => r.sourceCompany?.includes('기준') || r.sourceCompany?.includes('마스터') || r.matchReason === 'REVISION_MATCH') || recommendations[0];
              const topMasterPrice = topMasterItem?.unitPrice || 0;
              return (
                <CostBreakdownPanel
                  line={selectedLine}
                  caseId={caseId}
                  topMasterPrice={topMasterPrice}
                  onUpdateLine={handleUpdateSelected}
                  onConfirmLine={handleToggleConfirm}
                  onAddNoiseBlacklist={handleAddNoiseBlacklist}
                  onCalculateSingleEngineering={handleCalculateSingleEngineering}
                  isCalculatingSingle={calculatingSingleId === selectedLine?.id}
                />
              );
            })()}
          </div>
          <div className="w-1/2 h-full">
            <MasterRecommendationCard
              recommendations={recommendations}
              selectedLineCost={selectedLine?.unitCost}
              currentSupplyPrice={selectedLine?.supplyPrice}
              onApplyPrice={(prc) => handleUpdateSelected({ supplyPrice: prc, priceSource: 'MASTER_MATCH' })}
              onApplyAndNext={(prc) => {
                handleUpdateSelected({ supplyPrice: prc, priceSource: 'MASTER_MATCH' });
                // 단가 적용 후 바로 다음 미확보 품목으로 자동 점프
                setTimeout(() => {
                  const nextZeroIdx = lines.findIndex((l, idx) => {
                    if (idx <= selectedIndex) return false;
                    if (l.isAssembly) return false;
                    const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                    return inc === 'INCLUDED' && l.supplyPrice <= 0;
                  });
                  if (nextZeroIdx !== -1) {
                    setSelectedIndex(nextZeroIdx);
                  } else {
                    // 뒤쪽에 없으면 앞쪽 첫 번째 미확보 탐색
                    const firstZeroIdx = lines.findIndex((l) => {
                      if (l.isAssembly) return false;
                      const inc = l.inclusionType || (l.isIncluded === false ? 'EXCLUDED' : 'INCLUDED');
                      return inc === 'INCLUDED' && l.supplyPrice <= 0;
                    });
                    if (firstZeroIdx !== -1) setSelectedIndex(firstZeroIdx);
                  }
                }, 100);
              }}
              onOpenMasterDrawer={() => setIsMasterDrawerOpen(true)}
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
            <kbd className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-amber-300 font-mono font-bold shadow-xs">F7</kbd>
            <span className="text-slate-200">마스터 단가표</span>
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

      {/* 💎 5. 사내 마스터 기준 단가표 실시간 슬라이드오버 드로어 */}
      <MasterPriceReferenceDrawer
        isOpen={isMasterDrawerOpen}
        onClose={() => setIsMasterDrawerOpen(false)}
        selectedLine={selectedLine}
        onApplyPrice={(prc, src) => {
          handleUpdateSelected({ supplyPrice: prc, priceSource: 'MASTER_MATCH' });
        }}
      />

      {/* 💎 6. 파일럿 최초 진입 안내 모달 (P-4) */}
      <PilotWelcomeModal
        isOpen={isPilotModalOpen}
        onOpenChange={setIsPilotModalOpen}
      />
    </div>
  );
}
