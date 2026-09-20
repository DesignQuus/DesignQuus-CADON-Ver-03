import { executeSQL } from '../egdesk-helpers';

async function main() {
  const res = await executeSQL(`
    SELECT id, raw_name, normalized_name, spec_candidate, quantity
    FROM normalized_bom_items
    WHERE quotation_case_id = 'case_1789766302590'
  `);
  const rows = res.rows || [];
  console.log(`총 normalized_bom_items: ${rows.length}건`);
  
  // 구매품 후보 패턴 분석
  const purchaseKeywords = ['SMC', 'MISUMI', 'ITOH', 'BEARING', 'CYLINDER', 'SENSOR', 'MOTOR', 'COUPLING', 'LM', 'GUIDE', 'BOLT', 'NUT', 'WASHER', 'SPRING'];
  
  const potentialPurchase = rows.filter(r => {
    const text = `${r.raw_name} ${r.normalized_name} ${r.spec_candidate || ''}`.toUpperCase();
    return purchaseKeywords.some(k => text.includes(k));
  });

  console.log(`구매품 키워드 매칭: ${potentialPurchase.length}건`);
  console.table(potentialPurchase.slice(0, 20));
  
  // 전체 목록 중 spec_candidate가 있는 항목들
  const withSpec = rows.filter(r => r.spec_candidate);
  console.log(`spec_candidate 보유: ${withSpec.length}건`);
  console.table(withSpec.slice(0, 20));
}

main().catch(console.error);
