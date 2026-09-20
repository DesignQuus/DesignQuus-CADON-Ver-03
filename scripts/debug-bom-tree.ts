import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. drawing_relationships 확인
  const rels = await executeSQL(`SELECT * FROM drawing_relationships WHERE quotation_case_id = '${caseId}'`);
  console.log(`drawing_relationships 건수: ${rels.rows?.length}`);

  // 2. drawings 확인
  const dwgs = await executeSQL(`SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type FROM drawings WHERE quotation_case_id = '${caseId}'`);
  console.log(`drawings 건수: ${dwgs.rows?.length}`);

  // 3. normalized_bom_items 확인
  const boms = await executeSQL(`SELECT * FROM normalized_bom_items WHERE quotation_case_id = '${caseId}'`);
  console.log(`normalized_bom_items 건수: ${boms.rows?.length}`);

  // 4. BOM 아이템 중 drawing_id가 매칭되지 않는 항목들(구매품 등)
  const matchedDwgIds = new Set(dwgs.rows?.map((d: any) => d.drawing_name_raw.toUpperCase()));
  const unmat = boms.rows?.filter((b: any) => !matchedDwgIds.has((b.raw_name || '').toUpperCase()));
  console.log(`도면과 이름 미매칭 BOM 항목: ${unmat?.length}건`);
  console.log('미매칭 항목 샘플:', unmat?.slice(0, 15).map((u: any) => ({ name: u.raw_name, qty: u.quantity, spec: u.spec_candidate })));
}

main().catch(console.error);
