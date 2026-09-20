import { db } from '../src/lib/db';

async function main() {
  const confirmed = await db.prepare(`
    SELECT 
      count(CASE WHEN confirmed_by IS NOT NULL THEN 1 END) as confirmed_count,
      count(CASE WHEN confirmed_by IS NULL THEN 1 END) as null_confirmed_count
    FROM price_history_v2
  `).get() as any;
  console.log('price_history_v2 confirmed_by status:', confirmed);
}

main().catch(console.error);
