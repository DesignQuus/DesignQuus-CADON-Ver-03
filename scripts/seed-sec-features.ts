import { db, insertRows } from '../src/lib/db';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function generateFeaturesAndMrp() {
  const caseId = 'case_1789894718545';
  console.log(`=== 케이스 ${caseId} 피처 생성 및 MRP 계산 ===`);

  const drawings = await db.prepare(`
    SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC
  `).all(caseId) as any[];

  console.log(`도면 총 건수: ${drawings.length}장`);

  const featRows: any[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < drawings.length; i++) {
    const d = drawings[i];
    let bbox = { width: 300, length: 200, thickness: 3 };
    try {
      const fb = JSON.parse(d.frame_bbox_json || '{}');
      if (fb.width && fb.height) {
        bbox.width = Math.min(Math.round(fb.width), 1000);
        bbox.length = Math.min(Math.round(fb.height), 1000);
      }
    } catch {}

    const isBar = (d.drawing_name_raw || '').includes('SHAFT') || (d.drawing_name_raw || '').includes('축');
    const shape = isBar ? 'ROUND_BAR' : 'SHEET';
    const dia = isBar ? 30 : null;
    const t = isBar ? null : 3;

    let weight = 0;
    if (shape === 'SHEET') {
      weight = Number(((bbox.width * bbox.length * 3 * 7.85) / 1_000_000).toFixed(3));
    } else {
      const r = 15;
      const len = Math.max(bbox.width, bbox.length);
      weight = Number(((Math.PI * r * r * len * 7.85) / 1_000_000).toFixed(3));
    }

    const featId = `feat_${caseId}_${i + 1}`;
    const rawMeta = {
      drawingNo: d.drawing_no_normalized || d.drawing_no_raw,
      partName: d.drawing_name_raw,
      materialShape: shape,
      realThickness: t,
      diameter: dia,
      isAssembly: false,
      status: 'CONFIRMED',
      note: shape === 'ROUND_BAR' ? `환봉(Ø${dia})` : `판재(t${t})`
    };

    featRows.push({
      id: featId,
      quotation_case_id: caseId,
      drawing_id: d.id,
      bom_item_id: null,
      process_type: shape === 'ROUND_BAR' ? 'MACHINING' : 'SHEET_METAL',
      material_code: d.material || 'SS400',
      material_density: 7.85,
      bbox_width: bbox.width,
      bbox_length: bbox.length,
      bbox_thickness: shape === 'ROUND_BAR' ? 30 : 3,
      cutting_length_total: (bbox.width + bbox.length) * 2,
      pierce_count: 4,
      bending_count: shape === 'SHEET' ? 2 : 0,
      through_hole_count: 4,
      tap_hole_count: 2,
      part_weight_kg: weight,
      surface_area_cm2: (bbox.width * bbox.length * 2) / 100,
      heat_treatment: '-',
      surface_treatment: '-',
      raw_features_json: JSON.stringify(rawMeta),
      created_at: now
    });
  }

  await insertRows('part_fabrication_features', featRows);
  console.log(`part_fabrication_features ${featRows.length}건 등록 완료!`);

  // MRP 계산 실행
  const mrpRes = await runMrpExplosion(caseId);
  console.log('=== MRP 엔진 실행 결과 ===');
  console.log(`- 단품 건수: ${mrpRes.flattenedParts.length}장`);
  console.log(`- 판재 중량: ${mrpRes.audit.sheetTotalWeightKg} kg`);
  console.log(`- 환봉 중량: ${mrpRes.audit.roundBarTotalWeightKg} kg`);
  console.log(`- 총 원자재 중량: ${mrpRes.audit.systemTotalWeightKg} kg`);
  console.log(`- 모수 일치 여부: ${mrpRes.audit.isCountMatched}`);
  console.log(`- 중량 보존 여부: ${mrpRes.audit.isWeightConserved}`);
}

generateFeaturesAndMrp().catch(console.error);
