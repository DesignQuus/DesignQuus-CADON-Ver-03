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

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { drawingNos, isIncluded, all, pricedOnly, excludeDuplicates, reason } = body;
    const flagVal = isIncluded ? 1 : 0;
    const excludeReasonStr = !isIncluded ? (reason || '견적 담당자 제외 설정') : null;

    // 1. Update drawings table (Primary source of truth for CAD drawing package)
    if (all) {
      await db.prepare(`
        UPDATE drawings 
        SET is_quote_included = ?, exclude_reason = ?
        WHERE quotation_case_id = ?
      `).run(flagVal, excludeReasonStr, id);

      await db.prepare(`
        UPDATE normalized_bom_items
        SET is_quote_included = ?, exclude_reason = ?
        WHERE quotation_case_id = ?
      `).run(flagVal, excludeReasonStr, id);
    } else if (excludeDuplicates) {
      // 💎 Senior Manager Preset: 도면번호와 품명이 모두 동일한 진짜 중복본만 2번째 이후 제외하고,
      // 도면번호가 같더라도 품명이 다른 공용 부품(STAY-BAR-1 vs STAY-BAR-2 등)은 견적에 안전하게 유지합니다.
      const allDwgs = (await db.prepare(`
        SELECT id, drawing_no_raw, drawing_name_raw, drawing_index 
        FROM drawings 
        WHERE quotation_case_id = ? 
        ORDER BY drawing_index ASC
      `).all(id)) as any[];

      const seen = new Set<string>();
      const idsToExclude: string[] = [];
      const idsToInclude: string[] = [];

      for (const d of allDwgs) {
        const no = (d.drawing_no_raw || '').trim();
        const name = (d.drawing_name_raw || '').trim();
        if (!no) continue;
        const key = `${no}___${name}`;
        if (seen.has(key)) {
          idsToExclude.push(d.id);
        } else {
          seen.add(key);
          idsToInclude.push(d.id);
        }
      }

      if (idsToExclude.length > 0) {
        const excludePlaceholders = idsToExclude.map(() => '?').join(',');
        await db.prepare(`
          UPDATE drawings
          SET is_quote_included = 0, exclude_reason = '중복 도면 (단일 품목 견적 반영)'
          WHERE id IN (${excludePlaceholders})
        `).run(...idsToExclude);

        await db.prepare(`
          UPDATE normalized_bom_items
          SET is_quote_included = 0, exclude_reason = '중복 도면 (단일 품목 견적 반영)'
          WHERE quotation_case_id = ? AND id IN (
            SELECT ni.id FROM normalized_bom_items ni
            JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
            JOIN drawings d ON d.quotation_case_id = ni.quotation_case_id 
              AND (
                (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
                OR (
                  fb.part_no IS NOT NULL AND LENGTH(fb.part_no) >= 3 AND (
                    (d.drawing_no_raw LIKE '%-' || fb.part_no AND SUBSTR(d.drawing_no_raw, -LENGTH(fb.part_no)-1, 1) = '-')
                    OR
                    (fb.part_no LIKE '%-' || d.drawing_no_raw AND SUBSTR(fb.part_no, -LENGTH(d.drawing_no_raw)-1, 1) = '-')
                  )
                )
              )
            WHERE d.id IN (${excludePlaceholders})
          )
        `).run(id, ...idsToExclude);
      }

      if (idsToInclude.length > 0) {
        const includePlaceholders = idsToInclude.map(() => '?').join(',');
        await db.prepare(`
          UPDATE drawings
          SET is_quote_included = 1, exclude_reason = NULL
          WHERE id IN (${includePlaceholders})
        `).run(...idsToInclude);

        await db.prepare(`
          UPDATE normalized_bom_items
          SET is_quote_included = 1, exclude_reason = NULL
          WHERE quotation_case_id = ? AND id IN (
            SELECT ni.id FROM normalized_bom_items ni
            JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
            JOIN drawings d ON d.quotation_case_id = ni.quotation_case_id 
              AND (
                (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
                OR (
                  fb.part_no IS NOT NULL AND LENGTH(fb.part_no) >= 3 AND (
                    (d.drawing_no_raw LIKE '%-' || fb.part_no AND SUBSTR(d.drawing_no_raw, -LENGTH(fb.part_no)-1, 1) = '-')
                    OR
                    (fb.part_no LIKE '%-' || d.drawing_no_raw AND SUBSTR(fb.part_no, -LENGTH(d.drawing_no_raw)-1, 1) = '-')
                  )
                )
              )
            WHERE d.id IN (${includePlaceholders})
          )
        `).run(id, ...idsToInclude);
      }
    } else if (Array.isArray(drawingNos) && drawingNos.length > 0) {
      const placeholders = drawingNos.map(() => '?').join(',');
      await db.prepare(`
        UPDATE drawings 
        SET is_quote_included = ?, exclude_reason = ?
        WHERE quotation_case_id = ? AND (drawing_no_raw IN (${placeholders}) OR drawing_no_normalized IN (${placeholders}) OR drawing_name_raw IN (${placeholders}))
      `).run(flagVal, excludeReasonStr, id, ...drawingNos, ...drawingNos, ...drawingNos);

      await db.prepare(`
        UPDATE normalized_bom_items
        SET is_quote_included = ?, exclude_reason = ?
        WHERE quotation_case_id = ? AND id IN (
          SELECT ni.id FROM normalized_bom_items ni
          JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
          WHERE ni.quotation_case_id = ? AND (
            fb.part_no IN (${placeholders}) OR 
            fb.name IN (${placeholders}) OR 
            ni.raw_name IN (${placeholders}) OR 
            ni.normalized_name IN (${placeholders})
          )
        )
      `).run(flagVal, excludeReasonStr, id, id, ...drawingNos, ...drawingNos, ...drawingNos, ...drawingNos);
    }

    // 2. Synchronize with quotes and quote_items if a quote exists
    // 2. Synchronize with quotes and quote_items if a quote exists
    const latestQuote = (await db.prepare(`
      SELECT * FROM quotes 
      WHERE quotation_case_id = ? 
      ORDER BY quote_version DESC 
      LIMIT 1
    `).get(id)) as any;

    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;
    let totalItems = 0;
    let includedItems = 0;

    if (latestQuote) {
      // Auto-unlock if locked so manager edits are smoothly applied
      if (latestQuote.is_locked) {
        await db.prepare("UPDATE quotes SET is_locked = 0, status = 'DRAFT' WHERE id = ?").run(latestQuote.id);
      }

      if (all) {
        await db.prepare(`
          UPDATE quote_items 
          SET is_included = ? 
          WHERE quote_id = ?
        `).run(flagVal, latestQuote.id);
      } else if (pricedOnly) {
        await db.prepare(`
          UPDATE quote_items 
          SET is_included = CASE WHEN unit_price > 0 THEN 1 ELSE 0 END 
          WHERE quote_id = ?
        `).run(latestQuote.id);
      } else if (excludeDuplicates) {
        // Sync quote items with excluded drawings
        const excludedDwgs = (await db.prepare(`
          SELECT drawing_no_raw, drawing_name_raw FROM drawings WHERE quotation_case_id = ? AND is_quote_included = 0
        `).all(id)) as any[];

        for (const ex of excludedDwgs) {
          const no = (ex.drawing_no_raw || '').trim();
          const name = (ex.drawing_name_raw || '').trim();
          if (no && name) {
            await db.prepare(`
              UPDATE quote_items 
              SET is_included = 0
              WHERE quote_id = ? AND drawing_no = ? AND item_name = ?
            `).run(latestQuote.id, no, name);
          }
        }
      } else if (Array.isArray(drawingNos) && drawingNos.length > 0) {
        const placeholders = drawingNos.map(() => '?').join(',');
        await db.prepare(`
          UPDATE quote_items 
          SET is_included = ? 
          WHERE quote_id = ? AND (drawing_no IN (${placeholders}) OR item_name IN (${placeholders}))
        `).run(flagVal, latestQuote.id, ...drawingNos, ...drawingNos);
      }

      // Recalculate Subtotal, VAT, Total
      const sumResult = (await db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as active_subtotal
        FROM quote_items
        WHERE quote_id = ? AND is_included = 1
      `).get(latestQuote.id)) as any;

      subtotal = sumResult?.active_subtotal || 0;
      const taxRate = latestQuote.tax_rate ?? 0.10;
      taxAmount = Math.round(subtotal * taxRate);
      totalAmount = subtotal + taxAmount;

      await db.prepare(`
        UPDATE quotes 
        SET subtotal = ?, tax_amount = ?, total_amount = ?, updated_at = ?
        WHERE id = ?
      `).run(subtotal, taxAmount, totalAmount, new Date().toISOString(), latestQuote.id);

      // Get quote item counts
      const counts = (await db.prepare(`
        SELECT 
          COUNT(*) as total_items,
          SUM(CASE WHEN is_included = 1 THEN 1 ELSE 0 END) as included_items
        FROM quote_items
        WHERE quote_id = ?
      `).get(latestQuote.id)) as any;

      totalItems = counts?.total_items || 0;
      includedItems = counts?.included_items || 0;
    }

    // 3. Get drawing level counts
    const dwgCounts = (await db.prepare(`
      SELECT 
        COUNT(*) as total_drawings,
        SUM(CASE WHEN is_quote_included = 1 THEN 1 ELSE 0 END) as included_drawings,
        SUM(CASE WHEN is_quote_included = 0 THEN 1 ELSE 0 END) as excluded_drawings
      FROM drawings
      WHERE quotation_case_id = ?
    `).get(id)) as any;

    // 4. Audit Log
    const toggleDesc = all
      ? (flagVal ? '전체 도면/품목 견적 일괄 포함' : '전체 도면/품목 견적 일괄 제외')
      : excludeDuplicates
      ? '중복 도면(중복본) 견적 일괄 제외'
      : pricedOnly
      ? '단가 있는 품목만 견적 포함'
      : `도면/품목 [${(drawingNos || []).slice(0, 3).join(', ')}${(drawingNos || []).length > 3 ? ` 외 ${(drawingNos || []).length - 3}건` : ''}] 견적 ${flagVal ? '포함' : `제외 (${excludeReasonStr || '제외'})`}`;

    await recordActivity(req, session, {
      activityType: 'QUOTE_TOGGLE',
      quotationCaseId: id,
      details: `${toggleDesc} (견적 대상 도면: ${dwgCounts?.included_drawings || 0} / 총 ${dwgCounts?.total_drawings || 0}개)`
    });

    return NextResponse.json({
      success: true,
      quoteId: latestQuote?.id || null,
      subtotal,
      taxAmount,
      totalAmount,
      totalItems,
      includedItems,
      totalDrawings: dwgCounts?.total_drawings || 0,
      includedDrawings: dwgCounts?.included_drawings || 0,
      excludedDrawings: dwgCounts?.excluded_drawings || 0
    });
  } catch (error: any) {
    console.error('toggle-quote-drawing error:', error);
    return NextResponse.json({ error: error.message || '견적 항목 반영 실패' }, { status: 500 });
  }
}
