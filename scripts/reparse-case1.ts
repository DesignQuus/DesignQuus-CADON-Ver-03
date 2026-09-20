import { processCadFilePipeline } from '../src/lib/cad-pipeline';
import { db } from '../src/lib/db';

async function main() {
  const caseId = 'case_1789766302590';
  const fileId = 'file_1789766305148';
  const userId = 'admin';

  console.log(`=== 1차 케이스(${caseId}) 파이프라인 재파싱 시작 ===`);
  const startTime = Date.now();

  const res = await processCadFilePipeline(caseId, fileId, userId);
  console.log('재파싱 결과:', res);
  console.log(`소요 시간: ${((Date.now() - startTime) / 1000).toFixed(1)}초`);

  // 결과 확인: cad_parse_runs, cad_objects, drawings
  const runs = await db.prepare(`SELECT id, status, total_entities FROM cad_parse_runs WHERE source_file_id = ? ORDER BY created_at DESC`).all(fileId) as any[];
  console.log('cad_parse_runs:', runs);

  const activeRun = runs.find(r => r.status === 'SUCCESS');
  if (activeRun) {
    const objCount = await db.prepare(`SELECT count(*) as cnt FROM cad_objects WHERE parse_run_id = ?`).get(activeRun.id) as any;
    console.log(`유효 cad_objects 수: ${objCount.cnt}개 (멱등성 확인)`);
  }

  const dwgCounts = await db.prepare(`
    SELECT is_quote_included, count(*) as cnt 
    FROM drawings 
    WHERE quotation_case_id = ? 
    GROUP BY is_quote_included
  `).all(caseId) as any[];
  console.log('drawings is_quote_included 상태:', dwgCounts);
}

main().catch(console.error);
