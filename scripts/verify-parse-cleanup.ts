import { db } from '../src/lib/db';

async function verifyRuns() {
  const caseId = 'case_1789766302590';
  const runs = await db.prepare(`
    SELECT id, status, total_entities, created_at, updated_at
    FROM cad_parse_runs
    WHERE source_file_id IN (SELECT id FROM uploaded_files WHERE quotation_case_id = ?)
    ORDER BY created_at DESC
  `).all(caseId) as any[];

  console.log('cad_parse_runs 상태:');
  for (const r of runs) {
    const objCnt = await db.prepare(`SELECT COUNT(*) as c FROM cad_objects WHERE parse_run_id = ?`).get(r.id) as any;
    console.log(`- Run [${r.id}] Status: ${r.status}, Entities: ${r.total_entities}, cad_objects: ${objCnt?.c}건, Created: ${r.created_at}`);
  }

  const totalRemain = await db.prepare(`
    SELECT COUNT(*) as c FROM cad_objects
    WHERE parse_run_id = 'parse_1789887403093'
  `).get() as any;
  console.log(`최신 활성 run cad_objects 잔여 건수: ${totalRemain?.c}건`);
}

verifyRuns().catch(console.error);
