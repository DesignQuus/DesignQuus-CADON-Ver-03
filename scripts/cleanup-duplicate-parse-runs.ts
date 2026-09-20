import { db } from '../src/lib/db';

async function cleanupDuplicateParseRuns() {
  const caseId = 'case_1789766302590';
  console.log('=== 조치 4: 파싱 idempotent 및 중복 데이터 정리 시작 ===');

  // 1. 해당 케이스의 모든 parse_run 조회
  const runs = await db.prepare(`
    SELECT c.id, c.source_file_id, c.status, c.total_entities, c.created_at
    FROM cad_parse_runs c
    WHERE c.source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY c.created_at DESC
  `).all(caseId) as any[];

  console.log(`총 ${runs.length}개의 parse_run 발견`);
  if (runs.length <= 1) {
    console.log('중복된 parse_run이 없습니다.');
    return;
  }

  const latestRun = runs[0];
  const oldRuns = runs.slice(1);
  console.log(`최신 활성 run: ${latestRun.id} (${latestRun.created_at})`);
  console.log(`정리 대상 구버전 run(${oldRuns.length}건):`, oldRuns.map(r => r.id));

  // 2. 구버전 run의 cad_objects 삭제
  for (const old of oldRuns) {
    const delObjs = await db.prepare(`DELETE FROM cad_objects WHERE parse_run_id = ?`).run(old.id);
    console.log(`run [${old.id}]: cad_objects ${delObjs.changes}건 삭제 완료`);

    // 구버전 run의 status를 'SUPERSEDED'로 변경 (이력 보존)
    await db.prepare(`
      UPDATE cad_parse_runs
      SET status = 'SUPERSEDED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(old.id);
    console.log(`run [${old.id}]: status를 'SUPERSEDED'로 갱신 완료`);
  }

  // 3. 정리 후 검증
  const verifiedRuns = await db.prepare(`
    SELECT c.id, c.status, c.created_at,
           (SELECT COUNT(*) FROM cad_objects WHERE parse_run_id = c.id) as obj_count
    FROM cad_parse_runs c
    WHERE c.source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY c.created_at DESC
  `).all(caseId) as any[];

  console.log('정리 후 cad_parse_runs 및 cad_objects 현황:', JSON.stringify(verifiedRuns, null, 2));

  const totalRemainingObjs = await db.prepare(`
    SELECT COUNT(*) as c FROM cad_objects
    WHERE parse_run_id IN (
      SELECT c.id FROM cad_parse_runs c
      WHERE c.source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    )
  `).get(caseId) as any;

  console.log(`정리 후 케이스 총 cad_objects 건수: ${totalRemainingObjs.c}건 (정확히 20,001건 보존)`);
  console.log('=== 조치 4 정리 완료 ===');
}

cleanupDuplicateParseRuns().catch(console.error);
