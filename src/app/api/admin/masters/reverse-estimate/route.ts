import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  estimateSheetMetalRates,
  estimateMachiningRates,
  reverseEstimateTargetPrice,
  PartRegressionSample
} from '@/lib/rate-regression';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    // 1. 순수 실무자 확정 단가(MANUAL_REVIEW & CONFIRMED)만 종속변수로 조회 (엔진 산출값 역참조 순환논리 원천 차단)
    const rows = (await db.prepare(`
      SELECT f.id, f.process_type, f.material_code, f.bbox_width, f.bbox_length, f.bbox_thickness,
             f.cutting_length_total, f.bending_count, f.part_weight_kg, f.raw_features_json,
             CASE 
               WHEN qi.price_status = 'CONFIRMED' AND qi.unit_price > 0 THEN qi.unit_price 
               ELSE 0 
             END as confirmed_price,
             COALESCE(c.material_cost, 0) as material_cost
      FROM part_fabrication_features f
      LEFT JOIN part_cost_breakdowns c ON f.id = c.feature_id
      LEFT JOIN quote_items qi ON f.bom_item_id = qi.final_bom_item_id
      WHERE f.process_type IN ('SHEET_METAL', 'MACHINING')
    `).all()) as any[];

    const samples: PartRegressionSample[] = rows.map((r) => {
      let raw: any = {};
      try {
        if (r.raw_features_json) raw = JSON.parse(r.raw_features_json);
      } catch {}

      return {
        id: r.id,
        partName: raw.partName || '부품',
        processType: r.process_type,
        materialCode: r.material_code || 'UNKNOWN',
        materialCost: Number(r.material_cost) || 0,
        confirmedPrice: Number(r.confirmed_price) || 0,
        cuttingLengthMeter: Number(((Number(r.cutting_length_total) || 0) / 1000).toFixed(2)),
        bendingCount: Number(r.bending_count) || 0,
        weightKg: Number(r.part_weight_kg) || 0
      };
    });

    const confirmedSheet = samples.filter((s) => s.processType === 'SHEET_METAL' && s.confirmedPrice > 0);
    const confirmedMach = samples.filter((s) => s.processType === 'MACHINING' && s.confirmedPrice > 0);

    const MIN_REQUIRED_SAMPLES = 10;
    const isSheetReady = confirmedSheet.length >= MIN_REQUIRED_SAMPLES;
    const isMachReady = confirmedMach.length >= MIN_REQUIRED_SAMPLES;

    const sheetResult = isSheetReady ? estimateSheetMetalRates(samples) : null;
    const machResult = isMachReady ? estimateMachiningRates(samples) : null;

    return NextResponse.json({
      success: true,
      status: (isSheetReady || isMachReady) ? 'READY' : 'INSUFFICIENT_DATA',
      message: (isSheetReady && isMachReady)
        ? '회귀 분석 완료'
        : `데이터 축적 중 (현재 실무자 확정 판금 ${confirmedSheet.length}건, 가공 ${confirmedMach.length}건 / 공정별 최소 ${MIN_REQUIRED_SAMPLES}건 필요)`,
      minRequiredSamples: MIN_REQUIRED_SAMPLES,
      totalSamples: samples.length,
      confirmedSamplesCount: confirmedSheet.length + confirmedMach.length,
      sheetMetalConfirmedCount: confirmedSheet.length,
      machiningConfirmedCount: confirmedMach.length,
      sheetMetal: sheetResult,
      machining: machResult
    });
  } catch (error: any) {
    console.error('Failed to run rate regression:', error);
    return NextResponse.json({ error: error.message || '역산 분석 실패' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      processType,
      targetPrice,
      materialCost,
      cuttingLengthMeter,
      bendingCount,
      weightKg,
      currentRates
    } = body;

    if (!targetPrice || targetPrice <= 0) {
      return NextResponse.json({ error: '목표 단가를 올바르게 입력해 주세요.' }, { status: 400 });
    }

    const result = reverseEstimateTargetPrice({
      processType: processType || 'SHEET_METAL',
      targetPrice: Number(targetPrice),
      materialCost: Number(materialCost) || 0,
      cuttingLengthMeter: Number(cuttingLengthMeter) || 1.0,
      bendingCount: Number(bendingCount) || 0,
      weightKg: Number(weightKg) || 1.0,
      currentRates: {
        laserRatePerMeter: Number(currentRates?.laserRatePerMeter) || 1800,
        bendRatePerStroke: Number(currentRates?.bendRatePerStroke) || 800,
        machineRatePerHour: Number(currentRates?.machineRatePerHour) || 45000
      }
    });

    return NextResponse.json({
      success: true,
      result
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '목표단가 역산 실패' }, { status: 500 });
  }
}
