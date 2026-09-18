import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: caseId } = await params;

  try {
    const body = await req.json();
    const {
      partNo,
      partName,
      partType = 'MACHINING',
      material = 'SS400',
      specification = '',
      unitPrice = 0,
      unitCost = 0,
      remark = ''
    } = body;

    if (!partNo || !partName) {
      return NextResponse.json(
        { error: '품번(도번)과 품명은 필수 입력 항목입니다.' },
        { status: 400 }
      );
    }

    if (unitPrice <= 0) {
      return NextResponse.json(
        { error: '유효한 단가(0원 초과)를 입력해야 마스터 DB에 등록할 수 있습니다.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const todayStr = now.substring(0, 10);

    // 케이스 정보 조회 (회사 ID 참조용)
    const qc = (await db.prepare('SELECT company_id FROM quotation_cases WHERE id = ?').get(caseId)) as any;
    const companyId = qc?.company_id || null;

    // 1. product_masters 조회 및 등록/갱신
    let existingProduct = (await db.prepare(
      'SELECT id, master_code FROM product_masters WHERE master_code = ?'
    ).get(partNo)) as any;

    let productId = existingProduct?.id;

    if (productId) {
      // 기존 품목 갱신
      await db.prepare(`
        UPDATE product_masters
        SET standard_name = ?, category = ?, specification = ?, material = ?
        WHERE id = ?
      `).run(partName, partType, specification, material, productId);
    } else {
      // 신규 마스터 품목 등록
      productId = `pm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.prepare(`
        INSERT INTO product_masters (
          id, company_id, master_code, standard_name, category, specification, material, unit, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        companyId,
        partNo,
        partName,
        partType,
        specification,
        material,
        'EA',
        'ACTIVE',
        now
      );
    }

    // 2. price_masters 조회 및 등록/갱신 (기준 단가)
    const existingPrice = (await db.prepare(`
      SELECT id FROM price_masters WHERE master_id = ? AND is_active = 1
    `).get(productId)) as any;

    if (existingPrice) {
      await db.prepare(`
        UPDATE price_masters
        SET unit_price = ?, effective_from = ?, company_id = ?
        WHERE id = ?
      `).run(unitPrice, todayStr, companyId, existingPrice.id);
    } else {
      const priceId = `prc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.prepare(`
        INSERT INTO price_masters (
          id, master_id, company_id, price_type, unit_price, currency, effective_from, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        priceId,
        productId,
        companyId,
        'STANDARD',
        unitPrice,
        'KRW',
        todayStr,
        1,
        now
      );
    }

    // 3. manual_price_pool 축적 (지식 풀 실시간 추천 연동)
    const mppId = `mpp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db.prepare(`
      INSERT INTO manual_price_pool (
        id, item_name, specification, material, unit_price, remark, quotation_case_id, company_id,
        standard_name, standard_material, approval_count, last_used_at, source, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mppId,
      partName,
      specification,
      material,
      unitPrice,
      remark || '2단계 단가 검토 마스터 적재',
      caseId,
      companyId,
      partName,
      material,
      1,
      todayStr,
      'MASTER_REGISTERED',
      session.userId || 'admin',
      now
    );

    // 4. price_history_v2 이력 등록
    const historyId = `prc_v2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await db.prepare(`
        INSERT INTO price_history_v2 (
          id, part_master_id, part_key, quotation_case_id, qty_tier, lot_quantity,
          material_cost, process_cost, subtotal_cost, margin_rate, unit_price,
          material_base_date, price_basis_type, basis_calc_json, is_ordered, confirmed_by,
          effective_from, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        productId,
        `${companyId || 'STD'}:${partNo}:A`,
        caseId,
        '10~99',
        1,
        unitCost ? Math.round(unitCost * 0.45) : Math.round(unitPrice * 0.35),
        unitCost ? Math.round(unitCost * 0.55) : Math.round(unitPrice * 0.45),
        unitCost || Math.round(unitPrice * 0.82),
        0.18,
        unitPrice,
        todayStr,
        'MASTER_PERSISTED',
        JSON.stringify({ note: '직접 검토 후 마스터 DB 적재' }),
        1,
        session.name || '검토자',
        todayStr,
        now
      );
    } catch (e) {
      console.warn('price_history_v2 insert non-critical warning:', e);
    }

    // 감사 로그 기록
    await recordActivity(req, session, {
      activityType: 'PRICE_UPDATE',
      quotationCaseId: caseId,
      details: `[${partNo}] ${partName} 마스터 DB 적재 완료 (₩${unitPrice.toLocaleString()})`
    });

    return NextResponse.json({
      success: true,
      message: `[${partNo}] 품목이 마스터 DB 및 기준 단가로 영구 등록되었습니다.`,
      productId,
      masterCode: partNo,
      unitPrice
    });
  } catch (err: any) {
    console.error('save-to-master API error:', err);
    return NextResponse.json({ error: err.message || '마스터 DB 적재 실패' }, { status: 500 });
  }
}
