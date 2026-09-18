import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { queryTable, updateRows, insertRows } from '@/../egdesk-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const body = await request.json();
    const { lineId, partKey, isConfirmed, unitPrice, unitCost, qtyTier, lotQuantity, basis } = body;

    const now = new Date().toISOString();

    // 1. BOM 행 상태 및 단가 업데이트 (normalized_bom_items 및 quote_items 동시 지원)
    if (lineId) {
      // quote_items 테이블 업데이트 시도
      try {
        const qi = (await db.prepare('SELECT id, quantity FROM quote_items WHERE id = ?').get(lineId)) as any;
        if (qi) {
          const qty = Number(qi.quantity) || 1;
          const amt = (Number(unitPrice) || 0) * qty;
          await db.prepare(`
            UPDATE quote_items
            SET unit_price = ?, amount = ?, price_status = ?, is_included = ?, price_source = 'MANUAL_REVIEW'
            WHERE id = ?
          `).run(unitPrice || 0, amt, isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW', isConfirmed ? 1 : 0, lineId);
        }
      } catch (e) {
        console.warn('quote_items update note:', e);
      }

      // normalized_bom_items 테이블 업데이트 시도
      try {
        await updateRows('normalized_bom_items', {
          filters: { id: lineId },
          updates: {
            status: isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW',
            approval_status: isConfirmed ? 'APPROVED' : 'NEEDS_REVIEW',
            is_quote_included: isConfirmed ? 1 : 0,
            updated_at: now
          }
        });
      } catch (e) {
        console.warn('normalized_bom_items update note:', e);
      }
    }

    // 2. 확정 시 price_history_v2 에 단가 이력 및 PRICE_BASIS 축적 (자가 학습 루프)
    if (isConfirmed && unitPrice > 0) {
      const historyId = `prc_v2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await insertRows('price_history_v2', [
        {
          id: historyId,
          part_master_id: lineId,
          part_key: partKey || `UNKNOWN:${lineId}`,
          quotation_case_id: caseId,
          qty_tier: qtyTier || '10~99',
          lot_quantity: lotQuantity || 1,
          material_cost: unitCost ? Math.round(unitCost * 0.45) : Math.round(unitPrice * 0.35),
          process_cost: unitCost ? Math.round(unitCost * 0.55) : Math.round(unitPrice * 0.45),
          subtotal_cost: unitCost || Math.round(unitPrice * 0.82),
          margin_rate: 0.18,
          unit_price: unitPrice,
          material_base_date: new Date().toISOString().substring(0, 10),
          price_basis_type: basis?.basisType || 'MANUAL',
          basis_calc_json: JSON.stringify(basis || {}),
          is_ordered: 0,
          confirmed_by: '검토자',
          effective_from: new Date().toISOString().substring(0, 10),
          created_at: now
        }
      ]);
    }

    return NextResponse.json({
      success: true,
      message: isConfirmed ? '단가가 확정되어 MASTER DB에 축적되었습니다.' : '확정이 취소되었습니다.',
      isConfirmed
    });
  } catch (err: any) {
    console.error('Confirm line API error:', err);
    return NextResponse.json({ error: err.message || '단가 확정 처리 실패' }, { status: 500 });
  }
}
