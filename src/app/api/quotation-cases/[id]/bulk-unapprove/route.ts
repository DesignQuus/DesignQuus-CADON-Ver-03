import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { checkCasePermission } from '@/lib/permissions';

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

  // Permission Guard
  const perm = await checkCasePermission(session.userId, session.role, id);
  if (!perm.canEdit) {
    return NextResponse.json({
      error: perm.message || '해당 견적건에 대한 수정/승인 권한이 없습니다. 최고관리자의 승인이 필요합니다.',
      requiresApproval: perm.requiresApproval,
      approvalStatus: perm.approvalStatus
    }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const itemIds: string[] | undefined = body.itemIds;
    const now = new Date().toISOString();

    let unapprovedCount = 0;

    if (Array.isArray(itemIds) && itemIds.length > 0) {
      // Unapprove specific selected items
      const placeholders = itemIds.map(() => '?').join(',');
      const result = await db.prepare(`
        DELETE FROM final_bom_items
        WHERE quotation_case_id = ? AND normalized_item_id IN (${placeholders})
      `).run(id, ...itemIds);
      unapprovedCount = result.changes;

      const approvalId = `unappr_batch_${Date.now()}`;
      await db.prepare(`
        INSERT INTO bom_approval_records (
          id, quotation_case_id, normalized_item_id, selected_master_id,
          decision_type, decision_reason, is_override,
          approved_by_user_id, approved_at, created_at
        ) VALUES (?, ?, 'SELECTED_BATCH', NULL, 'REVOKE_APPROVAL', ?, 1, ?, ?, ?)
      `).run(approvalId, id, `선택 ${unapprovedCount}개 품목 승인 취소`, session.userId, now, now);

      await recordActivity(req, session, {
        activityType: 'BOM_APPROVAL',
        quotationCaseId: id,
        details: `BOM 선택 품목 일괄 승인 취소 (${unapprovedCount}건 ➡️ 검토 대기 복원)`
      });
    } else {
      // Unapprove ALL items for this quotation case (전체 초기화)
      const result = await db.prepare(`
        DELETE FROM final_bom_items
        WHERE quotation_case_id = ?
      `).run(id);
      unapprovedCount = result.changes;

      const approvalId = `unappr_all_${Date.now()}`;
      await db.prepare(`
        INSERT INTO bom_approval_records (
          id, quotation_case_id, normalized_item_id, selected_master_id,
          decision_type, decision_reason, is_override,
          approved_by_user_id, approved_at, created_at
        ) VALUES (?, ?, 'ALL_ITEMS', NULL, 'REVOKE_APPROVAL', '전체 품목 승인 일괄 초기화', 1, ?, ?, ?)
      `).run(approvalId, id, session.userId, now, now);

      await recordActivity(req, session, {
        activityType: 'BOM_APPROVAL',
        quotationCaseId: id,
        details: `BOM 품목 전수 승인 일괄 초기화 (${unapprovedCount}건 전체 ➡️ 검토 대기 복원)`
      });
    }

    // Update readiness to REVIEW_REQUIRED
    await db.prepare('UPDATE quotation_cases SET quote_readiness = ?, updated_at = ? WHERE id = ?').run('REVIEW_REQUIRED', now, id);

    return NextResponse.json({
      success: true,
      message: `${unapprovedCount}건의 승인이 취소되었습니다.`,
      unapprovedCount,
      readiness: 'REVIEW_REQUIRED'
    });
  } catch (error: any) {
    console.error('Bulk unapprove error:', error);
    return NextResponse.json({ error: error.message || '일괄 승인 취소 실패' }, { status: 500 });
  }
}
