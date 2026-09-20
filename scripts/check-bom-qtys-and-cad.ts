import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  // 1. normalized_bom_items 수량 분포
  const bomRes = await executeSQL(`
    SELECT raw_name, normalized_name, quantity
    FROM normalized_bom_items
    WHERE quotation_case_id = '${caseId}'
    ORDER BY quantity DESC
    LIMIT 30
  `);
  console.log('BOM 수량 상위 30건:');
  console.table(bomRes.rows);

  const totalBomQty = (bomRes.rows || []).reduce((acc: number, r: any) => acc + (r.quantity || 0), 0);
  console.log(`BOM 표 총 수량 합계: ${totalBomQty}`);

  // 2. 롤러 도면(240314-DV2-016)의 실제 CAD 치수들 확인
  const cadRes = await executeSQL(`
    SELECT raw_text, layer, entity_type
    FROM cad_objects
    WHERE parse_run_id = 'parse_1789766345349'
      AND (raw_text LIKE '%ROLLER%' OR raw_text LIKE '%240314-DV2-016%' OR raw_text LIKE '%Ø%' OR raw_text LIKE '%%')
      AND raw_text IS NOT NULL
    LIMIT 100
  `);
  console.log('\n240314-DV2-016 주변 CAD 텍스트 샘플:');
  console.log(cadRes.rows?.map((r: any) => r.raw_text).slice(0, 30));
}

main().catch(console.error);
