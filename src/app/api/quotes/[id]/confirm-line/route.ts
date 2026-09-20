import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { queryTable, updateRows, insertRows } from '@/../egdesk-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const body = await request.json();
    const { 
      lineId, 
      partKey, 
      isConfirmed, 
      unitPrice, 
      unitCost, 
      qtyTier, 
      lotQuantity, 
      basis,
      selectedMasterId 
    } = body;

    const now = new Date().toISOString();

    let wasAlreadyConfirmed = false;

    // 1. 이전 상태 확인 (멱등성 체크) 및 BOM 행 상태/단가 업데이트
    if (lineId) {
      // quote_items 테이블 조회 및 업데이트
      try {
        const qi = (await db.prepare('SELECT id, quantity, price_status FROM quote_items WHERE id = ?').get(lineId)) as any;
        if (qi) {
          if (qi.price_status === 'CONFIRMED') {
            wasAlreadyConfirmed = true;
          }
          const qty = Number(qi.quantity) || 1;
          const amt = (Number(unitPrice) || 0) * qty;
          await db.prepare(`
            UPDATE quote_items
            SET unit_price = ?, amount = ?, price_status = ?, is_included = ?, price_source = 'MANUAL_REVIEW'
            WHERE id = ?
          `).run(unitPrice || 0, amt, isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW', isConfirmed ? 1 : 0, lineId);
        }
      } catch (e) {
        console.warn('quote_items update note:', e);
      }

      // normalized_bom_items 테이블 조회 및 업데이트
      try {
        const normItemRes = await queryTable('normalized_bom_items', { filters: { id: lineId }, limit: 1 });
        const normItem = normItemRes.rows?.[0];
        if (normItem && normItem.status === 'CONFIRMED') {
          wasAlreadyConfirmed = true;
        }

        await updateRows('normalized_bom_items', {
          filters: { id: lineId },
          updates: {
            status: isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW',
            approval_status: isConfirmed ? 'APPROVED' : 'NEEDS_REVIEW',
            is_quote_included: isConfirmed ? 1 : 0,
            updated_at: now
          }
        });
      } catch (e) {
        console.warn('normalized_bom_items update note:', e);
      }
    }

    // 2. Phase 1-C: master_candidates 상태 갱신 및 master_aliases 학습 집계 (Idempotent)
    if (lineId) {
      try {
        // 해당 품목의 master_candidates 조회
        const candsRes = await queryTable('master_candidates', { filters: { normalized_item_id: lineId }, limit: 10 });
        const candidates = candsRes.rows || [];

        if (candidates.length > 0) {
          // 선택할 마스터 결정: 명시된 selectedMasterId 또는 Top-1 후보
          const targetMasterId = selectedMasterId || candidates.find((c: any) => c.rank === 1)?.master_id;

          for (const cand of candidates) {
            const isTarget = targetMasterId ? cand.master_id === targetMasterId : cand.rank === 1;

            if (isConfirmed) {
              const newStatus = isTarget ? 'ACCEPTED' : 'REJECTED';
              await updateRows('master_candidates', {
                filters: { id: cand.id },
                updates: { candidate_status: newStatus, updated_at: now }
              });

              // 멱등성: 처음 확정되는 시점에만 approval_count / rejection_count 증가
              if (!wasAlreadyConfirmed && cand.master_id) {
                const aliasRes = await queryTable('master_aliases', { filters: { master_id: cand.master_id }, limit: 5 });
                const aliases = aliasRes.rows || [];

                for (const al of aliases) {
                  if (isTarget) {
                    const nextApp = (Number(al.approval_count) || 0) + 1;
                    await updateRows('master_aliases', {
                      filters: { id: al.id },
                      updates: { approval_count: nextApp, updated_at: now }
                    });
                  } else {
                    const nextRej = (Number(al.rejection_count) || 0) + 1;
                    await updateRows('master_aliases', {
                      filters: { id: al.id },
                      updates: { rejection_count: nextRej, updated_at: now }
                    });
                  }
                }
              }
            } else {
              // 확정 취소 시 후보 상태 원복
              const revertStatus = cand.rank === 1 ? 'TOP_CANDIDATE' : 'ALTERNATIVE';
              await updateRows('master_candidates', {
                filters: { id: cand.id },
                updates: { candidate_status: revertStatus, updated_at: now }
              });
            }
          }
        }
      } catch (cErr) {
        console.warn('Phase 1-C Candidate write-back error:', cErr);
      }
    }

    // 3. 확정 시 price_history_v2 에 단가 이력 축적 (신규 확정 시에만 축적하여 중복 방지)
    if (isConfirmed && unitPrice > 0 && !wasAlreadyConfirmed) {
      const historyId = `prc_v2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await insertRows('price_history_v2', [
        {
          id: historyId,
          part_master_id: lineId,
          part_key: partKey || `UNKNOWN:${lineId}`,
          quotation_case_id: caseId,
          qty_tier: qtyTier || '10~99',
          lot_quantity: lotQuantity || 1,
          material_cost: unitCost ? Math.round(unitCost * 0.45) : Math.round(unitPrice * 0.35),
          process_cost: unitCost ? Math.round(unitCost * 0.55) : Math.round(unitPrice * 0.45),
          subtotal_cost: unitCost || Math.round(unitPrice * 0.82),
          margin_rate: 0.18,
          unit_price: unitPrice,
          material_base_date: new Date().toISOString().substring(0, 10),
          price_basis_type: basis?.basisType || 'MANUAL',
          basis_calc_json: JSON.stringify(basis || {}),
          is_ordered: 0,
          confirmed_by: '검토자',
          effective_from: new Date().toISOString().substring(0, 10),
          created_at: now
        }
      ]);
    }

    return NextResponse.json({
      success: true,
      message: isConfirmed ? '단가가 확정되어 MASTER DB에 축적되었습니다.' : '확정이 취소되었습니다.',
      isConfirmed,
      wasAlreadyConfirmed
    });
  } catch (err: any) {
    console.error('Confirm line API error:', err);
    return NextResponse.json({ error: err.message || '단가 확정 처리 실패' }, { status: 500 });
  }
}
