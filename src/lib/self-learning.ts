import { db } from './db';

export interface LearnMaterialParams {
  companyId?: string | null;
  rawName?: string | null;
  standardName?: string | null;
  specification?: string | null;
  rawMaterial?: string | null;
  standardMaterial?: string | null;
  unitPrice?: number | null;
  remark?: string | null;
  quotationCaseId?: string | null;
  userId?: string | null;
  source?: 'DRAWING_APPROVAL' | 'QUOTE_MANUAL' | 'BULK_APPROVE' | 'PRICE_MASTER' | 'MANUAL';
}

export interface LearnedMaterialRecord {
  id: string;
  item_name: string;
  standard_name: string | null;
  specification: string | null;
  material: string | null;
  standard_material: string | null;
  unit_price: number;
  approval_count: number;
  last_used_at: string | null;
  source: string;
  remark: string | null;
  company_id: string | null;
  company_name?: string | null;
  quotation_case_id: string | null;
  created_at: string;
}

/**
 * 도면 검수 승인 또는 견적 단가 입력 시 지식 베이스(manual_price_pool)에 자동 누적 및 자가학습 갱신
 */
export async function learnOrUpdateMaterialPrice(params: LearnMaterialParams): Promise<{ success: boolean; id: string; isNew: boolean }> {
  const now = new Date().toISOString();
  const name = (params.standardName || params.rawName || '').trim();
  if (!name) return { success: false, id: '', isNew: false };

  const normName = name.toUpperCase().replace(/[\[\]\(\)\{\}]/g, '').trim();
  const rawMat = (params.rawMaterial || '').trim();
  const stdMat = (params.standardMaterial || rawMat || 'SS400').trim();
  const normMat = stdMat.toUpperCase().replace(/\s+/g, '');
  const price = typeof params.unitPrice === 'number' && !isNaN(params.unitPrice) && params.unitPrice > 0 
    ? Math.round(params.unitPrice) 
    : 0;
  const spec = (params.specification || '').trim();
  const remark = (params.remark || '').trim();
  const source = params.source || 'DRAWING_APPROVAL';

  try {
    // 1. 기존 학습 풀에서 동일/유사 부품 탐색 (동일 고객사 우선)
    let existing: any = null;

    if (params.companyId) {
      existing = await db.prepare(`
        SELECT * FROM manual_price_pool
        WHERE company_id = ? 
          AND (
            UPPER(TRIM(item_name)) = ? 
            OR UPPER(TRIM(COALESCE(standard_name, ''))) = ?
            OR UPPER(TRIM(REPLACE(item_name, ' ', ''))) = ?
          )
          AND (
            UPPER(TRIM(COALESCE(material, ''))) = ?
            OR UPPER(TRIM(COALESCE(standard_material, ''))) = ?
            OR UPPER(TRIM(REPLACE(COALESCE(material, ''), ' ', ''))) = ?
          )
        ORDER BY approval_count DESC, last_used_at DESC
        LIMIT 1
      `).get(params.companyId, normName, normName, normName.replace(/\s+/g, ''), normMat, normMat, normMat);
    }

    if (!existing) {
      existing = await db.prepare(`
        SELECT * FROM manual_price_pool
        WHERE (
            UPPER(TRIM(item_name)) = ? 
            OR UPPER(TRIM(COALESCE(standard_name, ''))) = ?
            OR UPPER(TRIM(REPLACE(item_name, ' ', ''))) = ?
          )
          AND (
            UPPER(TRIM(COALESCE(material, ''))) = ?
            OR UPPER(TRIM(COALESCE(standard_material, ''))) = ?
            OR UPPER(TRIM(REPLACE(COALESCE(material, ''), ' ', ''))) = ?
          )
        ORDER BY approval_count DESC, last_used_at DESC
        LIMIT 1
      `).get(normName, normName, normName.replace(/\s+/g, ''), normMat, normMat, normMat);
    }

    if (existing) {
      // 2. 이미 존재하는 경우: 승인 카운트 증가 및 단가 최신화
      const updatedPrice = price > 0 ? price : existing.unit_price;
      const updatedSpec = spec || existing.specification;
      const updatedRemark = remark || existing.remark;
      const updatedCompany = params.companyId || existing.company_id;

      await db.prepare(`
        UPDATE manual_price_pool
        SET 
          unit_price = ?,
          specification = ?,
          standard_name = COALESCE(?, standard_name),
          standard_material = COALESCE(?, standard_material),
          approval_count = COALESCE(approval_count, 1) + 1,
          last_used_at = ?,
          remark = ?,
          source = ?,
          company_id = COALESCE(company_id, ?)
        WHERE id = ?
      `).run(
        updatedPrice,
        updatedSpec,
        params.standardName || existing.standard_name,
        stdMat || existing.standard_material,
        now,
        updatedRemark,
        source,
        updatedCompany,
        existing.id
      );

      return { success: true, id: existing.id, isNew: false };
    } else {
      // 3. 신규 자재 학습 풀 등록
      const newId = `mpp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.prepare(`
        INSERT INTO manual_price_pool (
          id, item_name, standard_name, specification, material, standard_material,
          unit_price, approval_count, last_used_at, source, remark, company_id,
          quotation_case_id, created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        name,
        params.standardName || name,
        spec,
        rawMat || stdMat,
        stdMat,
        price,
        1,
        now,
        source,
        remark || '도면 검수 승인 자동 학습',
        params.companyId || null,
        params.quotationCaseId || null,
        params.userId || 'usr_admin',
        now
      );

      // 4. 고객사별 도면 원문명 ➔ 표준명 별칭(master_aliases) 자동 학습 연동
      if (params.companyId && params.rawName && params.standardName && params.rawName !== params.standardName) {
        try {
          const aliasNorm = params.rawName.toUpperCase().trim();
          const existingAlias = await db.prepare(`
            SELECT id FROM master_aliases 
            WHERE company_id = ? AND alias_normalized = ?
          `).get(params.companyId, aliasNorm);

          if (!existingAlias) {
            const anyMaster = (await db.prepare('SELECT id FROM product_masters LIMIT 1').get()) as { id: string } | undefined;
            if (anyMaster) {
              await db.prepare(`
                INSERT OR IGNORE INTO master_aliases (
                  id, company_id, master_id, alias_name, alias_normalized,
                  approval_count, scope, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, 'COMPANY', ?, ?)
              `).run(`als_${Date.now()}`, params.companyId, anyMaster.id, params.rawName, aliasNorm, now, now);
            }
          }
        } catch (aliasErr) {
          // non-blocking
        }
      }

      return { success: true, id: newId, isNew: true };
    }
  } catch (err) {
    console.error('learnOrUpdateMaterialPrice error:', err);
    return { success: false, id: '', isNew: false };
  }
}

/**
 * 전체 누적 학습된 자재/단가 풀 조회 (승인 횟수 및 최신순 정렬)
 */
export async function getLearnedPricePool(companyId?: string | null): Promise<LearnedMaterialRecord[]> {
  try {
    const rows = (await db.prepare(`
      SELECT 
        mpp.*,
        c.company_name
      FROM manual_price_pool mpp
      LEFT JOIN companies c ON mpp.company_id = c.id
      ORDER BY mpp.approval_count DESC, mpp.last_used_at DESC, mpp.rowid DESC
    `).all()) as LearnedMaterialRecord[];

    return rows;
  } catch (e) {
    console.error('getLearnedPricePool error:', e);
    return [];
  }
}
