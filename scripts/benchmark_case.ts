import { db } from '../src/lib/db';
import { analyzeBomSimilarity } from '../src/lib/bom-similarity';
import { getLearnedPricePool } from '../src/lib/self-learning';

async function benchmark() {
  const id = 'case_1791141003647';
  console.log('=== Benchmarking case_1791141003647 queries ===');

  console.time('1. quotation_cases');
  const rawQc = await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id);
  console.timeEnd('1. quotation_cases');

  console.time('2. companies/projects/users');
  await Promise.all([
    rawQc.company_id ? db.prepare('SELECT company_name, company_code FROM companies WHERE id = ?').get(rawQc.company_id) : Promise.resolve(null),
    rawQc.project_id ? db.prepare('SELECT project_name, project_code FROM projects WHERE id = ?').get(rawQc.project_id) : Promise.resolve(null),
    rawQc.created_by_user_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(rawQc.created_by_user_id) : Promise.resolve(null)
  ]);
  console.timeEnd('2. companies/projects/users');

  console.time('3. uploaded_files');
  const allCaseFiles = await db.prepare('SELECT * FROM uploaded_files WHERE quotation_case_id = ?').all(id);
  console.timeEnd('3. uploaded_files');

  console.time('4. drawings');
  const drawings = await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC').all(id);
  console.timeEnd('4. drawings');
  console.log(`   drawings count: ${drawings.length}`);

  console.time('5. relationships + bom_areas + raw_bom + flattened');
  await Promise.all([
    db.prepare('SELECT * FROM drawing_relationships WHERE quotation_case_id = ?').all(id),
    db.prepare('SELECT * FROM bom_areas WHERE quotation_case_id = ?').all(id),
    db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ? ORDER BY row_index ASC').all(id),
    db.prepare('SELECT * FROM flattened_bom_items WHERE quotation_case_id = ?').all(id)
  ]);
  console.timeEnd('5. relationships + bom_areas + raw_bom + flattened');

  console.time('6. drawings update loop (Self-healing)');
  let updateCount = 0;
  for (const d of drawings) {
    const isAssy = d.drawing_type === 'MAIN_ASSEMBLY' || d.drawing_type === 'SUB_ASSEMBLY';
    if (isAssy) {
      if (d.is_quote_included !== 0) {
        updateCount++;
      }
    } else {
      if (d.is_quote_included === null || d.is_quote_included === undefined) {
        updateCount++;
      }
    }
  }
  console.timeEnd('6. drawings update loop (Self-healing)');
  console.log(`   drawings needing update: ${updateCount}`);

  console.time('7. price_masters');
  const priceMasters = await db.prepare('SELECT * FROM price_masters').all();
  console.timeEnd('7. price_masters');

  console.time('8. normalizedItems query');
  const normalizedItems = await db.prepare(`
    SELECT ni.*
    FROM normalized_bom_items ni
    WHERE ni.quotation_case_id = ?
    ORDER BY ni.id ASC
  `).all(id);
  console.timeEnd('8. normalizedItems query');
  console.log(`   normalizedItems count: ${normalizedItems.length}`);

  console.time('9. complex 4-way join query');
  try {
    const joined = await db.prepare(`
      SELECT 
        ni.*,
        COALESCE(fb.part_no, '') as drawing_no,
        fb.source_drawings_json,
        COALESCE(d.drawing_name_raw, ni.normalized_name) as drawing_name,
        COALESCE(d.revision, 'R00') as drawing_revision,
        COALESCE(d.scale, fb.specification, '-') as drawing_scale,
        COALESCE(d.material, fb.material, ni.material_candidate, 'SS400') as drawing_material,
        COALESCE(d.drawing_type, 'PART') as drawing_type,
        COALESCE(d.is_quote_included, ni.is_quote_included, 1) as is_quote_included,
        COALESCE(d.exclude_reason, ni.exclude_reason) as exclude_reason,
        d.id as matched_drawing_id
      FROM normalized_bom_items ni
      LEFT JOIN flattened_bom_items fb 
        ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
      LEFT JOIN drawings d
        ON d.quotation_case_id = ni.quotation_case_id AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
      WHERE ni.quotation_case_id = ?
      ORDER BY ni.id ASC
    `).all(id);
    console.timeEnd('9. complex 4-way join query');
    console.log(`   joined count: ${joined.length}`);
  } catch (err: any) {
    console.timeEnd('9. complex 4-way join query');
    console.log(`   joined query error:`, err.message);
  }

  console.time('10. bom similarity analysis (103 items)');
  const learnedPool = await getLearnedPricePool(rawQc.company_id);
  for (const item of normalizedItems) {
    item.company_id = rawQc.company_id;
    item.standard_schema_suggestion = analyzeBomSimilarity(item, priceMasters, learnedPool);
  }
  console.timeEnd('10. bom similarity analysis (103 items)');

  console.log('=== Benchmark Complete ===');
}

benchmark().catch(console.error);
