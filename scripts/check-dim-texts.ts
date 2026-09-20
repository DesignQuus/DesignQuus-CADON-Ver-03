import { executeSQL } from '../egdesk-helpers';

async function checkDimValues() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  // DIMENSION 레이어의 텍스트 엔티티 샘플
  const dims = await executeSQL(`
    SELECT raw_text, COUNT(*) as cnt
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
      AND (layer LIKE '%DIM%' OR layer LIKE '%치수%')
      AND raw_text GLOB '[0-9]*'
    GROUP BY raw_text
    ORDER BY cnt DESC
    LIMIT 30
  `);
  console.log('=== DIMENSION 레이어 숫자 텍스트 빈도 상위 30건 ===');
  console.table(dims.rows);
}

checkDimValues().catch(console.error);
