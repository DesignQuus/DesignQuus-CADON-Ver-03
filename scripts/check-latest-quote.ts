import { db } from '../src/lib/db';

async function checkLatestQuote() {
  const caseId = 'case_1789766302590';
  const quotes = (await db.prepare('SELECT id, quote_no, subtotal, tax_amount, total_amount FROM quotes WHERE quotation_case_id = ? ORDER BY created_at DESC').all(caseId)) as any[];
  console.log('Case 1 Quote Count:', quotes.length);
  if (quotes.length > 0) {
    const q = quotes[0];
    console.log('Latest Quote:', q);
    const inc = (await db.prepare('SELECT count(*) as cnt, sum(amount) as sum_amt FROM quote_items WHERE quote_id = ? AND is_included = 1').get(q.id)) as any;
    const exc = (await db.prepare('SELECT count(*) as cnt FROM quote_items WHERE quote_id = ? AND is_included = 0').get(q.id)) as any;
    console.log(`- 견적 포함 품목: ${inc.cnt}건 (공급가 합계: ₩${Number(inc.sum_amt || 0).toLocaleString()})`);
    console.log(`- 견적 제외 품목: ${exc.cnt}건`);
  }
}

checkLatestQuote().catch(console.error);
