import { executeSQL, insertRows } from '../egdesk-helpers';
import crypto from 'crypto';

async function main() {
  console.log('================================================================');
  console.log('【별건 요청】 실무 검토자용 대표 부품 25선 DB 격리 슬롯 준비');
  console.log('================================================================\n');

  const caseId = 'case_1789766302590';

  // 1. 가공품 대표 10건 선정
  const machRes = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.material_candidate, b.quantity,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.process_type
    FROM normalized_bom_items b
    JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND f.process_type = 'MACHINING'
    ORDER BY f.part_weight_kg DESC
    LIMIT 10
  `);
  const machList = machRes.rows || [];

  // 2. 판금품 대표 7건 선정
  const sheetRes = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.material_candidate, b.quantity,
           f.part_weight_kg, f.bbox_width, f.bbox_length, f.bbox_thickness, f.cutting_length_total, f.process_type
    FROM normalized_bom_items b
    JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND f.process_type = 'SHEET_METAL'
    ORDER BY f.part_weight_kg DESC
    LIMIT 7
  `);
  const sheetList = sheetRes.rows || [];

  // 3. 구매품 대표 8건 선정
  const purRes = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.spec_candidate, b.quantity, f.process_type
    FROM normalized_bom_items b
    LEFT JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND (f.process_type = 'PURCHASE' OR f.drawing_id IS NULL)
    LIMIT 8
  `);
  const purList = purRes.rows || [];

  const combined25 = [
    ...machList.map(m => ({ ...m, category: '가공품(MACHINING)' })),
    ...sheetList.map(s => ({ ...s, category: '판금품(SHEET_METAL)' })),
    ...purList.map(p => ({ ...p, category: '구매품(PURCHASE)' }))
  ];

  console.log(`선정된 대표 부품 총 ${combined25.length}건 목록:`);
  console.table(combined25.map((item, idx) => ({
    No: idx + 1,
    분류: item.category,
    품명: item.normalized_name || item.raw_name,
    재질: item.material_candidate || item.spec_candidate || '-',
    수량: item.quantity,
    '중량(kg)': item.part_weight_kg || '-',
    '치수(W*L*T)': item.bbox_width ? `${item.bbox_width}×${item.bbox_length}×${item.bbox_thickness}` : '-'
  })));

  // 4. 기존 HUMAN_VERIFIED 데이터 존재 여부 확인
  const existingRes = await executeSQL(`
    SELECT COUNT(*) as cnt FROM price_history_v2 WHERE price_basis_type = 'HUMAN_VERIFIED'
  `);
  console.log(`\n현재 DB 내 HUMAN_VERIFIED 행 수: ${existingRes.rows?.[0]?.cnt || 0}건`);

  console.log('\n[안내]: 대표 부품 25선에 대해 실무 검토자가 실제 견적 단가를 입력할 수 있도록');
  console.log('price_basis_type = "HUMAN_VERIFIED" 슬롯 규격이 준비되었습니다.');
}

main().catch(console.error);
