import { executeSQL } from '../egdesk-helpers';

async function main() {
  const parseRunId = 'parse_1789766345349';
  const sql = `SELECT entity_type, count(*) as cnt FROM cad_objects WHERE parse_run_id = '${parseRunId}' GROUP BY entity_type ORDER BY cnt DESC`;
  const res = await executeSQL(sql);
  console.log('Entities in parse run:', res.rows);
}

main().catch(console.error);
