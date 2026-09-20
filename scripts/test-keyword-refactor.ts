import { db } from '../src/lib/db';

async function testKeywords() {
  for (const cid of ['case_1789766302590', 'case_1789894718545']) {
    const items = (await db.prepare('SELECT * FROM final_bom_items WHERE quotation_case_id = ?').all(cid)) as any[];
    console.log(`\n=== Case: ${cid} (total ${items.length} items) ===`);
    let diffCount = 0;
    for (const item of items) {
      const name = (item.final_name || '').toUpperCase().trim();
      const dwg = (item.final_master_code || '').toUpperCase().trim();

      // 기존 로직:
      const oldIsAssy = 
        item.drawing_type === 'MAIN_ASSEMBLY' || 
        item.drawing_type === 'SUB_ASSEMBLY' || 
        dwg.endsWith('-000') ||
        name.includes('조립도') || 
        name.includes('CHAIN DRIVE') || 
        name.includes('LINE');

      // 새 로직: (하드코딩 키워드 제거, 표준 정규식 적용)
      const newIsAssy = 
        item.drawing_type === 'MAIN_ASSEMBLY' || 
        item.drawing_type === 'SUB_ASSEMBLY' || 
        dwg.endsWith('-000') ||
        dwg.endsWith('-00-000') ||
        name.includes('조립') || 
        name.includes('ASSEMBLY') || 
        name.includes('ASSY') || 
        name.includes('UNIT');

      if (oldIsAssy !== newIsAssy) {
        diffCount++;
        console.log(`Diff Item ID: ${item.id} | Name: "${item.final_name}" | Dwg: "${dwg}" | old(isAssy): ${oldIsAssy} -> new(isAssy): ${newIsAssy}`);
      }
    }
    console.log(`Case ${cid} total diffs: ${diffCount}`);
  }
}

testKeywords().catch(console.error);
