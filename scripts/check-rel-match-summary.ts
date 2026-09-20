import { executeSQL } from '../egdesk-helpers';

async function run() {
  const caseId = 'case_1789766302590';
  const rels = await executeSQL(`SELECT DISTINCT child_drawing_no FROM drawing_relationships WHERE quotation_case_id = '${caseId}'`);
  const dwgs = await executeSQL(`SELECT DISTINCT drawing_no_normalized FROM drawings WHERE quotation_case_id = '${caseId}'`);
  const feats = await executeSQL(`SELECT f.raw_features_json FROM part_fabrication_features f WHERE f.quotation_case_id = '${caseId}'`);
  
  const relSet = new Set((rels.rows || []).map((r: any) => r.child_drawing_no));
  const dwgSet = new Set((dwgs.rows || []).map((r: any) => r.drawing_no_normalized));
  const featSet = new Set<string>();
  for (const f of (feats.rows || [])) {
    try { 
      const p = JSON.parse(f.raw_features_json); 
      if (p.drawingNo) featSet.add(p.drawingNo); 
    } catch {}
  }

  let inDwg = 0;
  let inFeat = 0;
  const missingInFeat: string[] = [];
  for (const r of Array.from(relSet)) {
    if (dwgSet.has(r)) inDwg++;
    if (featSet.has(r)) inFeat++;
    else missingInFeat.push(r);
  }
  console.log('=== Relationship Matching Summary ===');
  console.log('Total unique rel children:', relSet.size);
  console.log('In drawings table:', inDwg, '/', relSet.size);
  console.log('In feat table:', inFeat, '/', relSet.size);
  console.log('Missing in feat count:', missingInFeat.length);
  console.log('Missing samples (first 10):', missingInFeat.slice(0, 10));
}

run().catch(console.error);
