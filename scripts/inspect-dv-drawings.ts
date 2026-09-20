import { db } from '../src/lib/db';

async function inspectDvDrawings() {
  const caseId = 'case_1789766302590';
  console.log(`=== DV2-006 및 DV3-001 실측 정밀 분석 ===\n`);

  for (const code of ['DV2-006', 'DV3-001']) {
    console.log(`================================================================`);
    console.log(`>>> 대상 도번: ${code} <<<`);

    // 1. drawings 테이블 정보
    const dwg = (await db.prepare(`
      SELECT * FROM drawings 
      WHERE quotation_case_id = ? AND (drawing_no_normalized LIKE ? OR drawing_no_raw LIKE ?)
    `).get(caseId, `%${code}%`, `%${code}%`)) as any;

    if (dwg) {
      console.log(`[1. Drawings 정보]`);
      console.log(`- id: ${dwg.id}`);
      console.log(`- drawing_no_raw: "${dwg.drawing_no_raw}"`);
      console.log(`- drawing_no_normalized: "${dwg.drawing_no_normalized}"`);
      console.log(`- drawing_name_raw: "${dwg.drawing_name_raw}"`);
      console.log(`- material: "${dwg.material}"`);
      console.log(`- drawing_type: "${dwg.drawing_type}"`);
      console.log(`- title_block_raw_text: "${dwg.title_block_raw_text || '-'}"`);
    } else {
      console.log(`[1. Drawings 정보] 도면 없음!`);
    }

    // 2. 해당 도면의 cad_objects 치수(DIMENSION) 엔티티 조사
    if (dwg) {
      const parseRun = (await db.prepare('SELECT id FROM cad_parse_runs WHERE source_file_id = ?').get(dwg.source_file_id)) as any;
      const fb = dwg.frame_bbox_json ? JSON.parse(dwg.frame_bbox_json) : null;
      
      const dims = (await db.prepare(`
        SELECT layer, raw_text FROM cad_objects
        WHERE parse_run_id = ? AND (layer LIKE '%DIM%' OR entity_type LIKE '%DIM%')
      `).all(parseRun ? parseRun.id : '')) as any[];

      console.log(`\n[2. CAD 객체 내 치수(DIMENSION) 존재 여부]`);
      console.log(`- 전체 DIMENSION 레이어 객체 수: ${dims.length}개`);
      const sampleDims = dims.slice(0, 8).map(d => d.raw_text).filter(Boolean);
      console.log(`- 치수선 텍스트 샘플:`, sampleDims);
    }

    // 3. part_fabrication_features 정보
    if (dwg) {
      const feat = (await db.prepare('SELECT * FROM part_fabrication_features WHERE drawing_id = ?').get(dwg.id)) as any;
      if (feat) {
        console.log(`\n[3. 가공 피처(part_fabrication_features) 정보]`);
        console.log(`- feature_id: ${feat.id}`);
        console.log(`- process_type: ${feat.process_type}`);
        console.log(`- material_code: ${feat.material_code}`);
        console.log(`- bbox: ${feat.bbox_width} x ${feat.bbox_length} x ${feat.bbox_thickness} mm`);
        console.log(`- part_weight_kg: ${feat.part_weight_kg} kg`);
        console.log(`- raw_features_json: ${feat.raw_features_json}`);
      }
    }

    // 4. BOM (raw_bom_items, normalized_bom_items, final_bom_items) 정보
    const fbi = (await db.prepare(`
      SELECT * FROM final_bom_items WHERE quotation_case_id = ? AND (final_master_code = ? OR final_name LIKE ?)
    `).get(caseId, code, `%${code}%`)) as any;

    if (fbi) {
      console.log(`\n[4. BOM 매칭 정보]`);
      console.log(`- final_bom_items ID: ${fbi.id}`);
      console.log(`- final_name: "${fbi.final_name}"`);
      console.log(`- final_master_code: "${fbi.final_master_code}"`);
      console.log(`- final_spec: "${fbi.final_spec}"`);
      console.log(`- final_material: "${fbi.final_material}"`);
      console.log(`- final_quantity: ${fbi.final_quantity}`);
    }

    // 5. 왜 구매품(5순위 NOT_FOUND)으로 빠졌었는가? (원인 규명)
    console.log(`\n[5. 5순위(NOT_FOUND) 분류 원인]`);
    console.log(`- create-quote/route.ts는 drawings.drawing_no_raw = BOM.part_no 로 조인함.`);
    console.log(`- 도면 측 도번: "${dwg?.drawing_no_raw}" (또는 "${dwg?.drawing_no_normalized}")`);
    console.log(`- BOM 측 도번: "${fbi?.final_master_code}"`);
    console.log(`- 일치 여부: "${dwg?.drawing_no_raw}" === "${fbi?.final_master_code}" -> FALSE! (240314- 접두사 차이)`);
    console.log(`- 결과: 조인 실패로 인해 원가 엔진(part_cost_breakdowns)을 조회하지 못하고 5순위 NOT_FOUND로 떨어짐!`);
  }
}

inspectDvDrawings().catch(console.error);
