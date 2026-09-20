import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const res = await executeSQL(`
    SELECT b.raw_name, b.normalized_name, b.spec_candidate, b.quantity
    FROM normalized_bom_items b
    LEFT JOIN drawings d ON b.raw_name = d.drawing_name_raw AND d.quotation_case_id = '${caseId}'
    WHERE b.quotation_case_id = '${caseId}'
      AND d.id IS NULL
      AND b.raw_name NOT LIKE '%조립%'
      AND b.raw_name NOT LIKE '%CHAIN DRIVE%'
  `);
  const rows = res.rows || [];
  console.log(`순수 구매품 건수: ${rows.length}건, 총수량: ${rows.reduce((acc: number, r: any) => acc + (r.quantity || 1), 0)} EA`);
  console.table(rows);
}

main().catch(console.error);
