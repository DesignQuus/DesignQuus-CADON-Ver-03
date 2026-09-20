import { db } from '../src/lib/db';

async function listP5Items() {
  const caseId = 'case_1789766302590';
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

  const costBreakdowns = (await db.prepare(`
    SELECT d.drawing_no_normalized, d.drawing_no_raw, d.drawing_name_raw, c.final_unit_price
    FROM part_cost_breakdowns c
    JOIN part_fabrication_features f ON c.feature_id = f.id
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = ? AND c.final_unit_price > 0
  `).all(caseId)) as any[];

  const manualPrices = (await db.prepare(`SELECT item_name FROM manual_price_pool`).all()) as any[];

  const p5List: any[] = [];
  for (const item of quoteTargetItems) {
    const dwgNo = (item.final_master_code || '').trim();
    const itemName = (item.final_name || '').trim();
    const hasManual = manualPrices.some(m => m.item_name === itemName);
    const hasCost = costBreakdowns.some(c => 
      c.drawing_no_normalized === dwgNo || c.drawing_no_raw === dwgNo || 
      c.drawing_name_raw === itemName
    );
    if (!hasCost && !hasManual) {
      p5List.push(item);
    }
  }

  console.log(`Total P5 items: ${p5List.length}`);
  p5List.forEach((it, idx) => {
    console.log(`${idx + 1}. ID: ${it.id} | Name: "${it.final_name}" | Dwg: "${it.final_master_code}" | Spec: "${it.final_spec}" | Qty: ${it.final_quantity}`);
  });
}

listP5Items().catch(console.error);
