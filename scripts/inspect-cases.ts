import { queryTable } from '../egdesk-helpers';

async function main() {
  const qc = await queryTable('quotation_cases', { limit: 10 });
  console.log('quotation_cases:', qc.rows?.map(r => ({ id: r.id, case_no: r.case_no, name: r.case_name })));

  const bom = await queryTable('normalized_bom_items', { limit: 500 });
  const bomCases = [...new Set(bom.rows?.map(r => r.quotation_case_id))];
  console.log('BOM cases & counts:');
  for (const c of bomCases) {
    const count = bom.rows?.filter(r => r.quotation_case_id === c).length;
    console.log(` - ${c}: ${count} rows`);
  }

  const dwg = await queryTable('drawings', { limit: 500 });
  const dwgCases = [...new Set(dwg.rows?.map(r => r.quotation_case_id))];
  console.log('Drawing cases & counts:');
  for (const c of dwgCases) {
    const count = dwg.rows?.filter(r => r.quotation_case_id === c).length;
    console.log(` - ${c}: ${count} rows`);
  }
}

main().catch(console.error);
