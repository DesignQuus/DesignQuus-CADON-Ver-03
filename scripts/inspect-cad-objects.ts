import { queryTable } from '../egdesk-helpers';

async function main() {
  const co = await queryTable('cad_objects', { limit: 10 });
  console.log('cad_objects sample:', co.rows?.map(c => ({
    id: c.id,
    parse_run_id: c.parse_run_id,
    entity_type: c.entity_type,
    layer: c.layer,
    raw_text: c.raw_text,
    bounding_box_json: c.bounding_box_json
  })));
}

main().catch(console.error);
