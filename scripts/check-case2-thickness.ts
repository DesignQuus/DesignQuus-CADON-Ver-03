import { db } from '../src/lib/db';

async function main() {
  const rows = await db.prepare(`
    SELECT 
      f.id as feature_id,
      f.drawing_id,
      f.process_type,
      f.material_code,
      f.bbox_width,
      f.bbox_length,
      f.bbox_thickness,
      f.part_weight_kg,
      d.drawing_no_raw,
      d.drawing_name_raw,
      d.drawing_type,
      d.is_quote_included,
      d.exclude_reason
    FROM part_fabrication_features f
    JOIN drawings d ON f.drawing_id = d.id
    WHERE d.quotation_case_id = 'case_1789894718545'
  `).all();

  console.log('Total feature rows in case 2:', rows.length);
  const included = rows.filter((r: any) => r.is_quote_included === 1);
  console.log('Included rows (is_quote_included=1):', included.length);

  const thicknessCounts: Record<string, number> = {};
  included.forEach((r: any) => {
    const t = Number(r.bbox_thickness).toFixed(1);
    thicknessCounts[t] = (thicknessCounts[t] || 0) + 1;
  });

  console.log('\n--- Thickness breakdown for included items (is_quote_included=1) ---');
  const total = included.length;
  const sorted = Object.entries(thicknessCounts).sort((a, b) => Number(a[0]) - Number(b[0]));
  sorted.forEach(([t, count]) => {
    console.log(`t${t}: ${count}장 (${((count / total) * 100).toFixed(1)}%)`);
  });

  console.log('\n--- Details of each included row ---');
  included.forEach((r: any) => {
    console.log(`dwg_no: ${r.drawing_no_raw} | name: ${r.drawing_name_raw} | proc: ${r.process_type} | t: ${r.bbox_thickness} | w: ${r.bbox_width} | l: ${r.bbox_length} | wt: ${r.part_weight_kg}kg`);
  });

  const excluded = rows.filter((r: any) => r.is_quote_included === 0);
  console.log('\n--- Details of excluded rows ---');
  excluded.forEach((r: any) => {
    console.log(`dwg_no: ${r.drawing_no_raw} | name: ${r.drawing_name_raw} | type: ${r.drawing_type} | reason: ${r.exclude_reason}`);
  });
}

main().catch(console.error);
