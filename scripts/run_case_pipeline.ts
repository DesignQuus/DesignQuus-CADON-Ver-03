import { db } from '../src/lib/db';
import { processCadFilePipeline } from '../src/lib/cad-pipeline';

async function main() {
  const caseId = process.argv[2] || 'case_1790146279678';
  console.log(`Starting CAD pipeline for ${caseId}...`);

  const file = (await db.prepare(`
    SELECT * FROM uploaded_files
    WHERE quotation_case_id = ? AND file_type IN ('DWG', 'DXF')
    ORDER BY (CASE WHEN file_type = 'DWG' THEN 1 ELSE 2 END) ASC, rowid DESC
    LIMIT 1
  `).get(caseId)) as any;

  if (!file) {
    console.error('No uploaded file found for case:', caseId);
    process.exit(1);
  }

  console.log(`Target file: ${file.original_file_name} (${file.id})`);
  const res = await processCadFilePipeline(caseId, file.id, 'usr_admin');
  console.log('Pipeline result:', res);

  // Check drawings in DB
  const dwgs = (await db.prepare(`
    SELECT drawing_no_raw, drawing_name_raw, material, scale, drawing_type
    FROM drawings
    WHERE quotation_case_id = ?
    ORDER BY drawing_index ASC
  `).all(caseId)) as any[];

  console.log(`Total drawings in DB: ${dwgs.length}`);

  // Check normalized items
  const normItems = (await db.prepare(`
    SELECT id, raw_name, normalized_name, spec_candidate, material_candidate, quantity, unit
    FROM normalized_bom_items
    WHERE quotation_case_id = ?
    ORDER BY rowid ASC
  `).all(caseId)) as any[];

  console.log(`Total normalized items in DB: ${normItems.length}`);

  // Inspect the 8 pending review parts
  const targets = ['DV2-007', 'DV2-008', 'DV2-009', 'DV2-010', 'DV3-007', 'DV3-008'];
  console.log('\n--- 8 Pending Review Target Inspection in DB ---');
  for (const t of targets) {
    const matchedDwg = dwgs.filter(d => d.drawing_no_raw.includes(t));
    const matchedNorm = normItems.filter(n => n.raw_name.includes(t) || (n.spec_candidate && n.spec_candidate.includes(t)));
    console.log(`[Target ${t}]:`);
    console.log('  Drawings:', matchedDwg);
  }
}

main().catch(console.error);
