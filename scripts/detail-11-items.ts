import { db } from '../src/lib/db';

async function detail11Items() {
  const caseId = 'case_1789766302590';
  const p5Ids = [
    'final_norm_case_1789766302590_118', // 2.P N / 24V
    'final_norm_case_1789766302590_119', // = 모터 : F3S25N60 MM02TWNTN
    'final_norm_case_1789766302590_122', // MISUMI / BACKING PLATE
    'final_norm_case_1789766302590_123', // ITOH / C-001
    'final_norm_case_1789766302590_124', // CDQ2B63 25DMZ A93L
    'final_norm_case_1789766302590_127', // DV2 006
    'final_norm_case_1789766302590_128', // DV3 006
    'final_norm_case_1789766302590_129', // FLOATING JOINT
    'final_norm_case_1789766302590_130', // FR381BW 390
    'final_norm_case_1789766302590_131', // FR381BW 355
    'final_norm_case_1789766302590_133'  // LMF16UU
  ];

  for (const id of p5Ids) {
    const fbi = (await db.prepare('SELECT * FROM final_bom_items WHERE id = ?').get(id)) as any;
    const norm = (await db.prepare('SELECT * FROM normalized_bom_items WHERE id = ?').get(fbi.normalized_item_id)) as any;
    const raw = norm ? (await db.prepare('SELECT * FROM raw_bom_items WHERE id = ?').get(norm.raw_item_id)) as any : null;

    // 도면 검색: 전체 drawings 중에서 도번 일치 또는 유사 검색
    const dwgs = (await db.prepare(`
      SELECT id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, material, drawing_type
      FROM drawings
      WHERE quotation_case_id = ?
        AND (
          drawing_no_normalized LIKE ? OR drawing_no_raw LIKE ?
          OR drawing_name_raw LIKE ?
        )
    `).all(
      caseId,
      `%${fbi.final_master_code}%`, `%${fbi.final_master_code}%`,
      `%${fbi.final_name}%`
    )) as any[];

    console.log(`\n========================================`);
    console.log(`[Item ID: ${fbi.id}]`);
    console.log(`- Final BOM: name="${fbi.final_name}", master_code="${fbi.final_master_code}", spec="${fbi.final_spec}", mat="${fbi.final_material}", qty=${fbi.final_quantity}`);
    if (raw) {
      console.log(`- Raw BOM 원문:`);
      console.log(`  drawing_no: "${raw.drawing_no}"`);
      console.log(`  part_no_raw: "${raw.part_no_raw}"`);
      console.log(`  name_raw: "${raw.name_raw}"`);
      console.log(`  specification_raw: "${raw.specification_raw}"`);
      console.log(`  material_raw: "${raw.material_raw}"`);
      console.log(`  quantity_raw: "${raw.quantity_raw}" (numeric: ${raw.quantity_numeric})`);
      console.log(`  remark_raw: "${raw.remark_raw}"`);
    }
    console.log(`- 매칭 도면 (${dwgs.length}건):`);
    dwgs.forEach(d => console.log(`  -> [${d.drawing_no_normalized}] ${d.drawing_name_raw} | 재질: ${d.material} | 타입: ${d.drawing_type}`));
  }
}

detail11Items().catch(console.error);
