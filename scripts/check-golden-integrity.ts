import { db } from '../src/lib/db';

async function checkGoldenIntegrity() {
  console.log('====================================================');
  console.log('【검증 5 실측】 골든 데이터셋 중량 및 도면 건수 정합성 확인');
  console.log('====================================================\n');

  const cases = [
    { id: 'case_1789766302590', name: '1차 골든 케이스', expectedWeight: 317.505, expectedSheets: 107 },
    { id: 'case_1789894718545', name: '2차 골든 케이스', expectedWeight: 964.340, expectedSheets: 39 }
  ];

  for (const c of cases) {
    // 1. 전체 도면 건수
    const totalDwg = (await db.prepare('SELECT COUNT(*) as cnt FROM drawings WHERE quotation_case_id = ?').get(c.id)) as any;
    
    // 2. 단품 도면 건수 (조립도 제외: MAIN_ASSEMBLY, SUB_ASSEMBLY 제외 또는 is_quote_included = 1)
    const partDwg = (await db.prepare(`
      SELECT COUNT(*) as cnt, SUM(f.part_weight_kg) as total_weight
      FROM drawings d
      LEFT JOIN part_fabrication_features f ON f.drawing_id = d.id
      WHERE d.quotation_case_id = ? 
        AND d.drawing_type NOT IN ('MAIN_ASSEMBLY', 'SUB_ASSEMBLY')
    `).get(c.id)) as any;

    // 3. case_archives의 스냅샷 확인
    const archive = (await db.prepare(`
      SELECT archive_name, archive_version, drawings_count, bom_items_count, snapshot_data_json
      FROM case_archives
      WHERE quotation_case_id = ?
      ORDER BY archive_version DESC LIMIT 1
    `).get(c.id)) as any;

    let snapshotWeight = null;
    let snapshotParts = null;
    if (archive?.snapshot_data_json) {
      try {
        const snap = JSON.parse(archive.snapshot_data_json);
        snapshotWeight = snap.total_part_weight_kg || snap.summary?.total_weight;
        snapshotParts = snap.part_drawings_count || snap.summary?.part_count;
      } catch (e) {}
    }

    console.log(`### ${c.name} (${c.id})`);
    console.log(`- 기준 목표값: 중량 ${c.expectedWeight} kg / 단품 ${c.expectedSheets}장`);
    console.log(`- 현재 DB 실측값:`);
    console.log(`  * 전체 도면 수: ${totalDwg?.cnt}장`);
    console.log(`  * 단품 도면 수: ${partDwg?.cnt}장 (목표 일치: ${partDwg?.cnt === c.expectedSheets ? '✅ 일치' : '❌ 불일치'})`);
    console.log(`  * 단품 총 중량: ${Number(partDwg?.total_weight || 0).toFixed(3)} kg (목표 일치: ${Math.abs(Number(partDwg?.total_weight || 0) - c.expectedWeight) < 0.01 ? '✅ 일치' : '❌ 불일치'})`);
    console.log(`- 아카이브 스냅샷: ${archive?.archive_name || '없음'} (도면: ${archive?.drawings_count}, BOM: ${archive?.bom_items_count})`);
    console.log('----------------------------------------------------\n');
  }
}

checkGoldenIntegrity().catch(console.error);
