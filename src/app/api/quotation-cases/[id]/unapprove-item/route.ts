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
    const { normalizedItemId } = await req.json();
    if (!normalizedItemId) {
      return NextResponse.json({ error: '품목 ID가 누락되었습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Existing final bom item info for audit
    const existingFinal = (await db.prepare(`
      SELECT * FROM final_bom_items
      WHERE quotation_case_id = ? AND normalized_item_id = ?
    `).get(id, normalizedItemId)) as any;

    if (!existingFinal) {
      // 이미 승인 취소(검토 대기) 상태인 경우 멱등성(Idempotency)을 보장하여 정상 성공 반환
      return NextResponse.json({
        success: true,
        message: '해당 품목은 이미 검토 대기 상태입니다.',
        readiness: qc.quote_readiness || 'REVIEW_REQUIRED',
        unapprovedItemId: normalizedItemId
      });
    }

    // 2. Delete from final_bom_items
    await db.prepare(`
      DELETE FROM final_bom_items
      WHERE quotation_case_id = ? AND normalized_item_id = ?
    `).run(id, normalizedItemId);

    // 3. Record Audit Record
    const approvalId = `unappr_${Date.now()}`;
    await db.prepare(`
      INSERT INTO bom_approval_records (
        id, quotation_case_id, normalized_item_id, selected_master_id,
        decision_type, decision_reason, is_override,
        approved_by_user_id, approved_at, created_at
      ) VALUES (?, ?, ?, NULL, 'REVOKE_APPROVAL', '사용자 승인 취소 (검토 대기로 변경)', 1, ?, ?, ?)
    `).run(approvalId, id, normalizedItemId, session.userId, now, now);

    // 4. Update Quote Readiness
    const totalNorm = ((await db.prepare('SELECT COUNT(*) as cnt FROM normalized_bom_items WHERE quotation_case_id = ?').get(id)) as any)?.cnt || 0;
    const totalApproved = ((await db.prepare('SELECT COUNT(*) as cnt FROM final_bom_items WHERE quotation_case_id = ? AND approval_status = ?').get(id, 'APPROVED')) as any)?.cnt || 0;
    const totalExcluded = ((await db.prepare('SELECT COUNT(*) as cnt FROM final_bom_items WHERE quotation_case_id = ? AND approval_status = ?').get(id, 'EXCLUDED')) as any)?.cnt || 0;

    const readiness = (totalApproved + totalExcluded >= totalNorm && totalNorm > 0) ? 'READY_FOR_QUOTE' : 'REVIEW_REQUIRED';
    await db.prepare('UPDATE quotation_cases SET quote_readiness = ?, updated_at = ? WHERE id = ?').run(readiness, now, id);

    // 5. Activity Log
    await recordActivity(req, session, {
      activityType: 'BOM_APPROVAL',
      quotationCaseId: id,
      details: `BOM 품목 승인 취소: [${existingFinal.final_name}] (${normalizedItemId}) ➡️ 검토 대기 상태로 변경`
    });

    return NextResponse.json({
      success: true,
      message: '승인이 취소되었습니다.',
      readiness,
      unapprovedItemId: normalizedItemId
    });
  } catch (error: any) {
    console.error('Unapprove error:', error);
    return NextResponse.json({ error: error.message || '승인 취소 처리 실패' }, { status: 500 });
  }
}
