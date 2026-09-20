import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  
  // 1. drawings 정보
  const dwgsRes = await executeSQL(`SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type FROM drawings WHERE quotation_case_id = '${caseId}'`);
  const dwgMap = new Map((dwgsRes.rows || []).map((d: any) => [d.drawing_no_normalized, d]));

  // 2. features 정보
  const featRes = await executeSQL(`SELECT drawing_id, process_type, material_code, bbox_width, bbox_length, bbox_thickness, part_weight_kg, raw_features_json FROM part_fabrication_features WHERE quotation_case_id = '${caseId}'`);
  const featMap = new Map();
  for (const f of featRes.rows || []) {
    let parsed: any = {};
    try { parsed = JSON.parse(f.raw_features_json); } catch {}
    featMap.set(parsed.drawingNo, { ...f, parsed });
  }

  // 3. relationships 정보
  const relsRes = await executeSQL(`SELECT parent_drawing_no, child_drawing_no FROM drawing_relationships WHERE quotation_case_id = '${caseId}'`);
  const parentMap = new Map<string, string[]>();
  for (const r of relsRes.rows || []) {
    if (!parentMap.has(r.parent_drawing_no)) parentMap.set(r.parent_drawing_no, []);
    parentMap.get(r.parent_drawing_no)!.push(r.child_drawing_no);
  }

  // 루트에서 DFS 탐색
  const leaves: any[] = [];
  const assemblies: any[] = [];

  function traverse(no: string, parentNo: string | null, level: number, multiplier: number) {
    const children = parentMap.get(no) || [];
    const dwg = dwgMap.get(no);
    const feat = featMap.get(no);
    const isAssy = children.length > 0 || dwg?.drawing_type === 'ASSEMBLY' || no.endsWith('-000') || no.endsWith('-00-000');

    if (isAssy) {
      assemblies.push({ no, level, name: dwg?.drawing_name_raw, childrenCount: children.length });
      for (const c of children) {
        traverse(c, no, level + 1, multiplier * 1);
      }
    } else {
      leaves.push({
        no,
        parentNo,
        level,
        name: dwg?.drawing_name_raw,
        material: feat?.material_code,
        shape: feat?.parsed?.materialShape,
        thickness: feat?.parsed?.realThickness,
        diameter: feat?.parsed?.diameter,
        weight: feat?.part_weight_kg,
        qty: multiplier
      });
    }
  }

  traverse('240314-00-000', null, 0, 1);

  console.log(`BOM 트리 전개 결과:`);
  console.log(`- 조립체 노드 수: ${assemblies.length}개`);
  console.log(`- 단품(Leaf) 총 등장 수량: ${leaves.reduce((acc, l) => acc + l.qty, 0)} EA`);
  console.log(`- 고유 단품(Leaf) 수: ${new Set(leaves.map(l => l.no)).size}개`);

  // 형상별 집계
  const sheets = leaves.filter(l => l.shape === 'SHEET');
  const roundBars = leaves.filter(l => l.shape === 'ROUND_BAR');
  console.log(`- 판재(SHEET) 수량: ${sheets.reduce((acc, s) => acc + s.qty, 0)} EA (고유: ${new Set(sheets.map(s => s.no)).size}개)`);
  console.log(`- 환봉(ROUND_BAR) 수량: ${roundBars.reduce((acc, r) => acc + r.qty, 0)} EA (고유: ${new Set(roundBars.map(r => r.no)).size}개)`);

  const sheetWeight = sheets.reduce((acc, s) => acc + (s.weight * s.qty), 0);
  const roundBarWeight = roundBars.reduce((acc, r) => acc + (r.weight * r.qty), 0);
  console.log(`- 판재 총중량: ${sheetWeight.toFixed(3)} kg`);
  console.log(`- 환봉 총중량: ${roundBarWeight.toFixed(3)} kg`);
  console.log(`- 가공/판금 합계 중량: ${(sheetWeight + roundBarWeight).toFixed(3)} kg`);
}

main().catch(console.error);
