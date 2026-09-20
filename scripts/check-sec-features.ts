import { db } from '../src/lib/db';

async function checkFeaturesAndBom() {
  const caseId = 'case_1789894718545';
  console.log('=== 케이스 정밀 상태 확인 ===');

  const featCount = await db.prepare(`SELECT COUNT(*) as c FROM part_fabrication_features WHERE quotation_case_id = ?`).get(caseId) as any;
  console.log('part_fabrication_features 건수:', featCount.c);

  const drawings = await db.prepare(`SELECT id, drawing_no_raw, drawing_name_raw, drawing_type, is_quote_included FROM drawings WHERE quotation_case_id = ? LIMIT 10`).all(caseId);
  console.log('도면 샘플 10장:', drawings);

  const normBom = await db.prepare(`SELECT id, raw_name, normalized_name, quantity, is_quote_included FROM normalized_bom_items WHERE quotation_case_id = ? LIMIT 10`).all(caseId);
  console.log('정규화 BOM 샘플 10건:', normBom);
}

checkFeaturesAndBom().catch(console.error);
