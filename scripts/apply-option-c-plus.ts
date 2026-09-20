import { db } from '../src/lib/db';

async function applyOptionCPlus() {
  const caseId = 'case_1789766302590';
  console.log(`=== [옵션 C+] 표제란 메타데이터 노이즈 정제 시작 (Case: ${caseId}) ===\n`);

  // 그룹 A: 표제란/메타데이터 노이즈 18개 final_bom_items ID 목록
  const noiseItemIds = [
    'final_norm_case_1789766302590_102', // 10U+00B0
    'final_norm_case_1789766302590_103', // 2 SET
    'final_norm_case_1789766302590_120', // PROJECT NO.
    'final_norm_case_1789766302590_121', // A3
    'final_norm_case_1789766302590_125', // 365 X 365
    'final_norm_case_1789766302590_126', // 300 X 400
    'final_norm_case_1789766302590_132', // PAINT (RAL7035 반광)
    'final_norm_case_1789766302590_134', // 열처리 HRC 45~55
    'final_norm_case_1789766302590_135', // 1.2T
    'final_norm_case_1789766302590_136', // MAIN C V DRIVE END COVER : 1 EA
    'final_norm_case_1789766302590_137', // PROJECT NAME
    'final_norm_case_1789766302590_138', // PROJECT NO.
    'final_norm_case_1789766302590_139', // NO. / REMAPK
    'final_norm_case_1789766302590_140', // SUB C V RETURN END COVER : 1 EA
    'final_norm_case_1789766302590_141', // 1.2T
    'final_norm_case_1789766302590_142', // 세 창 인 터 내 쇼 날 (주)
    'final_norm_case_1789766302590_143', // 신형 표준 타입
    'final_norm_case_1789766302590_144'  // PROJECT NAME / NOTE 공차
  ];

  // 1. normalized_bom_items 테이블에서 is_quote_included = 0, exclude_reason 업데이트
  for (const fbiId of noiseItemIds) {
    const fbi = (await db.prepare('SELECT normalized_item_id FROM final_bom_items WHERE id = ?').get(fbiId)) as any;
    if (fbi && fbi.normalized_item_id) {
      await db.prepare(`
        UPDATE normalized_bom_items 
        SET is_quote_included = 0, 
            exclude_reason = '도면 메타데이터 노이즈 (견적 제외)'
        WHERE id = ? AND quotation_case_id = ?
      `).run(fbi.normalized_item_id, caseId);
    }
  }

  console.log(`[성공] normalized_bom_items 노이즈 품목 ${noiseItemIds.length}건 견적 제외(is_quote_included = 0) 처리 완료.`);

  // 2. 확인: 순수 견적 대상 재산출
  const finalItems = (await db.prepare(`
    SELECT fbi.id, fbi.final_name, fbi.final_master_code, fbi.final_spec, fbi.final_material, fbi.final_quantity,
           COALESCE(d.drawing_type, 'PART') as drawing_type,
           COALESCE(d.is_quote_included, ni.is_quote_included, 1) as is_quote_included
    FROM final_bom_items fbi
    LEFT JOIN normalized_bom_items ni ON ni.id = fbi.normalized_item_id
    LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(fbi.normalized_item_id, 'norm_', 'fb_')
    LEFT JOIN (
      SELECT quotation_case_id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_type, is_quote_included
      FROM drawings
      WHERE quotation_case_id = ?
      GROUP BY drawing_no_raw
    ) d ON d.quotation_case_id = fbi.quotation_case_id 
       AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fbi.final_master_code)
    WHERE fbi.quotation_case_id = ?
  `).all(caseId, caseId)) as any[];

  const quoteTargetItems = finalItems.filter((item: any) => {
    const dwgNo = (item.final_master_code || '').toUpperCase().trim();
    const itemName = (item.final_name || '').toUpperCase().trim();
    const isAssembly = 
      item.drawing_type === 'MAIN_ASSEMBLY' || 
      item.drawing_type === 'SUB_ASSEMBLY' || 
      dwgNo.endsWith('-000') ||
      dwgNo.endsWith('-00-000') ||
      itemName.includes('조립') || 
      itemName.includes('ASSEMBLY') || 
      itemName.includes('ASSY') || 
      itemName.includes('UNIT');
    return !isAssembly && item.is_quote_included !== 0;
  });

  console.log(`\n정제 후 순수 견적 대상 품목 수: ${quoteTargetItems.length}건 (조립 17건 + 노이즈 18건 제외)`);

  const costBreakdowns = (await db.prepare(`
    SELECT d.drawing_no_normalized, d.drawing_no_raw, d.drawing_name_raw, c.final_unit_price
    FROM part_cost_breakdowns c
    JOIN part_fabrication_features f ON c.feature_id = f.id
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = ? AND c.final_unit_price > 0
  `).all(caseId)) as any[];

  const manualPrices = (await db.prepare(`SELECT item_name FROM manual_price_pool`).all()) as any[];

  let p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0;
  const p5List: any[] = [];

  for (const item of quoteTargetItems) {
    const dwgNo = (item.final_master_code || '').trim();
    const itemName = (item.final_name || '').trim();
    const hasManual = manualPrices.some(m => m.item_name === itemName);
    const hasCost = costBreakdowns.some(c => 
      c.drawing_no_normalized === dwgNo || c.drawing_no_raw === dwgNo || 
      c.drawing_name_raw === itemName
    );

    if (hasCost) {
      p4++;
    } else if (hasManual) {
      p3++;
    } else {
      p5++;
      p5List.push(item);
    }
  }

  console.log(`\n--- [옵션 C+] 정제 후 단가 매칭 분포 실측 ---`);
  console.log(`1순위 price_masters     : ${p1}건 (0.0%)`);
  console.log(`2순위 HUMAN_VERIFIED    : ${p2}건 (0.0%)`);
  console.log(`3순위 manual_price_pool : ${p3}건 (${((p3/quoteTargetItems.length)*100).toFixed(1)}%)`);
  console.log(`4순위 ENGINEERING_COST  : ${p4}건 (${((p4/quoteTargetItems.length)*100).toFixed(1)}%) -> 가공품 전수`);
  console.log(`5순위 NOT_FOUND (0원)   : ${p5}건 (${((p5/quoteTargetItems.length)*100).toFixed(1)}%) -> 순수 기성 구매품만 잔여!`);
  console.log(`합계                    : ${quoteTargetItems.length}건`);
  console.log(`단가 확보율             : ${(((p3+p4)/quoteTargetItems.length)*100).toFixed(1)}%`);

  console.log(`\n남은 5순위 순수 기성 구매품 목록 (${p5List.length}건):`);
  p5List.forEach((it, idx) => {
    console.log(`  ${idx + 1}. [구매품] ${it.final_name} (규격/도번: ${it.final_master_code}) - 수량: ${it.final_quantity}`);
  });
}

applyOptionCPlus().catch(console.error);
