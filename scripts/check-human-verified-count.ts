import { db } from '../src/lib/db';

async function main() {
  const total = await db.prepare(`SELECT count(*) as cnt FROM price_history_v2`).get() as any;
  const humanVerified = await db.prepare(`SELECT count(*) as cnt FROM price_history_v2 WHERE price_basis_type = 'HUMAN_VERIFIED'`).get() as any;
  const pollutions = await db.prepare(`SELECT price_basis_type, count(*) as cnt FROM price_history_v2 WHERE price_basis_type != 'HUMAN_VERIFIED' GROUP BY price_basis_type`).all() as any[];

  console.log(`[price_history_v2 실측 결과]`);
  console.log(`- 전체 행 수: ${total.cnt}건`);
  console.log(`- HUMAN_VERIFIED 행 수: ${humanVerified.cnt}건`);
  console.log(`- 비(非) HUMAN_VERIFIED (과거 오염/시험 데이터):`, pollutions);
}

main().catch(console.error);
