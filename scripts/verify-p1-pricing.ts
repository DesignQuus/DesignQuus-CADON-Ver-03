import { db } from '../src/lib/db';

async function testPricingWaterfall(caseId: string) {
  console.log(`\n=== [P-1 검증] 케이스: ${caseId} 단가 폭포수 시뮬레이션 ===`);

  const qc = await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(caseId) as any;
  const finalItems = await db.prepare(`
    SELECT n.*, d.drawing_type, d.is_quote_included as dwg_is_quote_included
    FROM normalized_bom_items n
    LEFT JOIN drawings d ON (n.spec_candidate = d.drawing_no_normalized OR n.raw_name = d.drawing_name_raw)
      AND d.quotation_case_id = ?
    WHERE n.quotation_case_id = ?
  `).all(caseId, caseId) as any[];

  console.log(`BOM 품목 수: ${finalItems.length}건`);

  const dateStr = new Date().toISOString().split('T')[0];
  const sourceCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let engCostSample: any = null;

  for (const item of finalItems) {
    const dwgNo = (item.spec_candidate || item.part_no_normalized || '').trim();
    const itemName = (item.normalized_name || item.raw_name || '').trim();
    const isIncluded = item.is_quote_included !== 0 ? 1 : 0;

    let unitPrice = 0;
    let priceSource = 'NOT_FOUND';
    let priceStatus = 'PRICE_NOT_FOUND';

    // 1. Price Master
    if (item.master_id) {
      const pRow = await db.prepare(`
        SELECT unit_price FROM price_masters 
        WHERE master_id = ? AND is_active = 1
        ORDER BY effective_from DESC LIMIT 1
      `).get(item.master_id) as any;
      if (pRow) {
        unitPrice = pRow.unit_price;
        priceSource = 'MASTER_PRICE';
        priceStatus = 'READY';
      }
    }

    // 2. Verified History
    if (unitPrice === 0) {
      const vRow = await db.prepare(`
        SELECT unit_price FROM price_history_v2
        WHERE (part_master_id = ? OR part_key = ? OR part_key = ?)
          AND price_basis_type = 'HUMAN_VERIFIED' AND unit_price > 0
        ORDER BY created_at DESC LIMIT 1
      `).get(item.master_id || '', dwgNo, itemName) as any;
      if (vRow) {
        unitPrice = vRow.unit_price;
        priceSource = 'VERIFIED_HISTORY';
        priceStatus = 'READY';
      }
    }

    // 3. Manual Price Pool
    if (unitPrice === 0) {
      const mRow = await db.prepare(`
        SELECT unit_price FROM manual_price_pool
        WHERE (UPPER(TRIM(item_name)) = ? OR UPPER(TRIM(COALESCE(standard_name, ''))) = ?) AND unit_price > 0
        LIMIT 1
      `).get(itemName.toUpperCase(), itemName.toUpperCase()) as any;
      if (mRow) {
        unitPrice = mRow.unit_price;
        priceSource = 'MANUAL_PRICE';
        priceStatus = 'READY';
      }
    }

    // 4. [P-1] Engineering Cost Engine
    if (unitPrice === 0 && isIncluded === 1) {
      const costRow = await db.prepare(`
        SELECT c.*, f.material_code, f.part_weight_kg
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
        priceSource = 'ENGINEERING_COST';
        priceStatus = 'NEEDS_REVIEW'; // [P-1 핵심 규칙]
        if (!engCostSample) {
          engCostSample = {
            item: itemName,
            dwgNo,
            unitPrice,
            formula: costRow.calc_formula_json
          };
        }
      }
    }

    sourceCounts[priceSource] = (sourceCounts[priceSource] || 0) + 1;
    statusCounts[priceStatus] = (statusCounts[priceStatus] || 0) + 1;
  }

  console.log('단가 소스별 분포:', sourceCounts);
  console.log('단가 상태별 분포:', statusCounts);
  if (engCostSample) {
    console.log('ENGINEERING_COST 적용 샘플:', engCostSample);
  }
}

async function main() {
  await testPricingWaterfall('case_1789766302590');
  await testPricingWaterfall('case_1789894718545');
}

main().catch(console.error);
