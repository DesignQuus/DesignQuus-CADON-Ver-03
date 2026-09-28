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
    const now = new Date().toISOString();
    const todayStr = now.substring(0, 10);

    // 케이스 정보 조회 (회사 ID 참조용)
    const qc = (await db.prepare('SELECT company_id FROM quotation_cases WHERE id = ?').get(caseId)) as any;
    const companyId = qc?.company_id || null;

    // 마스터 코드 유효성 검증: 도면 규격이나 축척 파편(1.2T, Ø17..., 1/ 등)이 마스터 코드로 들어가는 현상 원천 방지
    const sanitizeMasterCode = async (rawCode: string, name: string): Promise<string> => {
      const trimmed = (rawCode || '').trim();
      const isNoise = !trimmed || 
        trimmed.length < 2 || 
        /^\d+(\.\d+)?T$/i.test(trimmed) || 
        trimmed.startsWith('Ø') || 
        trimmed.includes('/') || 
        (trimmed.includes('×') && /\d/.test(trimmed));

      if (!isNoise && (trimmed.startsWith('STD-') || /^[A-Z0-9_\-]+$/i.test(trimmed))) {
        return trimmed;
      }

      // 표준 STD-{PREFIX}-{NUM} 자동 채번
      const upper = (name || '').toUpperCase();
      let prefix = 'ETC';
      if (upper.includes('SHAFT') || upper.includes('PIN')) prefix = 'SHT';
      else if (upper.includes('PLATE') || upper.includes('CAP')) prefix = 'PLT';
      else if (upper.includes('BRACKET') || upper.includes('B/K')) prefix = 'BKT';
      else if (upper.includes('ROLLER')) prefix = 'ROL';
      else if (upper.includes('COVER')) prefix = 'CVR';
      else if (upper.includes('GUIDE') || upper.includes('POST') || upper.includes('STAY') || upper.includes('STOPPER') || upper.includes('COLLAR')) prefix = 'GDE';
      else if (upper.includes('CDQ') || upper.includes('LMF')) prefix = 'PUR';
      else if (upper.includes('CONVEYOR') || upper.includes('DRIVE') || upper.includes('GATE') || upper.includes('MAIN C/V') || upper.includes('SUB C/V')) prefix = 'ASY';

      const existingCodes = (await db.prepare(
        "SELECT master_code FROM product_masters WHERE master_code LIKE ?"
      ).all(`STD-${prefix}-%`)) as any[];

      let maxNum = 0;
      for (const row of existingCodes) {
        const parts = (row.master_code || '').split('-');
        if (parts.length === 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }

      return `STD-${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
    };

    const processSingleItem = async (item: {
      partNo: string;
      partName: string;
      partType?: string;
      material?: string;
      specification?: string;
      unitPrice?: number;
      unitCost?: number;
      remark?: string;
    }) => {
      const {
        partNo,
        partName,
        partType = 'MACHINING',
        material = 'SS400',
        specification = '',
        unitPrice = 0,
        unitCost = 0,
        remark = ''
      } = item;

      if (!partNo || !partName || unitPrice <= 0) {
        return null;
      }

      const effectiveMasterCode = await sanitizeMasterCode(partNo, partName);

      let existingProduct = (await db.prepare(
        'SELECT id, master_code FROM product_masters WHERE master_code = ?'
      ).get(effectiveMasterCode)) as any;

      let productId = existingProduct?.id;

      if (productId) {
        await db.prepare(`
          UPDATE product_masters
          SET standard_name = ?, category = ?, specification = ?, material = ?
          WHERE id = ?
        `).run(partName, partType, specification, material, productId);
      } else {
        productId = `pm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(`
          INSERT INTO product_masters (
            id, company_id, master_code, standard_name, category, specification, material, unit, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          productId,
          companyId,
          effectiveMasterCode,
          partName,
          partType,
          specification,
          material,
          'EA',
          'ACTIVE',
          now
        );
      }

      // 2. price_masters 이력 관리 등록/갱신
      const existingPrice = (await db.prepare(`
        SELECT id FROM price_masters 
        WHERE master_id = ? 
          AND (company_id = ? OR (company_id IS NULL AND ? IS NULL)) 
          AND is_active = 1
      `).get(productId, companyId, companyId)) as any;

      if (existingPrice) {
        await db.prepare(`
          UPDATE price_masters
          SET effective_to = ?, is_active = 0
          WHERE id = ?
        `).run(todayStr, existingPrice.id);
      }

      const priceId = `prc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.prepare(`
        INSERT INTO price_masters (
          id, master_id, company_id, price_type, unit_price, currency, effective_from, effective_to, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)
      `).run(
        priceId,
        productId,
        companyId,
        'STANDARD',
        unitPrice,
        'KRW',
        todayStr,
        now
      );

      // 3. manual_price_pool 축적
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
        remark || '단가 검토 마스터 적재',
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

      return { productId, masterCode: effectiveMasterCode, partNo, partName, unitPrice };
    };

    // 다중 품목 일괄 등록 (Batch Mode)
    if (Array.isArray(body.items)) {
      if (body.items.length === 0) {
        return NextResponse.json({ error: '등록할 품목이 선택되지 않았습니다.' }, { status: 400 });
      }

      const results = [];
      for (const item of body.items) {
        const res = await processSingleItem(item);
        if (res) results.push(res);
      }

      await recordActivity(req, session, {
        activityType: 'PRICE_UPDATE',
        quotationCaseId: caseId,
        details: `사내 마스터 DB 일괄 등록 완료 (총 ${results.length}건)`
      });

      return NextResponse.json({
        success: true,
        count: results.length,
        message: `총 ${results.length}건의 품목이 사내 마스터 DB 및 기준 단가로 일괄 등록되었습니다.`,
        registeredItems: results
      });
    }

    // 단일 품목 등록 (Single Mode)
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

    const singleResult = await processSingleItem({
      partNo,
      partName,
      partType,
      material,
      specification,
      unitPrice,
      unitCost,
      remark
    });

    if (!singleResult) {
      return NextResponse.json({ error: '마스터 DB 적재 처리 실패' }, { status: 500 });
    }

    await recordActivity(req, session, {
      activityType: 'PRICE_UPDATE',
      quotationCaseId: caseId,
      details: `[${partNo}] ${partName} 마스터 DB 적재 완료 (₩${unitPrice.toLocaleString()})`
    });

    return NextResponse.json({
      success: true,
      message: `[${partNo}] 품목이 마스터 DB 및 기준 단가로 영구 등록되었습니다.`,
      productId: singleResult.productId,
      masterCode: singleResult.masterCode,
      unitPrice: singleResult.unitPrice
    });
  } catch (err: any) {
    console.error('save-to-master API error:', err);
    return NextResponse.json({ error: err.message || '마스터 DB 적재 실패' }, { status: 500 });
  }
}
