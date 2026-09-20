import { db } from '../src/lib/db';

async function checkSchema() {
  const runs = await db.prepare(`SELECT * FROM cad_parse_runs LIMIT 1`).all();
  console.log('cad_parse_runs sample:', runs);
}

checkSchema().catch(console.error);
