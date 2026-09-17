import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
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
    const approveAll = body.approveAll ?? true;

    // Self-healing: ensure normalized_bom_items exist if flattened_bom_items exist
    const normCountCheck = (await db.prepare('SELECT COUNT(*) as cnt FROM normalized_bom_items WHERE quotation_case_id = ?').get(id)) as any;
    if (!normCountCheck?.cnt || normCountCheck.cnt === 0) {
      const flats = (await db.prepare('SELECT * FROM flattened_bom_items WHERE quotation_case_id = ?').all(id)) as any[];
      if (flats.length > 0) {
        const nowTime = new Date().toISOString();
        const normRows = flats.map((fb: any, idx: number) => {
          const normId = fb.id ? fb.id.replace('fb_', 'norm_') : `norm_${id}_${idx + 1}`;
          const rawName = fb.name || fb.part_no || `부품-${idx + 1}`;
          return {
            id: normId,
            quotation_case_id: id,
            raw_item_id: fb.id,
            raw_name: rawName,
            normalized_name: rawName,
            search_name: rawName.replace(/\s+/g, ''),
            direction: null,
            spec_candidate: fb.specification || '-',
            material_candidate: fb.material || 'SS400',
            quantity: Number(fb.total_quantity) || 1,
            unit: fb.unit || 'EA',
            status: 'NORMALIZED',
            is_quote_included: 1,
            created_at: nowTime
          };
        });
        const { insertRows } = await import('../../../../../../egdesk-helpers');
        for (let i = 0; i < normRows.length; i += 50) {
          await insertRows('normalized_bom_items', normRows.slice(i, i + 50));
        }
      }
    }

    const unapprovedItems = (approveAll && !body.onlyMatched
      ? await db.prepare(`
          SELECT 
            ni.*, 
            COALESCE(fb.part_no, '') as drawing_no,
            COALESCE(d.drawing_name_raw, ni.normalized_name) as drawing_name,
            COALESCE(d.scale, fb.specification, ni.spec_candidate, '-') as drawing_spec,
            COALESCE(d.material, fb.material, ni.material_candidate, 'SS400') as drawing_mat,
            mc.master_id, 
            mc.master_code, 
            mc.standard_name, 
            mc.specification as master_spec, 
            mc.material as master_mat
          FROM normalized_bom_items ni
          LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
          LEFT JOIN (
            SELECT quotation_case_id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, scale, material, is_quote_included
            FROM drawings
            GROUP BY quotation_case_id, drawing_no_raw
          ) d ON d.quotation_case_id = ni.quotation_case_id 
             AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
          LEFT JOIN master_candidates mc ON mc.normalized_item_id = ni.id AND mc.rank = 1
          WHERE ni.quotation_case_id = ?
            AND ni.id NOT IN (SELECT normalized_item_id FROM final_bom_items WHERE quotation_case_id = ?)
            AND COALESCE(d.is_quote_included, ni.is_quote_included, 1) = 1
        `).all(id, id)
      : await db.prepare(`
          SELECT ni.*, mc.master_id, mc.master_code, mc.standard_name, mc.specification as master_spec, mc.material as master_mat
          FROM normalized_bom_items ni
          LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
          LEFT JOIN (
            SELECT quotation_case_id, drawing_no_raw, is_quote_included
            FROM drawings
            GROUP BY quotation_case_id, drawing_no_raw
          ) d ON d.quotation_case_id = ni.quotation_case_id AND d.drawing_no_raw = fb.part_no
          JOIN master_candidates mc ON mc.normalized_item_id = ni.id AND mc.rank = 1
          WHERE ni.quotation_case_id = ?
            AND ni.id NOT IN (SELECT normalized_item_id FROM final_bom_items WHERE quotation_case_id = ?)
            AND COALESCE(d.is_quote_included, ni.is_quote_included, 1) = 1
        `).all(id, id)) as any[];

    const now = new Date().toISOString();
    let approvedCount = 0;

    for (const item of unapprovedItems) {
      const approvalId = `appr_${Date.now()}_${approvedCount}`;
      const finalBomId = `final_${item.id}`;
      const isMatched = !!item.master_id;

      const decisionType = isMatched ? 'EXISTING_MASTER' : 'CUSTOM_PART';
      const decisionReason = isMatched ? '1순위 마스터 추천 일괄 승인' : '도면 가공품 자동 승인 (신규/주문제작)';
      const finalCode = isMatched ? item.master_code : (item.drawing_no || 'CUSTOM');
      const finalName = isMatched ? item.standard_name : (item.drawing_name || item.normalized_name);
      const finalSpec = isMatched ? (item.master_spec || item.spec_candidate) : (item.drawing_spec || item.spec_candidate || '-');
      const finalMat = isMatched ? (item.master_mat || item.material_candidate) : (item.drawing_mat || item.material_candidate || 'SS400');

      // 1. Audit
      await db.prepare(`
        INSERT INTO bom_approval_records (
          id, quotation_case_id, normalized_item_id, selected_master_id,
          decision_type, decision_reason, is_override, approved_by_user_id, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approvalId, id, item.id, item.master_id || null,
        decisionType, decisionReason, 0, session.userId, now, now
      );

      // 2. Final BOM
      await db.prepare(`
        INSERT OR REPLACE INTO final_bom_items (
          id, quotation_case_id, normalized_item_id, final_master_id, final_master_code,
          final_name, final_spec, final_material, final_quantity, final_unit,
          approval_status, approved_by_user_id, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        finalBomId, id, item.id, item.master_id || null, finalCode,
        finalName, finalSpec, finalMat,
        item.quantity, item.unit, 'APPROVED', session.userId, now, now
      );

      approvedCount++;
    }

    // Update readiness
    const readiness = 'READY_FOR_QUOTE';
    await db.prepare('UPDATE quotation_cases SET quote_readiness = ?, updated_at = ? WHERE id = ?').run(readiness, now, id);

    return NextResponse.json({ success: true, approvedCount, readiness });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '일괄 승인 실패' }, { status: 500 });
  }
}
