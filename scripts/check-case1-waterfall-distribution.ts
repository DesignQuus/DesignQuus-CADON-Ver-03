import { db } from '../src/lib/db';

async function main() {
  const caseId = 'case_1789766302590';
  console.log(`=== 1차 케이스(${caseId}) 견적 대상 단가 매칭 실측 ===\n`);

  const qc = await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(caseId) as any;
  const dateStr = new Date().toISOString().split('T')[0];

  // 1차 케이스의 final_bom_items 조회
  const finalItems = await db.prepare(`
    SELECT fbi.*, 
           COALESCE(d.drawing_no_raw, fb.part_no, fbi.final_master_code, '') as drawing_no,
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
  `).all(caseId, caseId) as any[];

  console.log(`전체 final_bom_items 건수: ${finalItems.length}건`);

  // 조립도 배제 및 순수 견적 대상 128건 필터링
  const quoteTargetItems = finalItems.filter((item: any) => {
    const dwgNo = (item.drawing_no || item.final_master_code || '').trim();
    const itemName = (item.final_name || '').trim();
    const isAssembly = 
      item.drawing_type === 'MAIN_ASSEMBLY' || 
      item.drawing_type === 'SUB_ASSEMBLY' || 
      dwgNo.endsWith('-000') ||
      itemName.includes('조립도') || 
      itemName.includes('CHAIN DRIVE') || 
      itemName.includes('LINE');
    return !isAssembly && item.is_quote_included !== 0;
  });

  console.log(`순수 견적 대상 품목 수: ${quoteTargetItems.length}건 (조립 17건 제외 확인)\n`);

  const priorityCounts = {
    p1_masters: 0,
    p2_human_verified: 0,
    p3_manual_pool: 0,
    p4_engineering_cost: 0,
    p5_not_found: 0
  };

  const p4Samples: any[] = [];
  const p5Samples: any[] = [];

  for (const item of quoteTargetItems) {
    const dwgNo = (item.drawing_no || item.final_master_code || '').trim();
    const itemName = (item.final_name || '').trim();
    let unitPrice = 0;
    let matchedPriority = '';

    // 1순위: price_masters
    if (item.final_master_id) {
      const custPrice = await db.prepare(`
        SELECT unit_price FROM price_masters
        WHERE master_id = ? AND company_id = ? AND is_active = 1
        ORDER BY effective_from DESC LIMIT 1
      `).get(item.final_master_id, qc.company_id) as any;

      const stdPrice = await db.prepare(`
        SELECT unit_price FROM price_masters
        WHERE master_id = ? AND (company_id IS NULL OR company_id = '') AND is_active = 1
        ORDER BY effective_from DESC LIMIT 1
      `).get(item.final_master_id) as any;

      const pRow = custPrice || stdPrice;
      if (pRow) {
        unitPrice = pRow.unit_price;
        matchedPriority = 'p1_masters';
      }
    }

    // 2순위: price_history_v2 (HUMAN_VERIFIED)
    if (unitPrice === 0) {
      const vRow = await db.prepare(`
        SELECT unit_price FROM price_history_v2
        WHERE (part_master_id = ? OR part_key = ? OR part_key = ?)
          AND price_basis_type = 'HUMAN_VERIFIED' AND unit_price > 0
        ORDER BY created_at DESC LIMIT 1
      `).get(item.final_master_id || '', dwgNo, itemName) as any;

      if (vRow) {
        unitPrice = vRow.unit_price;
        matchedPriority = 'p2_human_verified';
      }
    }

    // 3순위: manual_price_pool
    if (unitPrice === 0 && item.final_name) {
      const normFinalName = item.final_name.toUpperCase().trim();
      const mRow = await db.prepare(`
        SELECT unit_price FROM manual_price_pool
        WHERE (UPPER(TRIM(item_name)) = ? OR UPPER(TRIM(COALESCE(standard_name, ''))) = ?) AND unit_price > 0
        LIMIT 1
      `).get(normFinalName, normFinalName) as any;

      if (mRow) {
        unitPrice = mRow.unit_price;
        matchedPriority = 'p3_manual_pool';
      }
    }

    // 4순위: part_cost_breakdowns (ENGINEERING_COST)
    if (unitPrice === 0) {
      const costRow = await db.prepare(`
        SELECT c.final_unit_price, c.calc_formula_json
        FROM part_cost_breakdowns c
        JOIN part_fabrication_features f ON c.feature_id = f.id
        JOIN drawings d ON f.drawing_id = d.id
        WHERE d.quotation_case_id = ?
          AND (d.drawing_no_normalized = ? OR d.drawing_no_raw = ? OR d.drawing_name_raw = ? OR d.drawing_name_normalized = ?)
          AND c.final_unit_price > 0
        LIMIT 1
      `).get(caseId, dwgNo, dwgNo, itemName, itemName) as any;

      if (costRow && costRow.final_unit_price > 0) {
        unitPrice = costRow.final_unit_price;
        matchedPriority = 'p4_engineering_cost';
        if (p4Samples.length < 3) {
          p4Samples.push({ name: itemName, dwgNo, price: unitPrice });
        }
      }
    }

    // 5순위: NOT_FOUND
    if (unitPrice === 0) {
      matchedPriority = 'p5_not_found';
      if (p5Samples.length < 5) {
        p5Samples.push({ name: itemName, dwgNo, spec: item.final_spec });
      }
    }

    priorityCounts[matchedPriority as keyof typeof priorityCounts]++;
  }

  console.log('--- 1차 케이스 단가 매칭 결과 (순수 견적 대상 128건 기준) ---');
  console.log(`1순위 price_masters      : ${priorityCounts.p1_masters}건 (${((priorityCounts.p1_masters / 128) * 100).toFixed(1)}%)`);
  console.log(`2순위 HUMAN_VERIFIED     : ${priorityCounts.p2_human_verified}건 (${((priorityCounts.p2_human_verified / 128) * 100).toFixed(1)}%)`);
  console.log(`3순위 manual_price_pool  : ${priorityCounts.p3_manual_pool}건 (${((priorityCounts.p3_manual_pool / 128) * 100).toFixed(1)}%)`);
  console.log(`4순위 ENGINEERING_COST   : ${priorityCounts.p4_engineering_cost}건 (${((priorityCounts.p4_engineering_cost / 128) * 100).toFixed(1)}%)`);
  console.log(`5순위 NOT_FOUND(0원)     : ${priorityCounts.p5_not_found}건 (${((priorityCounts.p5_not_found / 128) * 100).toFixed(1)}%)`);
  console.log(`합계                     : ${Object.values(priorityCounts).reduce((a, b) => a + b, 0)}건\n`);

  console.log('4순위 ENGINEERING_COST 매칭 샘플:', p4Samples);
  console.log('5순위 NOT_FOUND 품목 샘플:', p5Samples);
}

main().catch(console.error);
