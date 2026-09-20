import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // drawing_relationships
  const relsRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no, relationship_type
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const rels = relsRes.rows || [];

  // drawings
  const dwgsRes = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);
  const dwgs = dwgsRes.rows || [];
  const dwgMap = new Map(dwgs.map((d: any) => [d.drawing_no_normalized, d]));

  // parent -> children
  const parentMap = new Map<string, string[]>();
  const allChildren = new Set<string>();
  const allParents = new Set<string>();

  for (const r of rels) {
    if (!parentMap.has(r.parent_drawing_no)) parentMap.set(r.parent_drawing_no, []);
    parentMap.get(r.parent_drawing_no)!.push(r.child_drawing_no);
    allChildren.add(r.child_drawing_no);
    allParents.add(r.parent_drawing_no);
  }

  const rootCandidates = Array.from(allParents).filter(p => !allChildren.has(p));
  console.log('루트 후보:', rootCandidates);

  // normalized_bom_items 에서 부품별 수량 파악
  const bomRes = await executeSQL(`
    SELECT raw_name, normalized_name, quantity
    FROM normalized_bom_items
    WHERE quotation_case_id = '${caseId}'
  `);
  console.log(`BOM 항목 수: ${bomRes.rows?.length}`);

  // 각 부품이 트리에서 몇 번 등장하는지
  const childCounts = new Map<string, number>();
  for (const r of rels) {
    childCounts.set(r.child_drawing_no, (childCounts.get(r.child_drawing_no) || 0) + 1);
  }

  console.log(`고유 자식 도번 수: ${childCounts.size}`);
  const multiReferenced = Array.from(childCounts.entries()).filter(([k, v]) => v > 1);
  console.log(`다중 참조 자식 도번 수: ${multiReferenced.length}건`);
  console.log('다중 참조 샘플:', multiReferenced.slice(0, 10));
}

main().catch(console.error);
