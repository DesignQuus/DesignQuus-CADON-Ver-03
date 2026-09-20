import { executeSQL } from '../egdesk-helpers';

async function investigate() {
  const caseId = 'case_1789766302590';
  console.log('================================================================');
  console.log('【조사 1】 58 EA 도번 불일치 패턴 심층 분석');
  console.log('================================================================');

  // 1. drawing_relationships의 child_drawing_no vs drawings vs part_fabrication_features
  const rels = await executeSQL(`
    SELECT DISTINCT child_drawing_no
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const relChildDwgNos = (rels.rows || []).map((r: any) => r.child_drawing_no);
  console.log(`drawing_relationships 고유 child_drawing_no 건수: ${relChildDwgNos.length}건`);

  // drawings 테이블에 있는 도번 목록
  const dwgs = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_no_raw, drawing_name_raw, material
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);
  const dwgMap = new Map<string, any>();
  for (const d of (dwgs.rows || [])) {
    dwgMap.set(d.drawing_no_normalized, d);
  }
  console.log(`drawings 고유 drawing_no_normalized 건수: ${dwgMap.size}건`);

  // part_fabrication_features에 있는 drawingNo 목록
  const feats = await executeSQL(`
    SELECT id, drawing_id, bom_item_id, raw_features_json
    FROM part_fabrication_features
    WHERE quotation_case_id = '${caseId}'
  `);
  const featDwgNos = new Set<string>();
  for (const f of (feats.rows || [])) {
    try {
      const rf = JSON.parse(f.raw_features_json);
      if (rf.drawingNo) featDwgNos.add(rf.drawingNo);
    } catch {}
  }
  console.log(`part_fabrication_features 고유 drawingNo 건수: ${featDwgNos.size}건`);

  // 58개 미매칭 도번 확인
  const missingInFeat: string[] = [];
  for (const c of relChildDwgNos) {
    if (!featDwgNos.has(c)) {
      missingInFeat.push(c);
    }
  }
  console.log(`relChildDwgNos 중 featDwgNos에 없는 건수: ${missingInFeat.length}건`);
  console.log('샘플 15건:', missingInFeat.slice(0, 15));

  // 이 미매칭 도번들이 drawings에는 있는지?
  const inDrawingsCount = missingInFeat.filter(m => dwgMap.has(m)).length;
  console.log(`이 중 drawings 테이블에 존재하는 건수: ${inDrawingsCount} / ${missingInFeat.length}`);

  // drawings의 상세 데이터 샘플
  console.log('\n미매칭 도번들의 drawings 데이터 샘플 5건:');
  for (const m of missingInFeat.slice(0, 5)) {
    console.log(m, dwgMap.get(m));
  }

  console.log('\n================================================================');
  console.log('【조사 2】 도면 텍스트에서 두께(t, T) 및 형상(Ø, 각파이프) 파싱 가능 여부');
  console.log('================================================================');

  // drawings 테이블의 drawing_name_raw, material 샘플 20건
  const nameMatSamples = await executeSQL(`
    SELECT drawing_no_normalized, drawing_name_raw, material
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
    LIMIT 25
  `);
  console.table(nameMatSamples.rows);

  // cad_objects의 TEXT/MTEXT 중 두께/치수 표기 확인
  const cadTexts = await executeSQL(`
    SELECT raw_text, COUNT(*) as cnt
    FROM cad_objects
    WHERE parse_run_id = 'parse_1789766345349'
      AND (raw_text LIKE '%T%' OR raw_text LIKE '%t%' OR raw_text LIKE '%Ø%' OR raw_text LIKE '%*%' OR raw_text LIKE '%x%')
    GROUP BY raw_text
    ORDER BY cnt DESC
    LIMIT 25
  `);
  console.log('cad_objects 텍스트 엔티티 중 규격/두께 후보:');
  console.table(cadTexts.rows);
}

investigate().catch(console.error);
