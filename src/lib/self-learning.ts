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

export interface LearnedPriceHistoryRecord {
  id: string;
  pool_id: string;
  revision_seq: number;
  unit_price: number;
  previous_price: number | null;
  price_diff: number | null;
  change_type: string; // 'INITIAL' | 'RE_APPROVAL' | 'MANUAL_EDIT'
  quotation_case_id: string | null;
  company_id: string | null;
  company_name: string | null;
  remark: string | null;
  created_by_user_id: string | null;
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

      // 2-1. 단가 수정 및 재승인 이력 영구 기록 (manual_price_history)
      try {
        let nextSeq = (existing.approval_count || 1) + 1;
        const maxRow = (await db.prepare('SELECT MAX(revision_seq) as max_seq FROM manual_price_history WHERE pool_id = ?').get(existing.id)) as any;
        if (maxRow && typeof maxRow.max_seq === 'number' && maxRow.max_seq > 0) {
          nextSeq = maxRow.max_seq + 1;
        }

        let compName: string | null = null;
        if (updatedCompany) {
          const cRow = (await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(updatedCompany)) as any;
          compName = cRow?.company_name || null;
        }

        const prevPrice = existing.unit_price || 0;
        const priceDiff = updatedPrice - prevPrice;
        const changeType = (params.source === 'MANUAL' || params.source === 'QUOTE_MANUAL') ? 'MANUAL_EDIT' : 'RE_APPROVAL';

        await db.prepare(`
          INSERT INTO manual_price_history (
            id, pool_id, revision_seq, unit_price, previous_price, price_diff,
            change_type, quotation_case_id, company_id, company_name, remark,
            created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `mph_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          existing.id,
          nextSeq,
          updatedPrice,
          prevPrice,
          priceDiff,
          changeType,
          params.quotationCaseId || existing.quotation_case_id || null,
          updatedCompany || null,
          compName,
          updatedRemark || '견적 검수 승인 단가 갱신',
          params.userId || 'usr_admin',
          now
        );
      } catch (histErr) {
        console.warn('manual_price_history update error:', histErr);
      }

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

      // 3-1. 신규 1차 이력 영구 기록
      try {
        let compName: string | null = null;
        if (params.companyId) {
          const cRow = (await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(params.companyId)) as any;
          compName = cRow?.company_name || null;
        }

        await db.prepare(`
          INSERT INTO manual_price_history (
            id, pool_id, revision_seq, unit_price, previous_price, price_diff,
            change_type, quotation_case_id, company_id, company_name, remark,
            created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `mph_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          newId,
          1,
          price,
          price,
          0,
          'INITIAL',
          params.quotationCaseId || null,
          params.companyId || null,
          compName,
          remark || '도면 검수 승인 최초 자동 학습',
          params.userId || 'usr_admin',
          now
        );
      } catch (histErr) {
        console.warn('manual_price_history insert error:', histErr);
      }

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

/**
 * 특정 품목의 시계열 수정/승인 이력 전체 조회 (최신 차수순 정렬)
 */
export async function getLearnedPriceHistory(poolId: string): Promise<LearnedPriceHistoryRecord[]> {
  try {
    const rows = (await db.prepare(`
      SELECT 
        mph.*,
        COALESCE(c.company_name, mph.company_name) as company_name,
        u.name as user_name
      FROM manual_price_history mph
      LEFT JOIN companies c ON mph.company_id = c.id
      LEFT JOIN users u ON mph.created_by_user_id = u.id
      WHERE mph.pool_id = ?
      ORDER BY mph.revision_seq DESC, mph.created_at DESC
    `).all(poolId)) as LearnedPriceHistoryRecord[];

    return rows;
  } catch (e) {
    console.error('getLearnedPriceHistory error:', e);
    return [];
  }
}
