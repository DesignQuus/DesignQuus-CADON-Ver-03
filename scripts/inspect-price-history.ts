import { queryTable } from '../egdesk-helpers';

async function main() {
  const ph = await queryTable('price_history_v2', { limit: 5 });
  console.log('price_history_v2 sample:', ph.rows);
}

main().catch(console.error);
