import { executeSQL } from '../egdesk-helpers';
import * as XLSX from 'xlsx';
import path from 'path';

async function generateExcelTemplate() {
  const caseId = 'case_1789766302590';

  // 1. 가공품 10건
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

  // 2. 판금품 7건
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

  // 3. 구매품 8건
  const purRes = await executeSQL(`
    SELECT b.id as bom_id, b.raw_name, b.normalized_name, b.spec_candidate, b.quantity, f.process_type
    FROM normalized_bom_items b
    LEFT JOIN part_fabrication_features f ON b.id = f.bom_item_id
    WHERE b.quotation_case_id = '${caseId}'
      AND (f.process_type = 'PURCHASE' OR f.drawing_id IS NULL)
    LIMIT 8
  `);

  const rows: any[] = [];
  let no = 1;

  for (const m of (machRes.rows || [])) {
    rows.push({
      '순번': no++,
      '분류': '가공품(MACHINING)',
      '품번(BOM ID)': m.bom_id,
      '품명': m.normalized_name || m.raw_name,
      '재질': m.material_candidate || 'SS400',
      '수량(EA)': m.quantity,
      '추정중량(kg)': m.part_weight_kg || '-',
      '외곽치수(W*L*T)': `${m.bbox_width}×${m.bbox_length}×${m.bbox_thickness}`,
      '실무 검토 단가(원)': '', // 실무자 입력란
      '단가 산출 근거 / 비고': ''
    });
  }

  for (const s of (sheetRes.rows || [])) {
    rows.push({
      '순번': no++,
      '분류': '판금품(SHEET_METAL)',
      '품번(BOM ID)': s.bom_id,
      '품명': s.normalized_name || s.raw_name,
      '재질': s.material_candidate || 'SS400',
      '수량(EA)': s.quantity,
      '추정중량(kg)': s.part_weight_kg || '-',
      '외곽치수(W*L*T)': `${s.bbox_width}×${s.bbox_length}×${s.bbox_thickness}`,
      '실무 검토 단가(원)': '', // 실무자 입력란
      '단가 산출 근거 / 비고': ''
    });
  }

  for (const p of (purRes.rows || [])) {
    rows.push({
      '순번': no++,
      '분류': '구매품(PURCHASE)',
      '품번(BOM ID)': p.bom_id,
      '품명': p.normalized_name || p.raw_name,
      '재질': p.spec_candidate || '-',
      '수량(EA)': p.quantity,
      '추정중량(kg)': '-',
      '외곽치수(W*L*T)': '-',
      '실무 검토 단가(원)': '', // 실무자 입력란
      '단가 산출 근거 / 비고': ''
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // 컬럼 너비 설정
  ws['!cols'] = [
    { wch: 6 },  // 순번
    { wch: 22 }, // 분류
    { wch: 28 }, // BOM ID
    { wch: 30 }, // 품명
    { wch: 12 }, // 재질
    { wch: 10 }, // 수량
    { wch: 14 }, // 추정중량
    { wch: 18 }, // 외곽치수
    { wch: 20 }, // 실무 검토 단가
    { wch: 30 }  // 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws, '대표부품_25선_단가검토');

  const filePath = path.join(process.cwd(), 'HUMAN_VERIFICATION_25_PARTS.xlsx');
  XLSX.writeFile(wb, filePath);

  console.log(`엑셀 템플릿 생성 완료: ${filePath}`);
}

generateExcelTemplate().catch(console.error);
