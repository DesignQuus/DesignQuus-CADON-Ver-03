import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getLearnedPricePool } from '@/lib/self-learning';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim() || '';
  const mode = searchParams.get('mode');

  try {
    if (mode === 'ALL_LEARNED') {
      const allLearned = await getLearnedPricePool();
      return NextResponse.json({ success: true, list: allLearned });
    }

    let query = `
      SELECT 
        MAX(mpp.id) as id,
        mpp.item_name, 
        mpp.specification, 
        mpp.material, 
        mpp.standard_name,
        mpp.standard_material,
        mpp.unit_price, 
        MAX(mpp.remark) as remark, 
        MAX(mpp.quotation_case_id) as quotation_case_id, 
        MAX(mpp.rowid) as latest_rowid,
        MAX(COALESCE(mpp.approval_count, 1)) as approval_count,
        MAX(mpp.last_used_at) as last_used_at,
        MAX(mpp.source) as source,
        c.company_name,
        CASE
          WHEN LOWER(mpp.item_name) = LOWER(?) THEN 100
          WHEN LOWER(mpp.item_name) LIKE LOWER(?) THEN 50
          WHEN LOWER(mpp.specification) LIKE LOWER(?) THEN 30
          WHEN LOWER(mpp.material) LIKE LOWER(?) THEN 20
          ELSE 10
        END as match_score
      FROM manual_price_pool mpp
      LEFT JOIN quotation_cases qc ON mpp.quotation_case_id = qc.id
      LEFT JOIN companies c ON qc.company_id = c.id
    `;
    const params: any[] = [name, `%${name}%`, `%${name}%`, `%${name}%`];

    if (name) {
      query += ` WHERE mpp.item_name LIKE ? OR mpp.specification LIKE ?`;
      params.push(`%${name}%`, `%${name}%`);
    }

    query += ` GROUP BY mpp.item_name, mpp.specification, mpp.material, mpp.unit_price`;
    query += ` ORDER BY match_score DESC, mpp.rowid DESC LIMIT 15`;

    const results = (await db.prepare(query).all(...params)) as any[];

    // If matches are few, fetch most recent items from the pool as general suggestions
    if (results.length < 5) {
      const existingKeys = new Set(results.map((r: any) => `${r.item_name}_${r.unit_price}`));
      const recentGeneral = (await db.prepare(`
        SELECT 
          MAX(id) as id, 
          item_name, 
          specification, 
          material, 
          unit_price, 
          MAX(remark) as remark, 
          MAX(quotation_case_id) as quotation_case_id, 
          MAX(rowid) as latest_rowid, 
          5 as match_score
        FROM manual_price_pool
        GROUP BY item_name, specification, material, unit_price
        ORDER BY rowid DESC
        LIMIT 10
      `).all()) as any[];

      for (const r of recentGeneral) {
        const key = `${r.item_name}_${r.unit_price}`;
        if (!existingKeys.has(key)) {
          results.push(r);
          existingKeys.add(key);
        }
      }
    }

    // Also query active Price Masters from price_masters + product_masters
    let priceMasters: any[] = [];
    try {
      const pmQuery = `
        SELECT 
          pm.id as price_master_id,
          p.id as master_id,
          p.master_code,
          p.standard_name,
          p.category,
          p.specification,
          p.material,
          p.unit,
          pm.unit_price,
          pm.price_type,
          pm.currency,
          pm.is_active,
          CASE
            WHEN LOWER(p.standard_name) = LOWER(?) OR LOWER(p.master_code) = LOWER(?) THEN 100
            WHEN LOWER(p.standard_name) LIKE LOWER(?) OR LOWER(p.master_code) LIKE LOWER(?) THEN 60
            WHEN LOWER(p.specification) LIKE LOWER(?) THEN 40
            ELSE 10
          END as match_score
        FROM price_masters pm
        JOIN product_masters p ON pm.master_id = p.id
        WHERE pm.is_active = 1
          AND pm.effective_from <= date('now')
          AND (pm.effective_to IS NULL OR pm.effective_to >= date('now'))
        ORDER BY match_score DESC, p.standard_name ASC
      `;
      priceMasters = (await db.prepare(pmQuery).all(name, name, `%${name}%`, `%${name}%`, `%${name}%`)) as any[];
    } catch (pmErr) {
      console.warn('priceMasters fetch failed:', pmErr);
    }

    return NextResponse.json({ 
      success: true, 
      list: results, 
      manualPrices: results,
      priceMasters
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '단가 조회 실패' }, { status: 500 });
  }
}

