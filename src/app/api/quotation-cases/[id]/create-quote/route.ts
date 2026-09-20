import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { checkCasePermission } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  // Permission Guard
  const perm = await checkCasePermission(session.userId, session.role, id);
  if (!perm.canEdit) {
    return NextResponse.json({
      error: perm.message || '해당 견적건에 대한 견적서 생성 권한이 없습니다. 최고관리자의 승인이 필요합니다.',
      requiresApproval: perm.requiresApproval,
      approvalStatus: perm.approvalStatus
    }, { status: 403 });
  }

  try {
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
      ) d ON (
        (fb.part_no IS NOT NULL AND fb.part_no != '' AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no))
        OR (fbi.final_master_code IS NOT NULL AND fbi.final_master_code != '' AND (d.drawing_no_raw = fbi.final_master_code OR d.drawing_no_normalized = fbi.final_master_code))
      )
      WHERE fbi.quotation_case_id = ? AND fbi.approval_status = 'APPROVED'
      ORDER BY fbi.rowid ASC
    `).all(id, id)) as any[];

    if (finalItems.length === 0) {
      return NextResponse.json({ error: '승인된 Final BOM 품목이 없습니다. 먼저 품목을 승인해주세요.' }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const quoteCountRow = (await db.prepare('SELECT COUNT(*) as cnt FROM quotes WHERE quotation_case_id = ?').get(id)) as any;
    const quoteVersion = (quoteCountRow?.cnt || 0) + 1;
    const quoteNo = `Q-${qc.case_no.replace('QT-', '')}-V${quoteVersion}`;
    const quoteId = `quote_${Date.now()}`;

    // 💎 Roll-up / Aggregation: 동일 도번 또는 동일 품명+재질 기준 수량 합산 및 조립도 자동 제외
    interface AggregatedItem {
      id: string;
      final_bom_item_id: string;
      master_id: string | null;
      drawing_no: string;
      drawing_type: string;
      master_code: string;
      item_name: string;
      specification: string;
      material: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      priceSource: string;
      priceStatus: string;
      is_included: number;
      remark: string;
    }

    const aggregatedMap = new Map<string, AggregatedItem>();

    for (const item of finalItems) {
      const dwgNo = (item.drawing_no || item.final_master_code || '').trim();
      const itemName = (item.final_name || '').trim();
      const material = (item.final_material || 'SS400').trim();

      // 조립도(메인/서브 조립도, -000 도번, 조립도 키워드) 자동 견적 제외 판정
      const isAssembly = 
        item.drawing_type === 'MAIN_ASSEMBLY' || 
        item.drawing_type === 'SUB_ASSEMBLY' || 
        dwgNo.endsWith('-000') ||
        itemName.includes('조립도') || 
        itemName.includes('CHAIN DRIVE') || 
        itemName.includes('LINE');

      const isIncluded = isAssembly ? 0 : (item.is_quote_included !== 0 ? 1 : 0);
      const remark = isAssembly ? '조립도 (가공품 제외)' : (isIncluded ? '' : '견적 제외 품목');

      // 규격란 축척 텍스트(1/, 1/1, 1:1) 등 파싱 노이즈 정제
      let cleanSpec = (item.final_spec || '').trim();
      if (!cleanSpec || /^\s*(1\s*[/:]\s*\d*|-)\s*$/i.test(cleanSpec)) {
        cleanSpec = '-';
      }

      // Roll-up 집계 키: 도면번호 우선, 없으면 품명+재질
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

        // 1. Search Price Master (SCD Type 2: 견적일 기준 유효기간 및 활성 상태 검증)
        if (item.final_master_id) {
          const custPrice = (await db.prepare(`
            SELECT * FROM price_masters
            WHERE master_id = ? 
              AND company_id = ? 
              AND is_active = 1
              AND effective_from <= ?
              AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC
            LIMIT 1
          `).get(item.final_master_id, qc.company_id, dateStr, dateStr)) as any;

          const stdPrice = (await db.prepare(`
            SELECT * FROM price_masters
            WHERE master_id = ? 
              AND (company_id IS NULL OR company_id = '')
              AND is_active = 1
              AND effective_from <= ?
              AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC
            LIMIT 1
          `).get(item.final_master_id, dateStr, dateStr)) as any;

          const priceRow = custPrice || stdPrice;
          if (priceRow) {
            unitPrice = priceRow.unit_price;
            priceSource = custPrice ? 'CUSTOMER_PRICE' : 'STANDARD_PRICE';
            priceStatus = 'READY';
          }
        }

        // 2. Search Self-Learning Knowledge Pool (manual_price_pool)
        if (unitPrice === 0 && item.final_name) {
          const normFinalName = item.final_name.toUpperCase().trim();
          const learnedPrice = (await db.prepare(`
            SELECT * FROM manual_price_pool
            WHERE (
                UPPER(TRIM(item_name)) = ? 
                OR UPPER(TRIM(COALESCE(standard_name, ''))) = ?
              )
              AND unit_price > 0
            ORDER BY 
              CASE WHEN company_id = ? THEN 1 ELSE 2 END,
              approval_count DESC,
              last_used_at DESC
            LIMIT 1
          `).get(normFinalName, normFinalName, qc.company_id)) as any;

          if (learnedPrice) {
            unitPrice = learnedPrice.unit_price;
            priceSource = 'MANUAL_PRICE';
            priceStatus = 'READY';
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
          remark
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

    const discountRate = 0;
    const discountAmount = 0;
    const taxRate = 0.10;
    const taxable = subtotal - discountAmount;
    const taxAmount = Math.round(taxable * taxRate);
    const totalAmount = taxable + taxAmount;

    // Insert Quote
    await db.prepare(`
      INSERT INTO quotes (
        id, quotation_case_id, quote_no, quote_version, company_id, project_id,
        status, currency, subtotal, discount_type, discount_rate, discount_amount,
        tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quoteId, id, quoteNo, quoteVersion, qc.company_id, qc.project_id,
      'DRAFT', 'KRW', subtotal, 'AMOUNT', discountRate, discountAmount,
      taxRate, taxAmount, totalAmount, dateStr, 0, session.userId,
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

    return NextResponse.json({
      success: true,
      quoteId,
      quoteNo,
      quoteVersion,
      subtotal,
      taxAmount,
      totalAmount
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '견적 생성 실패' }, { status: 500 });
  }
}
