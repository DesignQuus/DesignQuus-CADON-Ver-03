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
    const { drawingIds, updates } = body;

    if (!Array.isArray(drawingIds) || drawingIds.length === 0) {
      return NextResponse.json({ error: '선택된 도면이 없습니다.' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: '변경할 속성 정보가 없습니다.' }, { status: 400 });
    }

    const placeholders = drawingIds.map(() => '?').join(',');

    // 1. Material bulk update
    if (typeof updates.material === 'string') {
      const newMaterial = updates.material.trim();
      await db.prepare(`
        UPDATE drawings
        SET material = ?, updated_at = CURRENT_TIMESTAMP
        WHERE quotation_case_id = ? AND id IN (${placeholders})
      `).run(newMaterial, id, ...drawingIds);

      // Sync with normalized_bom_items where drawing matches
      await db.prepare(`
        UPDATE normalized_bom_items
        SET drawing_material = ?, updated_at = CURRENT_TIMESTAMP
        WHERE quotation_case_id = ? AND id IN (
          SELECT ni.id FROM normalized_bom_items ni
          JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
          JOIN drawings d ON d.quotation_case_id = ni.quotation_case_id AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
          WHERE d.id IN (${placeholders})
        )
      `).run(newMaterial, id, ...drawingIds);
    }

    // 2. Drawing Type bulk update (MAIN_ASSEMBLY, SUB_ASSEMBLY, UNIT_PART)
    if (typeof updates.drawing_type === 'string') {
      await db.prepare(`
        UPDATE drawings
        SET drawing_type = ?, updated_at = CURRENT_TIMESTAMP
        WHERE quotation_case_id = ? AND id IN (${placeholders})
      `).run(updates.drawing_type, id, ...drawingIds);
    }

    // 3. Quote Inclusion bulk update
    if (typeof updates.is_quote_included === 'number') {
      const flagVal = updates.is_quote_included ? 1 : 0;
      const excludeReason = !updates.is_quote_included ? (updates.exclude_reason || '견적 담당자 일괄 제외') : null;
      await db.prepare(`
        UPDATE drawings
        SET is_quote_included = ?, exclude_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE quotation_case_id = ? AND id IN (${placeholders})
      `).run(flagVal, excludeReason, id, ...drawingIds);

      await db.prepare(`
        UPDATE normalized_bom_items
        SET is_quote_included = ?, exclude_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE quotation_case_id = ? AND id IN (
          SELECT ni.id FROM normalized_bom_items ni
          JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
          JOIN drawings d ON d.quotation_case_id = ni.quotation_case_id AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
          WHERE d.id IN (${placeholders})
        )
      `).run(flagVal, excludeReason, id, ...drawingIds);
    }

    // Record audit activity safely
    try {
      await recordActivity(req, session, {
        activityType: 'DRAWING_BULK_UPDATE',
        quotationCaseId: id,
        details: `도면 ${drawingIds.length}건 일괄 속성 갱신: ${JSON.stringify(updates)}`
      });
    } catch (auditErr) {
      console.warn('Audit log warning in bulk update:', auditErr);
    }

    return NextResponse.json({
      success: true,
      affectedCount: drawingIds.length,
      updates
    });
  } catch (error: any) {
    console.error('Failed to bulk update drawings:', error);
    return NextResponse.json({ error: error.message || '도면 정보 일괄 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
