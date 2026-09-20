import { executeSQL } from '../egdesk-helpers';

async function main() {
  const d = await executeSQL('SELECT quotation_case_id, COUNT(*) as cnt, COUNT(DISTINCT drawing_no_normalized) as unique_dwgs FROM drawings GROUP BY quotation_case_id');
  console.log('=== drawings distribution ===');
  console.table(d.rows);

  const cad = await executeSQL('SELECT parse_run_id, COUNT(*) as cnt FROM cad_objects GROUP BY parse_run_id');
  console.log('=== cad_objects distribution ===');
  console.table(cad.rows);

  const ba = await executeSQL('SELECT quotation_case_id, COUNT(*) as cnt FROM bom_areas GROUP BY quotation_case_id');
  console.log('=== bom_areas distribution ===');
  console.table(ba.rows);

  const runs = await executeSQL('SELECT id, source_file_id, total_entities, created_at FROM cad_parse_runs');
  console.log('=== cad_parse_runs ===');
  console.table(runs.rows);
}

main().catch(console.error);
