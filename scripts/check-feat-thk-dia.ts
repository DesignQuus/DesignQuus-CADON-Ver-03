import { db } from '../src/lib/db';

async function checkFeatThkDia() {
  const caseId = 'case_1789894718545';
  const featRows = await db.prepare(`
    SELECT id, drawing_id, process_type, material_code, bbox_thickness, part_weight_kg, raw_features_json
    FROM part_fabrication_features
    WHERE quotation_case_id = ?
  `).all(caseId) as any[];

  console.log(`현재 피처 건수: ${featRows.length}건`);

  const thkMap = new Map<number, number>();
  const diaMap = new Map<number, number>();

  for (const f of featRows) {
    const t = f.bbox_thickness;
    thkMap.set(t, (thkMap.get(t) || 0) + 1);

    try {
      const meta = JSON.parse(f.raw_features_json || '{}');
      if (meta.diameter) {
        diaMap.set(meta.diameter, (diaMap.get(meta.diameter) || 0) + 1);
      }
    } catch {}
  }

  console.log('bbox_thickness 값별 건수:', Object.fromEntries(thkMap.entries()));
  console.log('환봉 직경(diameter) 값별 건수:', Object.fromEntries(diaMap.entries()));
}

checkFeatThkDia().catch(console.error);
