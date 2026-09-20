import { db } from '../src/lib/db';

async function applyAssemblyExclusion() {
  const caseId = 'case_1789766302590';
  console.log('=== 조치 1: 조립도 배제(is_quote_included = 0) DB 반영 시작 ===');

  // 1. 배제 대상 16건 조회
  const targetDrawings = await db.prepare(`
    SELECT id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_type, is_quote_included
    FROM drawings
    WHERE quotation_case_id = ?
      AND drawing_type IN ('MAIN_ASSEMBLY', 'SUB_ASSEMBLY')
    ORDER BY drawing_type, drawing_no_raw
  `).all(caseId);

  console.log(`대상 조립도 건수: ${targetDrawings.length}건`);
  console.log('대상 목록:', JSON.stringify(targetDrawings, null, 2));

  // 2. drawings 테이블에 is_quote_included = 0, exclude_reason = '조립도 (가공품 제외)' 기록
  const updateDrawingsResult = await db.prepare(`
    UPDATE drawings
    SET is_quote_included = 0,
        exclude_reason = '조립도 (가공품 제외)',
        updated_at = CURRENT_TIMESTAMP
    WHERE quotation_case_id = ?
      AND drawing_type IN ('MAIN_ASSEMBLY', 'SUB_ASSEMBLY')
  `).run(caseId);

  console.log('drawings UPDATE 결과:', updateDrawingsResult);

  // 단품 107건에 대해서도 명시적으로 is_quote_included = 1 기록
  const updatePartsResult = await db.prepare(`
    UPDATE drawings
    SET is_quote_included = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE quotation_case_id = ?
      AND drawing_type = 'SUB_PART'
      AND (is_quote_included IS NULL OR is_quote_included != 0)
  `).run(caseId);

  console.log('단품 107건 is_quote_included = 1 기록 결과:', updatePartsResult);

  // 3. 반영 후 검증 조회
  const verifyExcluded = await db.prepare(`
    SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type, is_quote_included, exclude_reason
    FROM drawings
    WHERE quotation_case_id = ? AND is_quote_included = 0
    ORDER BY drawing_type, drawing_no_normalized
  `).all(caseId);

  console.log(`검증 - 제외(is_quote_included = 0) 건수: ${verifyExcluded.length}건`);
  console.log('제외된 목록:', JSON.stringify(verifyExcluded, null, 2));

  const verifyIncluded = await db.prepare(`
    SELECT drawing_type, COUNT(*) as cnt
    FROM drawings
    WHERE quotation_case_id = ? AND is_quote_included = 1
    GROUP BY drawing_type
  `).all(caseId);

  console.log('검증 - 포함(is_quote_included = 1) 분포:', JSON.stringify(verifyIncluded, null, 2));

  console.log('=== 조립도 배제 DB 반영 완료 ===');
}

applyAssemblyExclusion().catch(err => {
  console.error(err);
  process.exit(1);
});
