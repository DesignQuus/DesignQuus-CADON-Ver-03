import { executeSQL } from '../egdesk-helpers';

async function main() {
  const res = await executeSQL('PRAGMA table_info(part_fabrication_features)');
  console.log('table_info:', res.rows);
}

main().catch(console.error);
