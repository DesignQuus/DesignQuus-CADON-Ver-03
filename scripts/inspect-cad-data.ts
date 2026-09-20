import { queryTable } from '../egdesk-helpers';

async function main() {
  const pr = await queryTable('cad_parse_runs', { limit: 5 });
  console.log('cad_parse_runs count:', pr.rows?.length);
  if (pr.rows && pr.rows.length > 0) {
    console.log('cad_parse_runs[0]:', {
      id: pr.rows[0].id,
      source_file_id: pr.rows[0].source_file_id,
      total_entities: pr.rows[0].total_entities,
      global_bounds_json: pr.rows[0].global_bounds_json,
      entity_counts_json: pr.rows[0].entity_counts_json
    });
  }

  const dwg = await queryTable('drawings', { limit: 5 });
  console.log('drawings count:', dwg.rows?.length);
  if (dwg.rows && dwg.rows.length > 0) {
    console.log('drawings[0]:', {
      id: dwg.rows[0].id,
      drawing_no_normalized: dwg.rows[0].drawing_no_normalized,
      drawing_name_normalized: dwg.rows[0].drawing_name_normalized,
      material: dwg.rows[0].material,
      drawing_type: dwg.rows[0].drawing_type,
      frame_bbox_json: dwg.rows[0].frame_bbox_json,
      title_block_bbox_json: dwg.rows[0].title_block_bbox_json
    });
  }

  const bom = await queryTable('normalized_bom_items', { limit: 5 });
  console.log('normalized_bom_items count:', bom.rows?.length);
  if (bom.rows && bom.rows.length > 0) {
    console.log('bom_items[0]:', {
      id: bom.rows[0].id,
      raw_name: bom.rows[0].raw_name,
      spec_candidate: bom.rows[0].spec_candidate,
      material_candidate: bom.rows[0].material_candidate,
      quantity: bom.rows[0].quantity
    });
  }
}

main().catch(console.error);
