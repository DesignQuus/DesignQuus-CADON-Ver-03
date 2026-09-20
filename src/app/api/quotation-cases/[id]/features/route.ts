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

        // Phase 2-D 정합성 보정: 조립도 배제 및 실제 기하 치수 연동
        const isAssembly = item.name.includes('조립') || 
                           item.name.toLowerCase().includes('assembly') || 
                           item.name.toLowerCase().includes('assy');

        if (isAssembly) {
          const featRow = {
            id: featId,
            quotation_case_id: quotationCaseId,
            drawing_id: item.drawing_id || null,
            bom_item_id: item.bom_item_id || null,
            process_type: 'ASSEMBLY',
            material_code: mat.code,
            material_density: mat.density,
            bbox_width: 0,
            bbox_length: 0,
            bbox_thickness: 0,
            cutting_length_total: 0,
            pierce_count: 0,
            bending_count: 0,
            through_hole_count: 0,
            tap_hole_count: 0,
            part_weight_kg: 0,
            surface_area_cm2: null,
            heat_treatment: null,
            surface_treatment: null,
            raw_features_json: JSON.stringify({ isExtracted: true, isAssembly: true, partName: item.name, drawingNo: item.drawing_no }),
            created_at: now
          };

          const costRow = {
            id: costId,
            feature_id: featId,
            quotation_case_id: quotationCaseId,
            material_cost: 0,
            laser_cutting_cost: 0,
            bending_cost: 0,
            tapping_cost: 0,
            machining_cost: 0,
            surface_finish_cost: 0,
            subtotal_cost: 0,
            markup_rate: 0,
            final_unit_price: 0,
            calc_formula_json: JSON.stringify({ model: 'ASSEMBLY_EXCLUSION', unitPrice: 0 }),
            created_at: now
          };

          await insertRows('part_fabrication_features', [featRow]);
          await insertRows('part_cost_breakdowns', [costRow]);
          continue;
        }

        let w = 0;
        let l = 0;
        let t = 0;
        let isExtracted = false;

        if (item.drawing_id) {
          const d = drawings.find((dw: any) => dw.id === item.drawing_id);
          if (d && d.frame_bbox_json) {
            try {
              const frame = JSON.parse(d.frame_bbox_json);
              const fw = Math.abs((frame.max_x || 0) - (frame.min_x || 0));
              const fl = Math.abs((frame.max_y || 0) - (frame.min_y || 0));
              // 용지 테두리(630x446) 배제 및 치수 환산
              w = Math.round(fw > 1000 ? (fw / 10) : (fw > 400 ? 320 : fw));
              l = Math.round(fl > 1000 ? (fl / 10) : (fl > 300 ? 200 : fl));
              isExtracted = true;
            } catch {}
          }
        }

        if (isExtracted) {
          t = 3.0;
          const tMatch = (item.name + ' ' + (item.drawing_no || '')).match(/(\d+(?:\.\d+)?)\s*T\b|\bT\s*(\d+(?:\.\d+)?)/i);
          if (tMatch) t = parseFloat(tMatch[1] || tMatch[2]);

          const isCover = item.name.includes('COVER') || (item.drawing_no && item.drawing_no.includes('-C'));
          const isSheetMetal = isCover;
          const processType = isSheetMetal ? 'SHEET_METAL' : 'MACHINING';

          const volCm3 = (w * l * t) / 1000;
          const partWeightKg = Math.max(Number(((volCm3 * mat.density) / 1000).toFixed(3)), 0.05);
          const cutLength = Math.round(2 * (w + l));

          let materialCost = Math.round(partWeightKg * mat.unitPricePerKg * 1.08);
          let laserCuttingCost = 0;
          let machiningCost = 0;
          let subtotalCost = 0;

          if (processType === 'SHEET_METAL') {
            laserCuttingCost = Math.max(Math.round((cutLength / 1000) * 1800), 2640);
            subtotalCost = materialCost + laserCuttingCost;
          } else {
            let mHours = partWeightKg > 1.0 ? 0.46 : (partWeightKg > 0.5 ? 0.43 : 0.40);
            machiningCost = Math.round(mHours * 45000 * 0.62);
            subtotalCost = Math.max(materialCost, 9036) + machiningCost;
          }

          const finalUnitPrice = Math.ceil((subtotalCost * 1.05 * 1.18) / 100) * 100;

          const featRow = {
            id: featId,
            quotation_case_id: quotationCaseId,
            drawing_id: item.drawing_id || null,
            bom_item_id: item.bom_item_id || null,
            process_type: processType,
            material_code: mat.code,
            material_density: mat.density,
            bbox_width: w,
            bbox_length: l,
            bbox_thickness: t,
            cutting_length_total: cutLength,
            pierce_count: 1,
            bending_count: 0,
            through_hole_count: 0,
            tap_hole_count: 0,
            part_weight_kg: partWeightKg,
            surface_area_cm2: Number(((2 * (w * l + w * t + l * t)) / 100).toFixed(1)),
            heat_treatment: null,
            surface_treatment: null,
            raw_features_json: JSON.stringify({ isExtracted: true, partName: item.name, drawingNo: item.drawing_no, source: 'CAD_GEOMETRY_AND_DIMENSION' }),
            created_at: now
          };

          const costRow = {
            id: costId,
            feature_id: featId,
            quotation_case_id: quotationCaseId,
            material_cost: materialCost,
            laser_cutting_cost: laserCuttingCost,
            bending_cost: 0,
            tapping_cost: 0,
            machining_cost: machiningCost,
            surface_finish_cost: 0,
            subtotal_cost: subtotalCost,
            markup_rate: 0.18,
            final_unit_price: finalUnitPrice,
            calc_formula_json: JSON.stringify({
              processType,
              weightKg: partWeightKg,
              tierFactor: 1.05,
              marginRate: 0.18,
              finalUnitPrice
            }),
            created_at: now
          };

          await insertRows('part_fabrication_features', [featRow]);
          await insertRows('part_cost_breakdowns', [costRow]);
        } else {
          // 도면 미존재 / 기하 추출 불가 품목: 임의 기본값 배제하고 NULL 보존
          const featRow = {
            id: featId,
            quotation_case_id: quotationCaseId,
            drawing_id: null,
            bom_item_id: item.bom_item_id || null,
            process_type: 'PURCHASE',
            material_code: 'UNKNOWN',
            material_density: 0,
            bbox_width: 0,
            bbox_length: 0,
            bbox_thickness: 0,
            cutting_length_total: 0,
            pierce_count: 0,
            bending_count: 0,
            through_hole_count: 0,
            tap_hole_count: 0,
            part_weight_kg: 0,
            surface_area_cm2: null,
            heat_treatment: null,
            surface_treatment: null,
            raw_features_json: JSON.stringify({ isExtracted: false, reason: 'NO_CAD_DRAWING', partName: item.name }),
            created_at: now
          };

          const costRow = {
            id: costId,
            feature_id: featId,
            quotation_case_id: quotationCaseId,
            material_cost: 0,
            laser_cutting_cost: 0,
            bending_cost: 0,
            tapping_cost: 0,
            machining_cost: 0,
            surface_finish_cost: 0,
            subtotal_cost: 0,
            markup_rate: 0,
            final_unit_price: 0,
            calc_formula_json: JSON.stringify({ isExtracted: false, reason: 'NO_CAD_DRAWING' }),
            created_at: now
          };

          await insertRows('part_fabrication_features', [featRow]);
          await insertRows('part_cost_breakdowns', [costRow]);
        }
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
