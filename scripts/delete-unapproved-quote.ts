import { db } from '../src/lib/db';

async function rollbackQuote() {
  const quote = (await db.prepare('SELECT id, quote_no FROM quotes WHERE quote_no = ?').get('Q-20260918-002-V1')) as any;
  if (quote) {
    await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(quote.id);
    await db.prepare('DELETE FROM quotes WHERE id = ?').run(quote.id);
    console.log(`SUCCESS: Quote ${quote.quote_no} and its items completely deleted.`);
  } else {
    console.log('Quote Q-20260918-002-V1 already not in DB.');
  }
}

rollbackQuote().catch(console.error);
