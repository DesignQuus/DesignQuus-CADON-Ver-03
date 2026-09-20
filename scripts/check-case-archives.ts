import { db } from '../src/lib/db';

async function main() {
  const allTables = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
  const hasArchives = allTables.some(t => t.name === 'case_archives');
  console.log('Does case_archives exist?', hasArchives);

  if (hasArchives) {
    const sample = await db.prepare(`SELECT * FROM case_archives LIMIT 1`).get() as any;
    console.log('case_archives keys:', Object.keys(sample || {}));
    const count = await db.prepare(`SELECT count(*) as cnt FROM case_archives`).get() as any;
    console.log('case_archives current count:', count.cnt);
  }
}

main().catch(console.error);
