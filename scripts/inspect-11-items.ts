import { db } from '../src/lib/db';

async function inspect11Items() {
  const caseId = 'case_1789766302590';
  console.log(`=== 11개 5순위 품목 도면 및 표제란 원문 정밀 조사 ===\n`);

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

  for (const fbiId of p5Ids) {
    const fbi = (await db.prepare('SELECT * FROM final_bom_items WHERE id = ?').get(fbiId)) as any;
    if (!fbi) continue;

    const normId = fbi.normalized_item_id;
    const norm = (await db.prepare('SELECT * FROM normalized_bom_items WHERE id = ?').get(normId)) as any;
    const raw = norm ? (await db.prepare('SELECT * FROM raw_bom_items WHERE id = ?').get(norm.raw_item_id)) as any : null;

    // drawings 테이블에서 도번 일치 검색
    const dwgMatch = (await db.prepare(`
      SELECT id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_type, material, is_quote_included
      FROM drawings
      WHERE quotation_case_id = ?
        AND (
          drawing_no_raw LIKE ? OR drawing_no_normalized LIKE ?
          OR drawing_name_raw LIKE ? OR drawing_name_normalized LIKE ?
        )
    `).all(
      caseId,
      `%${fbi.final_master_code}%`, `%${fbi.final_master_code}%`,
      `%${fbi.final_name}%`, `%${fbi.final_name}%`
    )) as any[];

    // part_fabrication_features 테이블에서 피처 일치 검색
    const featMatch = (await db.prepare(`
      SELECT f.id, f.drawing_id, f.material_code, f.bbox_width, f.bbox_length, f.bbox_thickness, f.part_weight_kg,
             d.drawing_no_normalized, d.drawing_name_raw
      FROM part_fabrication_features f
      JOIN drawings d ON f.drawing_id = d.id
      WHERE f.quotation_case_id = ?
        AND (
          d.drawing_no_normalized LIKE ? OR d.drawing_no_raw LIKE ?
          OR d.drawing_name_raw LIKE ?
        )
    `).all(
      caseId,
      `%${fbi.final_master_code}%`, `%${fbi.final_master_code}%`,
      `%${fbi.final_name}%`
    )) as any[];

    console.log(`--------------------------------------------------`);
    console.log(`[품목 ID: ${fbi.id}]`);
    console.log(`- final_name: "${fbi.final_name}" | final_master_code: "${fbi.final_master_code}"`);
    console.log(`- final_spec: "${fbi.final_spec}" | final_material: "${fbi.final_material}" | Qty: ${fbi.final_quantity}`);
    if (raw) {
      console.log(`- Raw BOM: part_no="${raw.part_no_raw}", name="${raw.name_raw}", spec="${raw.specification_raw}", mat="${raw.material_raw}", drawing_no="${raw.drawing_no}"`);
    }
    console.log(`- 매칭된 Drawings (${dwgMatch.length}건):`, dwgMatch.map(d => `[${d.drawing_no_normalized}] ${d.drawing_name_raw} (${d.material}, ${d.drawing_type})`));
    console.log(`- 매칭된 Features (${featMatch.length}건):`, featMatch.map(f => `feat: ${f.id} [${f.drawing_no_normalized}] w:${f.bbox_width}, l:${f.bbox_length}, t:${f.bbox_thickness}, wt:${f.part_weight_kg}kg`));
  }
}

inspect11Items().catch(console.error);
