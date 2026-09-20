import { db } from '../src/lib/db';

async function main() {
  for (const caseId of ['case_1789766302590', 'case_1789894718545']) {
    const count = await db.prepare(`SELECT count(*) as cnt FROM part_cost_breakdowns WHERE quotation_case_id = ?`).get(caseId) as any;
    console.log(`part_cost_breakdowns in ${caseId}:`, count?.cnt);
    if (count?.cnt > 0) {
      const sample = await db.prepare(`SELECT * FROM part_cost_breakdowns WHERE quotation_case_id = ? LIMIT 2`).all(caseId) as any[];
      console.log(`Sample in ${caseId}:`, sample);
    }
  }
}

main().catch(console.error);
