import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const oldQuote = (await db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)) as any;
  if (!oldQuote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const oldItems = (await db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY item_no ASC').all(id)) as any[];
    const newVersion = oldQuote.quote_version + 1;
    const newQuoteNo = `${oldQuote.quote_no.split('-V')[0]}-V${newVersion}`;
    const newQuoteId = `quote_${Date.now()}`;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO quotes (
        id, quotation_case_id, quote_no, quote_version, company_id, project_id,
        status, currency, subtotal, discount_type, discount_rate, discount_amount,
        tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newQuoteId, oldQuote.quotation_case_id, newQuoteNo, newVersion, oldQuote.company_id,
      oldQuote.project_id, 'DRAFT', oldQuote.currency, oldQuote.subtotal, oldQuote.discount_type,
      oldQuote.discount_rate, oldQuote.discount_amount, oldQuote.tax_rate, oldQuote.tax_amount,
      oldQuote.total_amount, now.slice(0, 10), 0, session.userId, now, now
    );

    for (const oi of oldItems) {
      await db.prepare(`
        INSERT INTO quote_items (
          id, quote_id, final_bom_item_id, master_id, item_no, master_code,
          item_name, specification, material, quantity, unit, unit_price,
          amount, price_source, price_status, remark, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `qitem_${newQuoteId}_${oi.item_no}`, newQuoteId, oi.final_bom_item_id, oi.master_id,
        oi.item_no, oi.master_code, oi.item_name, oi.specification, oi.material,
        oi.quantity, oi.unit, oi.unit_price, oi.amount, oi.price_source, oi.price_status,
        oi.remark, now
      );
    }

    return NextResponse.json({ success: true, newQuoteId, newQuoteNo, newVersion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '견적 버전 복제 실패' }, { status: 500 });
  }
}
