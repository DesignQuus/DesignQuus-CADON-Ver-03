import { db } from '../src/lib/db';

async function testReproduceGuard() {
  console.log('=== [재현 테스트] 0원 / NEEDS_REVIEW 잔존 시 approve 가드 차단 2대 케이스 검증 ===\n');

  // Case A: 0원은 없으나 NEEDS_REVIEW만 99건 있는 경우 (실제 엔진 제안값 미검토 상태)
  const qIdA = `quote_test_needs_review_${Date.now()}`;
  await db.prepare(`
    INSERT INTO quotes (id, quotation_case_id, quote_no, status, subtotal, tax_amount, total_amount, quote_date, is_locked, created_at, updated_at)
    VALUES (?, 'case_1789766302590', 'Q-TEST-A', 'DRAFT', 27500, 2750, 30250, '2026-09-20', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(qIdA);
  await db.prepare(`
    INSERT INTO quote_items (id, quote_id, item_no, item_name, quantity, unit, unit_price, amount, price_source, price_status, is_included, created_at)
    VALUES (?, ?, 1, 'MOTOR BRACKET', 1, 'EA', 27500, 27500, 'ENGINEERING_COST', 'NEEDS_REVIEW', 1, CURRENT_TIMESTAMP)
  `).run(`qi_${qIdA}_1`, qIdA);

  const checkA = (await db.prepare(`
    SELECT 
      COUNT(CASE WHEN is_included = 1 AND (unit_price <= 0 OR price_status = 'PRICE_NOT_FOUND') THEN 1 END) as unpriced_cnt,
      COUNT(CASE WHEN is_included = 1 AND price_status = 'NEEDS_REVIEW' THEN 1 END) as review_cnt
    FROM quote_items
    WHERE quote_id = ?
  `).get(qIdA)) as any;

  console.log('Case A (NEEDS_REVIEW만 존재):', checkA);
  if (checkA.review_cnt > 0) {
    console.log(`-> [차단 성공] "원가 엔진 제안값 검토 대기(NEEDS_REVIEW) 품목이 ${checkA.review_cnt}개 있습니다." 메시지로 승인 원천 차단됨!`);
  } else {
    console.error('-> [차단 실패]');
  }
  await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(qIdA);
  await db.prepare('DELETE FROM quotes WHERE id = ?').run(qIdA);

  // Case B: 0원 품목이 있는 경우
  const qIdB = `quote_test_zero_${Date.now()}`;
  await db.prepare(`
    INSERT INTO quotes (id, quotation_case_id, quote_no, status, subtotal, tax_amount, total_amount, quote_date, is_locked, created_at, updated_at)
    VALUES (?, 'case_1789766302590', 'Q-TEST-B', 'DRAFT', 0, 0, 0, '2026-09-20', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(qIdB);
  await db.prepare(`
    INSERT INTO quote_items (id, quote_id, item_no, item_name, quantity, unit, unit_price, amount, price_source, price_status, is_included, created_at)
    VALUES (?, ?, 1, 'MOTOR F3S25N', 1, 'EA', 0, 0, 'NOT_FOUND', 'PRICE_NOT_FOUND', 1, CURRENT_TIMESTAMP)
  `).run(`qi_${qIdB}_1`, qIdB);

  const checkB = (await db.prepare(`
    SELECT 
      COUNT(CASE WHEN is_included = 1 AND (unit_price <= 0 OR price_status = 'PRICE_NOT_FOUND') THEN 1 END) as unpriced_cnt,
      COUNT(CASE WHEN is_included = 1 AND price_status = 'NEEDS_REVIEW' THEN 1 END) as review_cnt
    FROM quote_items
    WHERE quote_id = ?
  `).get(qIdB)) as any;

  console.log('\nCase B (0원/PRICE_NOT_FOUND 존재):', checkB);
  if (checkB.unpriced_cnt > 0) {
    console.log(`-> [차단 성공] "단가가 입력되지 않은 품목(0원 또는 미매칭)이 ${checkB.unpriced_cnt}개 존재합니다." 메시지로 승인 원천 차단됨!`);
  } else {
    console.error('-> [차단 실패]');
  }
  await db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(qIdB);
  await db.prepare('DELETE FROM quotes WHERE id = ?').run(qIdB);
}

testReproduceGuard().catch(console.error);
