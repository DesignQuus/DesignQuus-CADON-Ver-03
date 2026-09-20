import { db } from '../src/lib/db';

async function analyzeBomAndQuoteItems() {
  const caseId = 'case_1789766302590';
  console.log('=== BOM 품목 및 견적 대상 품목 정밀 분석 ===');

  // 1. normalized_bom_items 전수 조사
  const normItems = await db.prepare(`
    SELECT id, raw_name, normalized_name, spec_candidate, material_candidate, quantity, is_quote_included
    FROM normalized_bom_items
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`normalized_bom_items 총 건수: ${normItems.length}건`);

  // 2. drawings 테이블과 매핑하여 조립도 여부 확인
  const drawings = await db.prepare(`
    SELECT id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_type, is_quote_included
    FROM drawings
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];

  const dwgMapByNo = new Map<string, any>();
  const dwgMapByName = new Map<string, any>();
  for (const d of drawings) {
    if (d.drawing_no_normalized) dwgMapByNo.set(d.drawing_no_normalized.trim(), d);
    if (d.drawing_name_raw) dwgMapByName.set(d.drawing_name_raw.trim(), d);
  }

  // 조립도 16장에 해당하는 품목 찾기
  let assyItemCount = 0;
  let partItemCount = 0;
  let purchaseItemCount = 0;

  const assyItems: any[] = [];
  const partItems: any[] = [];
  const purchaseItems: any[] = [];

  for (const ni of normItems) {
    const rawName = (ni.raw_name || '').trim();
    const normName = (ni.normalized_name || '').trim();

    // 1) 도면번호 매핑
    const dwgByNo = dwgMapByNo.get(rawName) || dwgMapByNo.get(normName);
    // 2) 도면명 매핑
    const dwgByName = dwgMapByName.get(rawName) || dwgMapByName.get(normName);
    const dwg = dwgByNo || dwgByName;

    if (dwg) {
      if (dwg.drawing_type === 'MAIN_ASSEMBLY' || dwg.drawing_type === 'SUB_ASSEMBLY') {
        assyItemCount++;
        assyItems.push({ item: ni, dwg });
      } else {
        partItemCount++;
        partItems.push({ item: ni, dwg });
      }
    } else {
      // 도면이 없는 품목 (구매품/외주품 또는 도면 미발견 품목)
      // 이름에 조립/ASSY/CHAIN DRIVE가 포함되는지 확인
      if (rawName.includes('조립') || rawName.includes('CHAIN DRIVE') || rawName.endsWith('-000')) {
        assyItemCount++;
        assyItems.push({ item: ni, dwg: null, reason: '이름 기반 조립품' });
      } else {
        purchaseItemCount++;
        purchaseItems.push({ item: ni });
      }
    }
  }

  console.log(`- 조립품목 (BOM 내 조립도/상위체): ${assyItemCount}건`);
  console.log(`- 단품도면 품목 (가공/판금 도면 연계): ${partItemCount}건`);
  console.log(`- 도면 없는 규격/구매품 품목: ${purchaseItemCount}건`);
  console.log(`- 합계: ${assyItemCount + partItemCount + purchaseItemCount}건`);

  console.log('조립품목 상세:', assyItems.map(a => `${a.item.raw_name} -> ${a.dwg ? a.dwg.drawing_type : a.reason}`));

  // 3. final_bom_items 조사
  const finalItems = await db.prepare(`
    SELECT id, drawing_no_normalized, drawing_name_raw, is_quote_included
    FROM final_bom_items
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];
  console.log(`final_bom_items 총 건수: ${finalItems.length}건`);
  const finalExcluded = finalItems.filter(f => f.is_quote_included === 0);
  console.log(`final_bom_items 중 is_quote_included = 0: ${finalExcluded.length}건`);

  // 133건의 유래 계산
  console.log('=== 과거 133건 유래 계산 ===');
  console.log(`145 (총 BOM) - 12 (과거 12개 조립도 배제 시) = ${145 - 12}건!`);
  console.log(`145 (총 BOM) - ${assyItemCount} (실제 조립품목 배제 시) = ${145 - assyItemCount}건!`);
}

analyzeBomAndQuoteItems().catch(console.error);
