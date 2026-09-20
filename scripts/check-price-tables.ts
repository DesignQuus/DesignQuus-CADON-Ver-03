import { db } from '../src/lib/db';

async function main() {
  console.log('--- 1. Check if historical_price_records table exists ---');
  const allTables = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
  const tableNames = allTables.map(t => t.name);
  console.log('Total tables count:', tableNames.length);
  const hasHistorical = tableNames.includes('historical_price_records');
  console.log('Does historical_price_records exist in DB?', hasHistorical);

  console.log('\n--- 2. Check price-related tables in DB ---');
  const priceTables = tableNames.filter(t => t.toLowerCase().includes('price'));
  console.log('Price related tables:', priceTables);

  console.log('\n--- 3. Check price_history_v2 columns and data ---');
  if (tableNames.includes('price_history_v2')) {
    const sample = await db.prepare(`SELECT * FROM price_history_v2 LIMIT 1`).get() as any;
    console.log('price_history_v2 keys:', Object.keys(sample || {}));
    
    const count = await db.prepare(`SELECT count(*) as cnt FROM price_history_v2`).get() as any;
    console.log('price_history_v2 row count:', count.cnt);

    const basisTypes = await db.prepare(`
      SELECT price_basis_type, count(*) as cnt 
      FROM price_history_v2 
      GROUP BY price_basis_type
    `).all() as any[];
    console.log('price_history_v2 price_basis_type distribution:', basisTypes);
  }

  console.log('\n--- 4. Check price_masters and manual_price_pool if exists ---');
  if (tableNames.includes('price_masters')) {
    const count = await db.prepare(`SELECT count(*) as cnt FROM price_masters`).get() as any;
    console.log('price_masters row count:', count.cnt);
  }
  if (tableNames.includes('manual_price_pool')) {
    const count = await db.prepare(`SELECT count(*) as cnt FROM manual_price_pool`).get() as any;
    console.log('manual_price_pool row count:', count.cnt);
  }
}

main().catch(console.error);
