import { db } from '../src/lib/db';

async function main() {
  for (const caseId of ['case_1789766302590', 'case_1789894718545']) {
    const finalCnt = await db.prepare(`SELECT count(*) as cnt FROM final_bom_items WHERE quotation_case_id = ?`).get(caseId) as any;
    console.log(`final_bom_items count in ${caseId}:`, finalCnt?.cnt);
  }
}

main().catch(console.error);
