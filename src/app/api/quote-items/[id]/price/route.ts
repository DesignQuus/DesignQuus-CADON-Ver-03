import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { checkCasePermission } from '@/lib/permissions';
import { learnOrUpdateMaterialPrice } from '@/lib/self-learning';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const item = (await db.prepare('SELECT * FROM quote_items WHERE id = ?').get(id)) as any;
  if (!item) {
    return NextResponse.json({ error: '견적 품목을 찾을 수 없습니다.' }, { status: 404 });
  }

  const quote = (await db.prepare('SELECT * FROM quotes WHERE id = ?').get(item.quote_id)) as any;
  let wasUnlocked = false;
  if (quote.is_locked) {
    // Auto-unlock quote to DRAFT for seamless price modification
    await db.prepare("UPDATE quotes SET is_locked = 0, status = 'DRAFT', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), quote.id);
    wasUnlocked = true;
  }

  // Permission Guard
  const perm = await checkCasePermission(session.userId, session.role, quote.quotation_case_id);
  if (!perm.canEdit) {
    return NextResponse.json({
      error: perm.message || '해당 견적건의 단가를 수정할 권한이 없습니다. 최고관리자의 승인이 필요합니다.',
      requiresApproval: perm.requiresApproval,
      approvalStatus: perm.approvalStatus
    }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { unitPrice, remark, isIncluded, applyToSameItems, priceSource, masterId, masterCode } = body;
    const newPrice = Number(unitPrice);
    const newAmount = Math.round(item.quantity * newPrice);
    // Automatically set is_included = 1 when price is set or when explicitly requested
    const includeFlag = (isIncluded !== undefined) ? (isIncluded ? 1 : 0) : (newPrice > 0 ? 1 : (item.is_included ?? 1));
    const effectiveSource = priceSource || (masterId ? 'PRICE_MASTER' : 'MANUAL_PRICE');

    // Update Primary Quote Item
    await db.prepare(`
      UPDATE quote_items
      SET unit_price = ?, amount = ?, price_source = ?, price_status = 'READY', remark = ?, is_included = ?,
          master_id = COALESCE(?, master_id), master_code = COALESCE(?, master_code)
      WHERE id = ?
    `).run(newPrice, newAmount, effectiveSource, remark || item.remark || (effectiveSource === 'PRICE_MASTER' ? '마스터 단가 적용' : '수기 단가 입력'), includeFlag, masterId || null, masterCode || null, id);

    // Optionally apply to identical items in the same quote
    const updatedIds = [id];
    if (applyToSameItems) {
      const sameItems = (await db.prepare(`
        SELECT id, quantity FROM quote_items
        WHERE quote_id = ? AND item_name = ? AND id != ?
      `).all(quote.id, item.item_name, id)) as any[];

      for (const s of sameItems) {
        const sAmount = Math.round(s.quantity * newPrice);
        await db.prepare(`
          UPDATE quote_items
          SET unit_price = ?, amount = ?, price_source = ?, price_status = 'READY', remark = ?, is_included = ?,
              master_id = COALESCE(?, master_id), master_code = COALESCE(?, master_code)
          WHERE id = ?
        `).run(newPrice, sAmount, effectiveSource, remark || item.remark || (effectiveSource === 'PRICE_MASTER' ? '마스터 단가 적용' : '수기 단가 적용'), includeFlag, masterId || null, masterCode || null, s.id);
        updatedIds.push(s.id);
      }
    }

    // 수기 단가 풀(manual_price_pool)에 지능형 자가학습 누적 등록
    if (newPrice > 0) {
      try {
        await learnOrUpdateMaterialPrice({
          companyId: quote.company_id,
          rawName: item.item_name,
          standardName: item.item_name,
          specification: item.specification || '',
          rawMaterial: item.material || '',
          standardMaterial: item.material || '',
          unitPrice: newPrice,
          remark: remark || (effectiveSource === 'PRICE_MASTER' ? 'Price Master 적용' : '수기 단가 입력'),
          quotationCaseId: quote.quotation_case_id || null,
          userId: session.userId || 'usr_admin',
          source: effectiveSource === 'PRICE_MASTER' ? 'PRICE_MASTER' : 'QUOTE_MANUAL'
        });
      } catch (poolErr) {
        console.warn('learnOrUpdateMaterialPrice failed:', poolErr);
      }
    }

    // Recalculate Quote Totals (only active included items)
    const sumRow = (await db.prepare('SELECT SUM(amount) as subtotal FROM quote_items WHERE quote_id = ? AND is_included = 1').get(quote.id)) as any;
    const subtotal = sumRow?.subtotal || 0;
    const taxRate = quote.tax_rate ?? 0.10;
    const taxAmount = Math.round(subtotal * taxRate);
    const totalAmount = subtotal + taxAmount;

    await db.prepare(`
      UPDATE quotes
      SET subtotal = ?, tax_amount = ?, total_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(subtotal, taxAmount, totalAmount, new Date().toISOString(), quote.id);

    // Audit log: PRICE_UPDATE
    await recordActivity(req, session, {
      activityType: 'PRICE_UPDATE',
      quotationCaseId: quote.quotation_case_id,
      details: `[${item.item_name}] 단가 변경: ${Number(item.unit_price).toLocaleString()}원 → ${newPrice.toLocaleString()}원 (${applyToSameItems ? `동일 품목 ${updatedIds.length}건 일괄 적용` : '1건 적용'})`
    });

    return NextResponse.json({ 
      success: true, 
      subtotal, 
      taxAmount, 
      totalAmount, 
      isIncluded: includeFlag,
      priceSource: effectiveSource,
      wasUnlocked,
      updatedIds 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '단가 수정 실패' }, { status: 500 });
  }
}
