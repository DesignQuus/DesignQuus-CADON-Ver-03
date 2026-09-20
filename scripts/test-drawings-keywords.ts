import { db } from '../src/lib/db';

async function testDrawingsKeywords() {
  for (const cid of ['case_1789766302590', 'case_1789894718545']) {
    const items = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ?').all(cid)) as any[];
    console.log(`\n=== Case: ${cid} (total ${items.length} drawings) ===`);
    let diffCount = 0;
    for (const item of items) {
      const name = (item.drawing_name_raw || '').toUpperCase().trim();
      const dwg = (item.drawing_no_raw || item.drawing_no_normalized || '').toUpperCase().trim();

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
        console.log(`Diff Drawing: ${item.id} | Name: "${item.drawing_name_raw}" | Dwg: "${dwg}" | old: ${oldIsAssy} -> new: ${newIsAssy}`);
      }
    }
    console.log(`Case ${cid} total diffs: ${diffCount}`);
  }
}

testDrawingsKeywords().catch(console.error);
