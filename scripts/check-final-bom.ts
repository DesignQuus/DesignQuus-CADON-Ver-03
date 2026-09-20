import { db } from '../src/lib/db';

async function checkFinalBomSchema() {
  const row = await db.prepare(`SELECT * FROM final_bom_items LIMIT 1`).get();
  console.log('final_bom_items sample row:', row);
}

checkFinalBomSchema().catch(console.error);
