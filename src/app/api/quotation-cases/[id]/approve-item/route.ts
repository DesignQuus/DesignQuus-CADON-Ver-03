import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { checkCasePermission } from '@/lib/permissions';
import { learnOrUpdateMaterialPrice } from '@/lib/self-learning';

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
    const {
      normalizedItemId,
      decisionType, // 'EXISTING_MASTER' | 'SIMILAR_MASTER' | 'NEW_ITEM_CANDIDATE' | 'EXCLUDED' | 'UNRESOLVED'
      selectedMasterId,
      selectedMasterCode,
      finalName,
      finalSpec,
      finalMaterial,
      finalQuantity,
      finalUnit,
      decisionReason,
      differenceNotes
    } = await req.json();

    const now = new Date().toISOString();
    const approvalId = `appr_${Date.now()}`;

    // 1. Record Immutable Audit Record (PROMPT 13)
    await db.prepare(`
      INSERT INTO bom_approval_records (
        id, quotation_case_id, normalized_item_id, selected_master_id,
        decision_type, decision_reason, difference_notes, is_override,
        approved_by_user_id, approved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approvalId, id, normalizedItemId, selectedMasterId || null,
      decisionType, decisionReason || null, differenceNotes || null, 0,
      session.userId, now, now
    );

    // 2. Insert or Replace Final BOM Item
    const finalBomId = `final_${normalizedItemId}`;
    await db.prepare(`
      INSERT OR REPLACE INTO final_bom_items (
        id, quotation_case_id, normalized_item_id, final_master_id, final_master_code,
        final_name, final_spec, final_material, final_quantity, final_unit,
        approval_status, approved_by_user_id, approved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalBomId, id, normalizedItemId, selectedMasterId || null, selectedMasterCode || null,
      finalName, finalSpec || null, finalMaterial || null,
      finalQuantity || 1.0, finalUnit || 'EA',
      decisionType === 'EXCLUDED' ? 'EXCLUDED' : 'APPROVED',
      session.userId, now, now
    );

    // 3. Accumulate Alias Knowledge if Existing/Similar Master
    if ((decisionType === 'EXISTING_MASTER' || decisionType === 'SIMILAR_MASTER') && selectedMasterId) {
      const normItem = (await db.prepare('SELECT * FROM normalized_bom_items WHERE id = ?').get(normalizedItemId)) as any;
      if (normItem) {
        const existingAlias = (await db.prepare(`
          SELECT * FROM master_aliases
          WHERE company_id = ? AND master_id = ? AND alias_name = ?
        `).get(qc.company_id, selectedMasterId, normItem.raw_name)) as any;

        if (existingAlias) {
          await db.prepare(`
            UPDATE master_aliases
            SET approval_count = approval_count + 1, updated_at = ?
            WHERE id = ?
          `).run(now, existingAlias.id);
        } else {
          await db.prepare(`
            INSERT INTO master_aliases (
              id, company_id, master_id, alias_name, alias_normalized,
              approval_count, scope, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `als_${Date.now()}`, qc.company_id, selectedMasterId,
            normItem.raw_name, normItem.normalized_name, 1, 'COMPANY', now, now
          );
        }
      }
    }

    // 3-1. Self-Learning Engine Knowledge Accumulation
    if (decisionType !== 'EXCLUDED') {
      try {
        const normItem = (await db.prepare('SELECT * FROM normalized_bom_items WHERE id = ?').get(normalizedItemId)) as any;
        await learnOrUpdateMaterialPrice({
          companyId: qc.company_id,
          rawName: normItem?.raw_name || finalName,
          standardName: finalName,
          specification: finalSpec,
          rawMaterial: normItem?.material_candidate || finalMaterial,
          standardMaterial: finalMaterial,
          quotationCaseId: id,
          userId: session.userId,
          source: 'DRAWING_APPROVAL'
        });
      } catch (learnErr) {
        console.warn('Auto-learning hook failed:', learnErr);
      }
    }

    // 4. Update Quote Readiness
    const totalNorm = ((await db.prepare('SELECT COUNT(*) as cnt FROM normalized_bom_items WHERE quotation_case_id = ?').get(id)) as any)?.cnt || 0;
    const totalApproved = ((await db.prepare('SELECT COUNT(*) as cnt FROM final_bom_items WHERE quotation_case_id = ? AND approval_status = ?').get(id, 'APPROVED')) as any)?.cnt || 0;
    const totalExcluded = ((await db.prepare('SELECT COUNT(*) as cnt FROM final_bom_items WHERE quotation_case_id = ? AND approval_status = ?').get(id, 'EXCLUDED')) as any)?.cnt || 0;

    const readiness = (totalApproved + totalExcluded >= totalNorm && totalNorm > 0) ? 'READY_FOR_QUOTE' : 'REVIEW_REQUIRED';
    await db.prepare('UPDATE quotation_cases SET quote_readiness = ?, updated_at = ? WHERE id = ?').run(readiness, now, id);

    // Audit log: BOM_APPROVAL
    await recordActivity(req, session, {
      activityType: 'BOM_APPROVAL',
      quotationCaseId: id,
      details: `BOM 부품 마스터 승인: [${finalName}] 규격 '${finalSpec}', 수량 ${finalQuantity} (${decisionType})`
    });

    return NextResponse.json({ success: true, readiness, finalBomId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '승인 처리 실패' }, { status: 500 });
  }
}
