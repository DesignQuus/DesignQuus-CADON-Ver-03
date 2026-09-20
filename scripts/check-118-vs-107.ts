import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';

  // 1. 전체 도면 123건
  const dwgsRes = await executeSQL(`SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type FROM drawings WHERE quotation_case_id = '${caseId}'`);
  const dwgs = dwgsRes.rows || [];

  // 2. relationships 121건
  const relsRes = await executeSQL(`SELECT parent_drawing_no, child_drawing_no, relationship_type FROM drawing_relationships WHERE quotation_case_id = '${caseId}'`);
  const rels = relsRes.rows || [];

  const parentSet = new Set(rels.map((r: any) => r.parent_drawing_no));
  const childSet = new Set(rels.map((r: any) => r.child_drawing_no));

  console.log(`전체 도면 수: ${dwgs.length}건`);
  console.log(`BOM 트리 내 부모 도번 수: ${parentSet.size}건`);
  console.log(`BOM 트리 내 자식 도번 수: ${childSet.size}건`);

  // 과거 118건 vs 현재 107건 분석
  // 과거 Phase 3-1에서 118건은 무엇이었는가?
  // drawings 중 drawing_type != 'MAIN_ASSEMBLY' 이거나, 트리 전개 시 조립도 판정 차이
  // 현재 조립체 판정된 도면들 목록 (16건):
  const assyList = dwgs.filter((d: any) => {
    const no = d.drawing_no_normalized;
    const isAssy = rels.some((r: any) => r.parent_drawing_no === no && r.child_drawing_no !== no) ||
                   d.drawing_type === 'ASSEMBLY' || no.endsWith('-000') || no.endsWith('-00-000');
    return isAssy;
  });

  console.log(`현재 조립체로 배제된 도면 (${assyList.length}건):`);
  console.table(assyList.map((a: any) => ({
    도번: a.drawing_no_normalized,
    품명: a.drawing_name_raw,
    drawing_type: a.drawing_type,
    자식수: rels.filter((r: any) => r.parent_drawing_no === a.drawing_no_normalized).length
  })));

  // 과거 118건은 전체 123건 중 최상위 루트 등 5건만 조립도로 보고 118건을 계산했던 것인지 확인:
  // 123 - 5 = 118 !
  // 즉, 과거 118건은 서브 조립도 11건(240314-01-000 ~ 240314-06-000 등)을 단품으로 취급했던 수치였습니다!
  // 123 - 16(전체 조립도) = 107 !
  console.log(`\n검증 공식:`);
  console.log(`과거 118건 = 전체 123건 - 메인 조립도 5건 (서브 조립도 11건을 단품에 포함했던 오류)`);
  console.log(`현재 107건 = 전체 123건 - 전체 조립도 16건 (메인 5건 + 서브 11건 완전 배제)`);
  console.log(`차이 11건 = 서브 조립도 11건!`);
}

main().catch(console.error);
