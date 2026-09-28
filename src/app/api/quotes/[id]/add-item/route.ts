import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { insertRows } from '@/../egdesk-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id: caseId } = await params;
    const qc = (await db.prepare('SELECT id, case_no, company_id FROM quotation_cases WHERE id = ?').get(caseId)) as any;
    if (!qc) {
      return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const {
      partNo: rawPartNo,
      partName,
      partType = 'COMMERCIAL',
      specification = '-',
      material = '-',
      quantity = 1,
      unit = 'EA',
      unitPrice = 0,
      unitCost: rawUnitCost,
      remark: rawRemark,
      masterId,
      priceSource = 'MANUAL_INPUT'
    } = body;

    if (!partName || !partName.trim()) {
      return NextResponse.json({ error: '품명을 입력해주세요.' }, { status: 400 });
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const price = Math.max(0, Number(unitPrice) || 0);
    const cost = rawUnitCost !== undefined ? Math.max(0, Number(rawUnitCost) || 0) : Math.round(price * 0.82);
    const partNo = (rawPartNo && rawPartNo.trim()) ? rawPartNo.trim() : `ETC-${Date.now().toString(36).toUpperCase()}`;
    const remark = rawRemark || '[비도면 품목 직접 추가]';
    const now = new Date().toISOString();

    const newFbiId = `fbi_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newNormId = `norm_manual_${Date.now()}`;
    const newQuoteItemId = `qitem_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. final_bom_items 테이블에 추가 (승인 상태로 삽입되어 create-quote 시 자동 집계됨)
    await db.prepare(`
      INSERT INTO final_bom_items (
        id, quotation_case_id, normalized_item_id, final_master_id, final_master_code,
        final_name, final_spec, final_material, final_quantity, final_unit,
        approval_status, approved_by_user_id, approved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
    `).run(
      newFbiId,
      caseId,
      newNormId,
      masterId || null,
      partNo,
      partName.trim(),
      specification || '-',
      material || '-',
      qty,
      unit || 'EA',
      session.userId || 'MANUAL',
      now,
      now
    );

    // 2. 현재 활성 견적서(latest quote)가 있는 경우 quote_items 에 즉시 삽입
    const latestQuote = (await db.prepare(`
      SELECT * FROM quotes 
      WHERE quotation_case_id = ? 
      ORDER BY quote_version DESC 
      LIMIT 1
    `).get(caseId)) as any;

    let createdQuoteItem: any = null;

    if (latestQuote) {
      const maxNoRow = (await db.prepare(`
        SELECT COALESCE(MAX(item_no), 0) as max_no 
        FROM quote_items 
        WHERE quote_id = ?
      `).get(latestQuote.id)) as any;
      const nextItemNo = (maxNoRow?.max_no || 0) + 1;
      const amount = price * qty;

      await db.prepare(`
        INSERT INTO quote_items (
          id, quote_id, final_bom_item_id, master_id, item_no, master_code,
          item_name, specification, material, quantity, unit, unit_price,
          amount, price_source, price_status, drawing_no, remark, is_included, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, 1, ?)
      `).run(
        newQuoteItemId,
        latestQuote.id,
        newFbiId,
        masterId || null,
        nextItemNo,
        partNo,
        partName.trim(),
        specification || '-',
        material || '-',
        qty,
        unit || 'EA',
        price,
        amount,
        priceSource,
        partNo,
        remark,
        now
      );

      // 견적서 헤더 합계 갱신
      await db.prepare(`
        UPDATE quotes 
        SET subtotal = (SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1),
            tax_amount = ROUND((SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1) * 0.1),
            total_amount = ROUND((SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1) * 1.1),
            updated_at = ?
        WHERE id = ?
      `).run(latestQuote.id, latestQuote.id, latestQuote.id, now, latestQuote.id);

      createdQuoteItem = {
        id: newQuoteItemId,
        itemNo: nextItemNo,
        quoteId: latestQuote.id
      };
    }

    // 3. price_history_v2 에 단가 이력 영구 등록 (HUMAN_VERIFIED)
    if (price > 0) {
      try {
        const historyId = `prc_v2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await insertRows('price_history_v2', [
          {
            id: historyId,
            part_master_id: newFbiId,
            part_key: partNo,
            quotation_case_id: caseId,
            qty_tier: qty <= 9 ? '1~9' : qty <= 99 ? '10~99' : '100~',
            lot_quantity: qty,
            material_cost: Math.round(cost * 0.4),
            process_cost: Math.round(cost * 0.6),
            subtotal_cost: cost,
            margin_rate: 0.18,
            unit_price: price,
            material_base_date: now.slice(0, 10),
            price_basis_type: 'HUMAN_VERIFIED',
            is_ordered: 0,
            confirmed_by: session.name || '검토자',
            effective_from: now.slice(0, 10),
            created_at: now
          }
        ]);
      } catch (hErr) {
        console.warn('price_history_v2 insert note:', hErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: '비도면 품목이 견적서에 성공적으로 추가되었습니다.',
      item: {
        id: createdQuoteItem?.id || newFbiId,
        finalBomItemId: newFbiId,
        itemNo: createdQuoteItem?.itemNo || 1,
        partNo,
        partName: partName.trim(),
        partType,
        specification: specification || '-',
        material: material || '-',
        quantity: qty,
        unit: unit || 'EA',
        unitCost: cost,
        supplyPrice: price,
        status: 'CONFIRMED',
        balloonNo: String(createdQuoteItem?.itemNo || 1),
        isAssembly: false,
        isIncluded: true,
        inclusionType: 'INCLUDED',
        priceSource,
        remark
      }
    });
  } catch (err: any) {
    console.error('Add non-drawing item API error:', err);
    return NextResponse.json({ error: err.message || '비도면 품목 추가 처리 실패' }, { status: 500 });
  }
}
