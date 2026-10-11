import { db, getLocalSqlite } from '../src/lib/db';
import { inferPartSpecification, isNoiseSpec } from '../src/lib/part-spec-analyzer';

async function enrichMasterSpecs() {
  console.log('=== AI Part Specification Master DB Enrichment ===\n');

  const rows = (await db.prepare(`
    SELECT id, master_code, standard_name, category, material, specification, unit
    FROM product_masters
  `).all()) as any[];

  console.log(`Total Master Items: ${rows.length}`);

  let updatedCount = 0;
  const updates: Array<{ id: string; oldSpec: string; newSpec: string; name: string }> = [];

  for (const r of rows) {
    if (isNoiseSpec(r.specification)) {
      const newSpec = inferPartSpecification({
        name: r.standard_name,
        code: r.master_code,
        category: r.category,
        material: r.material,
        existingSpec: r.specification
      });

      if (newSpec && newSpec !== '-' && newSpec !== r.specification) {
        updates.push({
          id: r.id,
          name: r.standard_name,
          oldSpec: r.specification || '-',
          newSpec
        });
      }
    }
  }

  console.log(`\nItems to enrich: ${updates.length}`);
  for (const u of updates.slice(0, 15)) {
    console.log(`- [${u.name}] ${u.oldSpec} -> ${u.newSpec}`);
  }

  // Update in SQLite
  const stmt = db.prepare('UPDATE product_masters SET specification = ?, updated_at = ? WHERE id = ?');
  const nowIso = new Date().toISOString();

  for (const u of updates) {
    await stmt.run(u.newSpec, nowIso, u.id);
    updatedCount++;
  }

  console.log(`\nSuccessfully enriched ${updatedCount} master items in DB!`);
}

enrichMasterSpecs().catch(console.error);
