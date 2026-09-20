import { queryTable } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const featRes = await queryTable('part_fabrication_features', { limit: 1000 });
  const caseFeats = featRes.rows?.filter(r => r.quotation_case_id === caseId) || [];

  const treatMap: Record<string, { count: number, materials: Record<string, number> }> = {};
  for (const f of caseFeats) {
    const t = f.surface_treatment || 'NULL';
    if (!treatMap[t]) treatMap[t] = { count: 0, materials: {} };
    treatMap[t].count++;
    const m = f.material_code || 'UNKNOWN';
    treatMap[t].materials[m] = (treatMap[t].materials[m] || 0) + 1;
  }

  console.log('[125건 surface_treatment 분포 및 재질 매핑]:');
  for (const [t, data] of Object.entries(treatMap)) {
    console.log(`\n표면처리: "${t}" (${data.count}건)`);
    console.log(' - 재질별 건수:', data.materials);
  }
}

main().catch(console.error);
