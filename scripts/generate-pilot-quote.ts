import { db } from '../src/lib/db';

async function generatePilotQuote() {
  const caseId = 'case_1789766302590';
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(caseId)) as any;
  if (!qc) throw new Error('Case not found');

  const finalItems = (await db.prepare(`
    SELECT 
      fbi.*,
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
    WHERE fbi.quotation_case_id = ? AND fbi.approval_status = 'APPROVED'
    ORDER BY fbi.rowid ASC
  `).all(caseId, caseId)) as any[];

  console.log(`Loaded ${finalItems.length} approved final BOM items for Case 1.`);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const quoteId = `quote_pilot_${Date.now()}`;
  const quoteNo = `Q-${qc.case_no.replace('QT-', '')}-V1`;

  const aggregatedMap = new Map<string, any>();

  for (const item of finalItems) {
    const dwgNo = (item.drawing_no || item.final_master_code || '').trim();
    const itemName = (item.final_name || '').trim();
    const upperName = itemName.toUpperCase();
    const upperDwgNo = dwgNo.toUpperCase();
    const material = (item.final_material || 'UNKNOWN').trim();

    // 조립도 자동 판정
    const isAssembly = 
      item.drawing_type === 'MAIN_ASSEMBLY' || 
      item.drawing_type === 'SUB_ASSEMBLY' || 
      upperDwgNo.endsWith('-000') ||
      upperDwgNo.endsWith('-00-000') ||
      upperName.includes('조립') || 
      upperName.includes('ASSEMBLY') || 
      upperName.includes('ASSY') || 
      upperName.includes('UNIT');

    const isIncluded = isAssembly ? 0 : (item.is_quote_included !== 0 ? 1 : 0);
    const remark = isAssembly ? '조립도 (가공품 제외)' : (isIncluded ? '' : '견적 제외 품목 (메타데이터 노이즈)');

    let cleanSpec = (item.final_spec || '').trim();
    if (!cleanSpec || /^\s*(1\s*[/:]\s*\d*|-)\s*$/i.test(cleanSpec)) {
      cleanSpec = '-';
    }

    const groupKey = dwgNo ? dwgNo : `${itemName}___${material}`;
    const qty = Number(item.final_quantity) || 1.0;

    if (aggregatedMap.has(groupKey)) {
      const existing = aggregatedMap.get(groupKey)!;
      existing.quantity += qty;
      if (isIncluded === 1) {
        existing.is_included = 1;
        existing.remark = '';
      }
    } else {
      let unitPrice = 0;
      let priceSource = 'NOT_FOUND';
      let priceStatus = 'PRICE_NOT_FOUND';

      // 1순위: price_masters
      // 2순위: price_history_v2 (HUMAN_VERIFIED)
      // 3순위: manual_price_pool
      // 4순위: ENGINEERING_COST
      let formulaRemark = '';
      if (unitPrice === 0 && isIncluded === 1) {
        const costRow = (await db.prepare(`
          SELECT c.*, f.bbox_width, f.bbox_length, f.bbox_thickness, f.material_code, f.part_weight_kg
          FROM part_cost_breakdowns c
          JOIN part_fabrication_features f ON c.feature_id = f.id
          JOIN drawings d ON f.drawing_id = d.id
          WHERE d.quotation_case_id = ?
            AND (d.drawing_no_normalized = ? OR d.drawing_no_raw = ? OR d.drawing_name_raw = ? OR d.drawing_name_normalized = ?)
            AND c.final_unit_price > 0
          LIMIT 1
        `).get(caseId, dwgNo, dwgNo, itemName, itemName)) as any;

        if (costRow && costRow.final_unit_price > 0) {
          unitPrice = costRow.final_unit_price;
          priceSource = 'ENGINEERING_COST';
          priceStatus = 'NEEDS_REVIEW';
          formulaRemark = costRow.calc_formula_json ? `[ENGINEERING_COST] ${costRow.calc_formula_json}` : '[ENGINEERING_COST]';
        }
      }

      aggregatedMap.set(groupKey, {
        id: item.id,
        final_bom_item_id: item.id,
        master_id: item.final_master_id || null,
        drawing_no: dwgNo,
        drawing_type: item.drawing_type,
        master_code: item.final_master_code || dwgNo || '-',
        item_name: itemName,
        specification: cleanSpec,
        material: material,
        quantity: qty,
        unit: item.final_unit || 'EA',
        unitPrice,
        priceSource,
        priceStatus,
        is_included: isIncluded,
        remark: formulaRemark || remark
      });
    }
  }

  let subtotal = 0;
  const quoteItemsData: any[] = [];
  let itemIdx = 1;

  for (const agg of aggregatedMap.values()) {
    const amount = Math.round(agg.quantity * agg.unitPrice);
    if (agg.is_included === 1) {
      subtotal += amount;
    }

    quoteItemsData.push({
      id: `qitem_${quoteId}_${itemIdx}`,
      quote_id: quoteId,
      final_bom_item_id: agg.final_bom_item_id,
      master_id: agg.master_id,
      drawing_no: agg.drawing_no,
      item_no: itemIdx++,
      master_code: agg.master_code,
      item_name: agg.item_name,
      specification: agg.specification,
      material: agg.material,
      quantity: agg.quantity,
      unit: agg.unit,
      unit_price: agg.unitPrice,
      amount: amount,
      price_source: agg.priceSource,
      price_status: agg.priceStatus,
      remark: agg.remark,
      is_included: agg.is_included
    });
  }

  const taxAmount = Math.round(subtotal * 0.1);
  const totalAmount = subtotal + taxAmount;

  // Insert Quotes
  await db.prepare(`
    INSERT INTO quotes (
      id, quotation_case_id, quote_no, quote_version, company_id, project_id,
      status, currency, subtotal, discount_type, discount_rate, discount_amount,
      tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quoteId, caseId, quoteNo, 1, qc.company_id, qc.project_id,
    'DRAFT', 'KRW', subtotal, 'AMOUNT', 0, 0,
    0.10, taxAmount, totalAmount, dateStr, 0, 'admin',
    now.toISOString(), now.toISOString()
  );

  // Insert Quote Items
  for (const qi of quoteItemsData) {
    await db.prepare(`
      INSERT INTO quote_items (
        id, quote_id, final_bom_item_id, master_id, drawing_no, item_no, master_code,
        item_name, specification, material, quantity, unit, unit_price,
        amount, price_source, price_status, remark, is_included, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      qi.id, qi.quote_id, qi.final_bom_item_id, qi.master_id, qi.drawing_no, qi.item_no,
      qi.master_code, qi.item_name, qi.specification, qi.material,
      qi.quantity, qi.unit, qi.unit_price, qi.amount, qi.price_source,
      qi.price_status, qi.remark, qi.is_included, now.toISOString()
    );
  }

  console.log(`\n[성공] 1차 케이스 공식 견적서(${quoteNo}) 적재 완료!`);
  console.log(`- 전체 품목: ${quoteItemsData.length}건`);
  console.log(`  └ 견적 포함: ${quoteItemsData.filter(q => q.is_included === 1).length}건`);
  console.log(`  └ 견적 제외: ${quoteItemsData.filter(q => q.is_included === 0).length}건 (조립도 17 + 노이즈 18)`);
  console.log(`- 공급가액(VAT별도): ₩${subtotal.toLocaleString()}`);
  console.log(`- 총 견적금액(VAT포함): ₩${totalAmount.toLocaleString()}`);
}

generatePilotQuote().catch(console.error);
