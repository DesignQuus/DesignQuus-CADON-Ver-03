import { db } from '../src/lib/db';

async function checkCaseFinalBom() {
  const caseId = 'case_1789766302590';
  const rows = await db.prepare(`
    SELECT id, final_name, final_master_code, approval_status, final_quantity
    FROM final_bom_items
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`case final_bom_items 총 건수: ${rows.length}건`);
  const approved = rows.filter(r => r.approval_status === 'APPROVED');
  console.log(`승인(APPROVED) 건수: ${approved.length}건`);
}

checkCaseFinalBom().catch(console.error);
