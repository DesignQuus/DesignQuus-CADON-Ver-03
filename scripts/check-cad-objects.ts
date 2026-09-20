import { db } from '../src/lib/db';

async function checkCadObjects() {
  const caseId = 'case_1789766302590';
  console.log('=== cad_objects 및 cad_parse_runs 현황 ===');

  // 해당 케이스의 uploaded_files
  const files = await db.prepare(`SELECT id, original_file_name, checksum FROM uploaded_files WHERE quotation_case_id = ?`).all(caseId) as any[];
  console.log('uploaded_files:', files);

  // cad_parse_runs 목록
  const runs = await db.prepare(`
    SELECT c.id, c.source_file_id, c.status, c.total_entities, c.created_at
    FROM cad_parse_runs c
    WHERE c.source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY c.created_at
  `).all(caseId) as any[];
  console.log('cad_parse_runs 건수:', runs.length);
  console.log('cad_parse_runs 목록:', runs);

  // 각 run별 cad_objects 건수
  for (const r of runs) {
    const objCount = await db.prepare(`SELECT COUNT(*) as c FROM cad_objects WHERE parse_run_id = ?`).get(r.id) as any;
    console.log(`run [${r.id}]: cad_objects 건수 = ${objCount.c}`);
  }

  const totalObjs = await db.prepare(`
    SELECT COUNT(*) as c FROM cad_objects
    WHERE parse_run_id IN (
      SELECT c.id FROM cad_parse_runs c
      WHERE c.source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    )
  `).get(caseId) as any;
  console.log('총 cad_objects 누적 건수:', totalObjs.c);
}

checkCadObjects().catch(console.error);
