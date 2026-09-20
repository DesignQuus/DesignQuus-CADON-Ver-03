import { NextRequest, NextResponse } from 'next/server';
import { runMrpExplosion } from '@/lib/mrp-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 조건 B: quotation_case_id 하드 바인딩 (전달된 id 또는 타깃 케이스)
    const caseId = id || 'case_1789766302590';
    
    const result = await runMrpExplosion(caseId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to run MRP explosion:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caseId = id || 'case_1789766302590';
    const body = await request.json();
    const { drawingId, drawingNo, shape = 'SHEET', thickness, diameter, length: customLength, width: customWidth } = body;

    if (!drawingNo && !drawingId) {
      return NextResponse.json(
        { error: '도면 번호(drawingNo) 또는 도면 ID(drawingId)가 필요합니다.' },
        { status: 400 }
      );
    }

    if (shape === 'ROUND_BAR') {
      if (!diameter || typeof diameter !== 'number' || diameter <= 0 || diameter > 500) {
        return NextResponse.json(
          { error: '환봉의 경우 유효한 직경(Ø, 0 초과 500 이하)을 입력해주세요.' },
          { status: 400 }
        );
      }
    } else {
      if (!thickness || typeof thickness !== 'number' || thickness <= 0 || thickness > 150) {
        return NextResponse.json(
          { error: '판재/각재의 경우 유효한 두께값(0 초과 150 이하)을 입력해주세요.' },
          { status: 400 }
        );
      }
    }

    const { executeSQL, updateRows } = await import('../../../../../../egdesk-helpers');

    // 대상 부품 피처 조회 (drawingId 우선, 없으면 drawingNo 바인딩)
    const filterClause = drawingId 
      ? `d.id = '${drawingId}'`
      : `d.drawing_no_normalized = '${drawingNo}'`;

    const featRes = await executeSQL(`
      SELECT f.id, f.bbox_width, f.bbox_length, f.material_density, f.raw_features_json,
             d.id as drawing_id, d.drawing_no_normalized, d.drawing_name_raw
      FROM part_fabrication_features f
      JOIN drawings d ON f.drawing_id = d.id
      WHERE f.quotation_case_id = '${caseId}'
        AND ${filterClause}
    `);

    if (!featRes.rows || featRes.rows.length === 0) {
      return NextResponse.json(
        { error: `해당 도면에 대한 가공 피처를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    for (const f of featRes.rows) {
      let parsed: any = {};
      try { parsed = JSON.parse(f.raw_features_json); } catch {}

      const density = Number(f.material_density) || 7.85;
      let partWeightKg = 0;
      let updatedRawJsonObj: any = {};

      if (shape === 'ROUND_BAR') {
        const dia = Number(diameter);
        const radius = dia / 2;
        // 길이 L: 사용자 지정 길이 > 기존 폭/길이 중 큰 값 > 100
        const len = customLength || Math.max(Number(f.bbox_length) || 0, Number(f.bbox_width) || 0) || 100;
        // 원기둥 체적: π * r² * L (mm³) / 1000 = cm³
        const volCm3 = (Math.PI * Math.pow(radius, 2) * len) / 1000;
        partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));

        updatedRawJsonObj = {
          ...parsed,
          materialShape: 'ROUND_BAR',
          diameter: dia,
          realThickness: null,
          status: 'CONFIRMED',
          source: 'HUMAN_INPUT',
          confirmedBy: 'USER_EXPERT',
          note: `실무자 수동입력(환봉 Ø${dia}×L${len})`,
          updatedAt: new Date().toISOString()
        };

        await updateRows('part_fabrication_features', {
          bbox_thickness: dia,
          bbox_length: len,
          part_weight_kg: partWeightKg,
          raw_features_json: JSON.stringify(updatedRawJsonObj)
        }, { filters: { id: f.id } });
      } else {
        const thick = Number(thickness);
        const width = customWidth || Number(f.bbox_width) || 150;
        const len = customLength || Number(f.bbox_length) || width;

        const volCm3 = (width * len * thick) / 1000;
        partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));

        updatedRawJsonObj = {
          ...parsed,
          materialShape: shape,
          realThickness: thick,
          diameter: null,
          status: 'CONFIRMED',
          source: 'HUMAN_INPUT',
          confirmedBy: 'USER_EXPERT',
          note: `실무자 수동입력(${shape === 'SQUARE_BAR' ? '각재' : '판재'} t${thick})`,
          updatedAt: new Date().toISOString()
        };

        await updateRows('part_fabrication_features', {
          bbox_thickness: thick,
          bbox_width: width,
          bbox_length: len,
          part_weight_kg: partWeightKg,
          raw_features_json: JSON.stringify(updatedRawJsonObj)
        }, { filters: { id: f.id } });
      }
    }

    // 최신 MRP 결과 즉시 재산출 반환
    const updatedResult = await runMrpExplosion(caseId);
    return NextResponse.json({
      success: true,
      message: `${drawingNo || drawingId} ${shape === 'ROUND_BAR' ? `환봉 Ø${diameter}` : `판재 t${thickness}`} 적용 완료`,
      result: updatedResult
    });
  } catch (error: any) {
    console.error('Failed to update thickness in MRP:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

