import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

// 기본 소재 단가 및 공정 임률 설정 (제조업 표준 기준)
const DEFAULT_MATERIAL_RATES: Record<string, number> = {
  'SS400': 1800,       // 일반 구조용 탄소강
  'S45C': 2200,        // 기계구조용 탄소강
  'SCM440': 3200,      // 크롬몰리브덴 합금강
  'SUS304': 5500,      // 오스테나이트계 스테인리스강
  'SUS316': 7800,      // 고내식성 스테인리스강
  'AL6061': 6500,      // 압출/가공용 알루미늄
  'AL5052': 6200,      // 판금/절곡용 알루미늄
  'FC250': 2200,       // 회주철 주물재
  'FCD450': 2600,      // 구상흑연주철 주물재
  'SKD11': 9500,       // 냉간 금형 공구강
  'BsBM': 12000,       // 쾌삭 황동 / 동합금
  'MC-NYLON': 8500,    // 엔지니어링 플라스틱 (MC나일론)
  'POM': 7500          // 폴리아세탈 (아세탈)
};

const DEFAULT_PROCESS_RATES: Record<string, number> = {
  // 1. 기계 가공 (절삭)
  'HOURLY_MACHINE_RATE': 45000,       // CNC 머시닝센터 시간당 임률
  'HOURLY_LATHE_RATE': 40000,         // 범용 선반/밀링 시간당 임률
  'HOURLY_5AXIS_EDM_RATE': 65000,     // 5축/방전가공 시간당 임률
  'SETUP_BASE_COST': 30000,           // 기계가공 준비 셋업 기본료 (건당)

  // 2. 판금 / 제관
  'SHEET_LASER_PER_METER': 1800,      // 판금 레이저 절단 m당 단가
  'SHEET_BEND_PER_STROKE': 800,       // 판금 절곡(V-Bending) 1회당 단가
  'SHEET_PIERCING_RATE': 80,          // 레이저 피어싱(관통) 홀당 단가
  'HOURLY_WELDING_RATE': 38000,       // 제관 TIG/CO2 용접 시간당 임률

  // 3. 주조 / 주물
  'CASTING_PER_KG_RATE': 2500,        // 주조 형상 성형 kg당 공정비

  // 4. 후처리 / 열처리
  'PAINTING_PER_SQM': 9000,           // 분체도장/우레탄도장 ㎡당 단가
  'ANODIZING_PER_UNIT': 1500,         // 알루미늄 아노다이징 개당 기본료
  'HEAT_TREATMENT_PER_KG': 1200,      // 열처리(Q/T, 고주파) kg당 단가
  'TREATMENT_MIN_LOT_COST': 30000,    // 표면처리/열처리 외주 최소 로트 기본료 (건당)

  // 5. 조달 관리 & 조립 공수 & 물류
  'ELECTRICAL_OVERHEAD_RATE': 0.08,   // 전장/구매품 조달 및 검수 관리율 (8%)
  'HOURLY_ASSEMBLY_RATE': 35000,      // 유닛 조립/배선/검수 시간당 임률
  'PACKAGING_SHIPPING_RATE': 0.03,    // 포장 및 물류 운반비율 (3%)

  // 6. 목표 마진율
  'DEFAULT_MARGIN_RATE': 0.18         // 표준 목표 마진율 18%
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'products';
  const q = searchParams.get('q')?.trim() || '';
  const category = searchParams.get('category') || '';

  try {
    if (type === 'settings') {
      // 시스템 설정 조회
      const settings = (await db.prepare('SELECT * FROM system_settings WHERE key IN (?, ?)').all('MATERIAL_RATES', 'PROCESS_RATES')) as any[];
      const materialRates = { ...DEFAULT_MATERIAL_RATES };
      const processRates = { ...DEFAULT_PROCESS_RATES };

      settings.forEach(s => {
        try {
          const parsed = JSON.parse(s.value);
          if (s.key === 'MATERIAL_RATES') Object.assign(materialRates, parsed);
          if (s.key === 'PROCESS_RATES') Object.assign(processRates, parsed);
        } catch {}
      });

      return NextResponse.json({
        success: true,
        materialRates,
        processRates
      });
    }

    const onlyPriced = searchParams.get('onlyPriced') === 'true';

    // 마스터 품목 및 단가 목록 조회
    let sql = `
      SELECT 
        p.id,
        p.master_code,
        p.standard_name,
        p.category,
        p.specification,
        p.material,
        p.unit,
        COALESCE(pm.unit_price, 0) as unit_price,
        pm.price_type,
        pm.effective_from,
        p.created_at
      FROM product_masters p
      LEFT JOIN price_masters pm ON p.id = pm.master_id AND pm.is_active = 1
      WHERE 1=1
    `;
    const params: any[] = [];

    if (onlyPriced) {
      sql += ` AND COALESCE(pm.unit_price, 0) > 0`;
    }

    if (q) {
      sql += ` AND (p.master_code LIKE ? OR p.standard_name LIKE ? OR p.specification LIKE ? OR p.material LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (category && category !== 'ALL') {
      sql += ` AND p.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY (CASE WHEN COALESCE(pm.unit_price, 0) > 0 THEN 1 ELSE 0 END) DESC, p.id DESC, p.master_code ASC LIMIT 200`;

    const rawItems = await db.prepare(sql).all(...params);
    const items = (rawItems || []).map((it: any, idx: number) => ({
      ...it,
      id: it.p_id || it.id || it.master_code || `pm_item_${idx}`,
    }));

    // 카테고리 통계 집계 (6대 실무 분류)
    const stats = (await db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN category = 'MACHINING' THEN 1 ELSE 0 END) as machining_count,
        SUM(CASE WHEN category = 'SHEET_METAL' THEN 1 ELSE 0 END) as sheet_metal_count,
        SUM(CASE WHEN category = 'CASTING' THEN 1 ELSE 0 END) as casting_count,
        SUM(CASE WHEN category = 'COMMERCIAL' THEN 1 ELSE 0 END) as commercial_count,
        SUM(CASE WHEN category = 'ELECTRICAL' THEN 1 ELSE 0 END) as electrical_count,
        SUM(CASE WHEN category = 'ASSEMBLY' THEN 1 ELSE 0 END) as assembly_count
      FROM product_masters
    `).get()) as any;

    const pricedStat = (await db.prepare(`
      SELECT COUNT(DISTINCT master_id) as priced_count
      FROM price_masters
      WHERE is_active = 1 AND unit_price > 0
    `).get()) as any;

    return NextResponse.json({
      success: true,
      items,
      stats: {
        total: stats?.total_count || 0,
        priced: pricedStat?.priced_count || 0,
        machining: stats?.machining_count || 0,
        sheetMetal: stats?.sheet_metal_count || 0,
        casting: stats?.casting_count || 0,
        commercial: stats?.commercial_count || 0,
        electrical: stats?.electrical_count || 0,
        assembly: stats?.assembly_count || 0
      }
    });
  } catch (error: any) {
    console.error('Failed to get masters:', error);
    return NextResponse.json({ error: error.message || '기준 정보 조회 실패' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    // 1. 단일 마스터 품목 등록
    if (action === 'create_product') {
      const { master_code, standard_name, category, specification, material, unit, unit_price } = body;
      if (!master_code || !standard_name) {
        return NextResponse.json({ error: '품목 코드와 품명은 필수입니다.' }, { status: 400 });
      }

      const prodId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const priceId = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      await db.prepare(`
        INSERT INTO product_masters (id, master_code, standard_name, category, specification, material, unit, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(prodId, master_code.trim(), standard_name.trim(), category || 'MACHINING', specification || '', material || 'SS400', unit || 'EA', now);

      if (Number(unit_price) > 0) {
        await db.prepare(`
          INSERT INTO price_masters (id, master_id, price_type, unit_price, currency, effective_from, is_active, created_at)
          VALUES (?, ?, 'STANDARD', ?, 'KRW', ?, 1, ?)
        `).run(priceId, prodId, Number(unit_price), now.slice(0, 10), now);
      }

      await recordActivity(req, session, {
        activityType: 'ADMIN_ACTION',
        details: `신규 마스터 품목 등록: ${master_code} (${standard_name}, 단가: ${unit_price || 0}원)`
      });

      return NextResponse.json({ success: true, id: prodId });
    }

    // 2. 대량 엑셀/JSON 일괄 업로드 (Bulk Import)
    if (action === 'bulk_import') {
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: '업로드할 품목 데이터가 없습니다.' }, { status: 400 });
      }

      let insertedCount = 0;
      for (const it of items) {
        const code = (it.master_code || it.drawing_no || it['품목코드'] || it['도면번호'] || '').toString().trim();
        const name = (it.standard_name || it.item_name || it['품명'] || it['표준품명'] || '').toString().trim();
        if (!code && !name) continue;

        const effectiveCode = code || `ITEM-${Date.now()}-${insertedCount + 1}`;
        const effectiveName = name || effectiveCode;
        const spec = (it.specification || it.spec || it['규격'] || '').toString().trim();
        const mat = (it.material || it['재질'] || 'SS400').toString().trim();
        const cat = (it.category || it['분류'] || 'MACHINING').toString().trim();
        const unit = (it.unit || it['단위'] || 'EA').toString().trim();
        const price = Number(it.unit_price || it.price || it['단가'] || it['기준단가'] || 0);

        const prodId = `prod_${Date.now()}_${insertedCount}_${Math.random().toString(36).slice(2, 5)}`;
        const priceId = `pm_${Date.now()}_${insertedCount}_${Math.random().toString(36).slice(2, 5)}`;

        await db.prepare(`
          INSERT OR REPLACE INTO product_masters (id, master_code, standard_name, category, specification, material, unit, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        `).run(prodId, effectiveCode, effectiveName, cat, spec, mat, unit, now);

        if (price > 0) {
          await db.prepare(`
            INSERT OR REPLACE INTO price_masters (id, master_id, price_type, unit_price, currency, effective_from, is_active, created_at)
            VALUES (?, ?, 'STANDARD', ?, 'KRW', ?, 1, ?)
          `).run(priceId, prodId, price, now.slice(0, 10), now);
        }

        insertedCount++;
      }

      await recordActivity(req, session, {
        activityType: 'ADMIN_ACTION',
        details: `마스터 품목 대량 일괄 등록 완료: 총 ${insertedCount}건`
      });

      return NextResponse.json({ success: true, count: insertedCount });
    }

    // 3. 소재 단가 및 가공 임률 설정 저장
    if (action === 'save_settings') {
      const { materialRates, processRates } = body;

      if (materialRates) {
        await db.prepare(`
          INSERT OR REPLACE INTO system_settings (id, key, value, updated_at)
          VALUES ('set_mat_rates', 'MATERIAL_RATES', ?, ?)
        `).run(JSON.stringify(materialRates), now);
      }

      if (processRates) {
        await db.prepare(`
          INSERT OR REPLACE INTO system_settings (id, key, value, updated_at)
          VALUES ('set_proc_rates', 'PROCESS_RATES', ?, ?)
        `).run(JSON.stringify(processRates), now);
      }

      await recordActivity(req, session, {
        activityType: 'ADMIN_ACTION',
        details: '소재 단가표 및 가공 임률 설정 변경'
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '알 수 없는 요청 액션입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('Failed to post master data:', error);
    return NextResponse.json({ error: error.message || '기준 정보 저장 실패' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '삭제할 품목 ID가 필요합니다.' }, { status: 400 });
  }

  try {
    await db.prepare('DELETE FROM price_masters WHERE master_id = ?').run(id);
    await db.prepare('DELETE FROM product_masters WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '삭제 실패' }, { status: 500 });
  }
}
