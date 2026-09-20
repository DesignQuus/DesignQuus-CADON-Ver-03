import { executeSQL } from '../egdesk-helpers';

async function checkTexts() {
  const caseId = 'case_1789766302590';
  const dwgs = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, material
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);

  let parsedThicknessCount = 0;
  let nullThicknessCount = 0;
  const thicknessDist: Record<string, number> = {};

  for (const d of (dwgs.rows || [])) {
    const text = `${d.drawing_name_raw || ''} ${d.material || ''}`;
    // t3.2, 3.2T, T=3.2, 3t, 3T, PL3.2, PL-3 등 패턴
    const m = text.match(/(\d+(?:\.\d+)?)\s*[tT]\b|\b[tT]\s*[:=]?\s*(\d+(?:\.\d+)?)|PL\s*[-]?\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      const val = parseFloat(m[1] || m[2] || m[3]);
      parsedThicknessCount++;
      const k = `t${val}`;
      thicknessDist[k] = (thicknessDist[k] || 0) + 1;
    } else {
      nullThicknessCount++;
    }
  }

  console.log(`=== 도면 품명/재질란 두께 파싱 실측 ===`);
  console.log(`- 두께 파싱 성공 건수: ${parsedThicknessCount}건`);
  console.log(`- 두께 파싱 불가(NULL 대상): ${nullThicknessCount}건`);
  console.log(`- 파싱된 두께 분포:`, thicknessDist);

  // cad_objects 엔티티 텍스트에서도 추가 파싱 가능한지 확인
  const cadObjTexts = await executeSQL(`
    SELECT drawing_id, raw_text
    FROM cad_objects
    WHERE parse_run_id = 'parse_1789766345349'
      AND (raw_text LIKE '%t%' OR raw_text LIKE '%T%' OR raw_text LIKE '%PL%')
    LIMIT 20
  `);
  console.log('cad_objects sample texts with t/T:', cadObjTexts.rows?.slice(0, 10));
}

checkTexts().catch(console.error);
