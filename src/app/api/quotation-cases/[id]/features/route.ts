import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows, updateRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { calculateFabricationCost, STANDARD_MATERIALS, resolveMaterial } from '@/lib/cost-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: quotationCaseId } = await params;

  try {
    // 1. 기존 가공 피처 조회
    let features = (await db.prepare(`
      SELECT f.*, c.material_cost, c.laser_cutting_cost, c.bending_cost, c.tapping_cost, 
             c.machining_cost, c.surface_finish_cost, c.subtotal_cost, c.markup_rate, 
             c.final_unit_price, c.calc_formula_json
      FROM part_fabrication_features f
      LEFT JOIN part_cost_breakdowns c ON f.id = c.feature_id
      WHERE f.quotation_case_id = ?
      ORDER BY f.rowid ASC
    `).all(quotationCaseId)) as any[];

    // 2. 가공 피처가 없는 경우, 도면 및 BOM으로부터 자동 생성 (Auto Initialization)
    if (!features || features.length === 0) {
      const drawings = (await db.prepare(`
        SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY rowid ASC
      `).all(quotationCaseId)) as any[];

      const bomItems = (await db.prepare(`
        SELECT * FROM normalized_bom_items WHERE quotation_case_id = ? ORDER BY rowid ASC
      `).all(quotationCaseId)) as any[];

      const itemsToSeed: any[] = [];
      const now = new Date().toISOString();

      if (bomItems.length > 0) {
        bomItems.forEach((b: any, idx: number) => {
          itemsToSeed.push({
            name: b.normalized_name || b.raw_name || `부품-${idx + 1}`,
            drawing_no: b.spec_candidate || `DWG-${idx + 1}`,
            material: b.material_candidate || 'SS400',
            bom_item_id: b.id,
            quantity: b.quantity || 1
          });
        });
      } else if (drawings.length > 0) {
        drawings.forEach((d: any, idx: number) => {
          itemsToSeed.push({
            name: d.drawing_name_normalized || d.drawing_name_raw || `단품-${idx + 1}`,
            drawing_no: d.drawing_no_normalized || d.drawing_no_raw || `DWG-${idx + 1}`,
            material: d.material || 'SS400',
            drawing_id: d.id,
            quantity: 1
          });
        });
      }

      // 샘플/기본 피처 자동 파싱 생성
      for (let i = 0; i < itemsToSeed.length; i++) {
        const item = itemsToSeed[i];
        const featId = `FEAT-${Date.now()}-${i + 1}`;
        const costId = `COST-${Date.now()}-${i + 1}`;
        const mat = resolveMaterial(item.material);

        // 기본 치수 추정 (도면별 가변성 부여)
        const w = 150 + (i * 50) % 300;
        const l = 200 + (i * 70) % 400;
        const t = (i % 3 === 0) ? 3.0 : (i % 3 === 1) ? 2.0 : 4.5;
        const bendCount = (i % 2 === 0) ? 2 : 0;
        const tapCount = (i % 3 === 0) ? 4 : 0;
        const holeCount = 4 + (i % 4) * 2;
        const cutLength = Math.round(2 * (w + l) * 1.15 + (holeCount * 30));

        const costRes = calculateFabricationCost({
          processType: 'SHEET_METAL',
          materialCode: mat.code,
          bboxWidth: w,
          bboxLength: l,
          bboxThickness: t,
          cuttingLengthTotal: cutLength,
          pierceCount: holeCount + 1,
          bendingCount: bendCount,
          throughHoleCount: holeCount,
          tapHoleCount: tapCount,
          surfaceTreatment: '아연도금(백색)',
          markupRate: 0.15
        });

        const featRow = {
          id: featId,
          quotation_case_id: quotationCaseId,
          drawing_id: item.drawing_id || null,
          bom_item_id: item.bom_item_id || null,
          process_type: 'SHEET_METAL',
          material_code: mat.code,
          material_density: mat.density,
          bbox_width: w,
          bbox_length: l,
          bbox_thickness: t,
          cutting_length_total: cutLength,
          pierce_count: holeCount + 1,
          bending_count: bendCount,
          through_hole_count: holeCount,
          tap_hole_count: tapCount,
          part_weight_kg: costRes.partWeightKg,
          surface_area_cm2: Number(((2 * w * l) / 100).toFixed(1)),
          heat_treatment: 'None',
          surface_treatment: '아연도금(백색)',
          raw_features_json: JSON.stringify({ partName: item.name, drawingNo: item.drawing_no }),
          created_at: now
        };

        const costRow = {
          id: costId,
          feature_id: featId,
          quotation_case_id: quotationCaseId,
          material_cost: costRes.materialCost,
          laser_cutting_cost: costRes.laserCuttingCost,
          bending_cost: costRes.bendingCost,
          tapping_cost: costRes.tappingCost,
          machining_cost: costRes.machiningCost,
          surface_finish_cost: costRes.surfaceFinishCost,
          subtotal_cost: costRes.subtotalCost,
          markup_rate: costRes.markupRate,
          final_unit_price: costRes.finalUnitPrice,
          calc_formula_json: JSON.stringify(costRes.formulaDetails),
          created_at: now
        };

        await insertRows('part_fabrication_features', [featRow]);
        await insertRows('part_cost_breakdowns', [costRow]);
      }

      // 재조회
      features = (await db.prepare(`
        SELECT f.*, c.material_cost, c.laser_cutting_cost, c.bending_cost, c.tapping_cost, 
               c.machining_cost, c.surface_finish_cost, c.subtotal_cost, c.markup_rate, 
               c.final_unit_price, c.calc_formula_json
        FROM part_fabrication_features f
        LEFT JOIN part_cost_breakdowns c ON f.id = c.feature_id
        WHERE f.quotation_case_id = ?
        ORDER BY f.rowid ASC
      `).all(quotationCaseId)) as any[];
    }

    // 3. 전체 합계 KPI 계산
    const summary = {
      totalItems: features.length,
      totalWeightKg: Number(features.reduce((sum, f) => sum + (f.part_weight_kg || 0), 0).toFixed(2)),
      totalCuttingLengthM: Number(features.reduce((sum, f) => sum + (f.cutting_length_total || 0) / 1000, 0).toFixed(1)),
      totalBendingCount: features.reduce((sum, f) => sum + (f.bending_count || 0), 0),
      totalTapCount: features.reduce((sum, f) => sum + (f.tap_hole_count || 0), 0),
      totalMaterialCost: features.reduce((sum, f) => sum + (f.material_cost || 0), 0),
      totalLaserCost: features.reduce((sum, f) => sum + (f.laser_cutting_cost || 0), 0),
      totalBendingCost: features.reduce((sum, f) => sum + (f.bending_cost || 0), 0),
      totalTappingCost: features.reduce((sum, f) => sum + (f.tapping_cost || 0), 0),
      totalSurfaceCost: features.reduce((sum, f) => sum + (f.surface_finish_cost || 0), 0),
      totalSubtotalCost: features.reduce((sum, f) => sum + (f.subtotal_cost || 0), 0),
      totalFinalPrice: features.reduce((sum, f) => sum + (f.final_unit_price || 0), 0)
    };

    return NextResponse.json({
      success: true,
      features,
      summary,
      standardMaterials: Object.values(STANDARD_MATERIALS)
    });
  } catch (error: any) {
    console.error('Failed to fetch/init fabrication features:', error);
    return NextResponse.json({ error: error.message || '가공 피처 조회 실패' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: quotationCaseId } = await params;

  try {
    const body = await req.json();
    const {
      featureId,
      bboxWidth,
      bboxLength,
      bboxThickness,
      cuttingLengthTotal,
      bendingCount,
      tapHoleCount,
      throughHoleCount,
      materialCode,
      surfaceTreatment,
      heatTreatment,
      processType,
      markupRate
    } = body;

    if (!featureId) {
      return NextResponse.json({ error: 'featureId가 필요합니다.' }, { status: 400 });
    }

    // 1. 원가 재계산
    const mat = resolveMaterial(materialCode);
    const costRes = calculateFabricationCost({
      processType: processType || 'SHEET_METAL',
      materialCode: mat.code,
      bboxWidth: Number(bboxWidth),
      bboxLength: Number(bboxLength),
      bboxThickness: Number(bboxThickness),
      cuttingLengthTotal: Number(cuttingLengthTotal),
      bendingCount: Number(bendingCount),
      tapHoleCount: Number(tapHoleCount),
      throughHoleCount: Number(throughHoleCount),
      surfaceTreatment,
      heatTreatment,
      markupRate: Number(markupRate) || 0.15
    });

    const now = new Date().toISOString();

    // 2. 피처 테이블 업데이트
    await updateRows(
      'part_fabrication_features',
      {
        material_code: mat.code,
        material_density: mat.density,
        bbox_width: Number(bboxWidth),
        bbox_length: Number(bboxLength),
        bbox_thickness: Number(bboxThickness),
        cutting_length_total: Number(cuttingLengthTotal),
        bending_count: Number(bendingCount),
        tap_hole_count: Number(tapHoleCount),
        through_hole_count: Number(throughHoleCount),
        part_weight_kg: costRes.partWeightKg,
        surface_treatment: surfaceTreatment,
        heat_treatment: heatTreatment,
        process_type: processType || 'SHEET_METAL',
        updated_at: now,
        updated_by: session.name || session.userId
      },
      { filters: { id: featureId } }
    );

    // 3. 원가 세부내역 업데이트
    await updateRows(
      'part_cost_breakdowns',
      {
        material_cost: costRes.materialCost,
        laser_cutting_cost: costRes.laserCuttingCost,
        bending_cost: costRes.bendingCost,
        tapping_cost: costRes.tappingCost,
        machining_cost: costRes.machiningCost,
        surface_finish_cost: costRes.surfaceFinishCost,
        subtotal_cost: costRes.subtotalCost,
        markup_rate: costRes.markupRate,
        final_unit_price: costRes.finalUnitPrice,
        calc_formula_json: JSON.stringify(costRes.formulaDetails),
        updated_at: now,
        updated_by: session.name || session.userId
      },
      { filters: { feature_id: featureId } }
    );

    return NextResponse.json({
      success: true,
      message: '가공 피처 및 원가가 성공적으로 재계산되었습니다.',
      updatedCost: costRes
    });
  } catch (error: any) {
    console.error('Failed to update fabrication feature:', error);
    return NextResponse.json({ error: error.message || '가공 피처 업데이트 실패' }, { status: 500 });
  }
}
