import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { queryTable, updateRows, insertRows } from '@/../egdesk-helpers';
import { parseRemark, stringifyRemark } from '@/lib/remark-cost-helper';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
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
      quantity,
      basis, 
      selectedMasterId,
      remark,
      engineSuggestedPrice,
      costDiff
    } = body;

    const now = new Date().toISOString();

    // 조치 1: 조립도 배제(0원)는 정상 확정 가능, 일반 부품의 공급단가 0원은 CONFIRMED 전환 차단
    if (isConfirmed && unitPrice !== undefined && (Number(unitPrice) || 0) <= 0) {
      const isAssembly = partKey?.includes('ASSEMBLY') || (body.drawingType && String(body.drawingType).includes('ASSEMBLY'));
      if (!isAssembly) {
        return NextResponse.json({
          error: '공급단가가 0원인 품목은 확정할 수 없습니다. 단가를 입력하거나 견적에서 제외해 주세요.'
        }, { status: 400 });
      }
    }

    let wasAlreadyConfirmed = false;

    // 1. 이전 상태 확인 (멱등성 체크) 및 BOM 행 상태/단가 업데이트
    if (lineId) {
      // quote_items 테이블 조회 및 업데이트
      try {
        const qi = (await db.prepare('SELECT id, quote_id, final_bom_item_id, unit_price, quantity, price_status, remark FROM quote_items WHERE id = ?').get(lineId)) as any;
        if (qi) {
          if (qi.price_status === 'CONFIRMED') {
            wasAlreadyConfirmed = true;
          }
          const targetQty = quantity !== undefined ? Math.max(1, Number(quantity) || 1) : (Number(qi.quantity) || 1);
          const targetPrice = unitPrice !== undefined ? Number(unitPrice) : (Number(qi.unit_price) || 0);
          const amt = targetPrice * targetQty;

          // costDiff 또는 engineSuggestedPrice 병합
          let finalRemark = remark !== undefined ? remark : qi.remark;
          const parsedCurrent = parseRemark(finalRemark);
          const resolvedCostDiff = costDiff || (engineSuggestedPrice && targetPrice > 0 ? {
            engineSuggestedPrice: Math.round(Number(engineSuggestedPrice)),
            confirmedPrice: Math.round(targetPrice),
            delta: Math.round(targetPrice - Number(engineSuggestedPrice)),
            deltaPercent: Number((((targetPrice - Number(engineSuggestedPrice)) / Number(engineSuggestedPrice)) * 100).toFixed(1)),
            recordedAt: now
          } : parsedCurrent.costDiff);

          if (resolvedCostDiff || parsedCurrent.extraCosts.length > 0) {
            finalRemark = stringifyRemark(parsedCurrent.text, parsedCurrent.extraCosts, resolvedCostDiff);
          }

          const statusUpdate = isConfirmed !== undefined 
            ? (isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW')
            : qi.price_status;
          const incUpdate = isConfirmed !== undefined ? (isConfirmed ? 1 : 0) : 1;

          await db.prepare(`
            UPDATE quote_items
            SET quantity = ?, unit_price = ?, amount = ?, price_status = ?, is_included = ?, price_source = COALESCE(?, price_source),
                remark = COALESCE(?, remark)
            WHERE id = ?
          `).run(targetQty, targetPrice, amt, statusUpdate, incUpdate, isConfirmed ? 'MANUAL_REVIEW' : null, finalRemark || null, lineId);

          // final_bom_items 도 수량 동기화
          if (qi.final_bom_item_id) {
            try {
              await db.prepare('UPDATE final_bom_items SET final_quantity = ? WHERE id = ?').run(targetQty, qi.final_bom_item_id);
            } catch (fbErr) {
              console.warn('final_bom_items quantity sync note:', fbErr);
            }
          }

          // 견적서 헤더 합계 실시간 재계산
          if (qi.quote_id) {
            try {
              await db.prepare(`
                UPDATE quotes 
                SET subtotal = (SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1),
                    tax_amount = ROUND((SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1) * 0.1),
                    total_amount = ROUND((SELECT COALESCE(SUM(amount), 0) FROM quote_items WHERE quote_id = ? AND is_included = 1) * 1.1),
                    updated_at = ?
                WHERE id = ?
              `).run(qi.quote_id, qi.quote_id, qi.quote_id, now, qi.quote_id);
            } catch (qErr) {
              console.warn('quote totals update note:', qErr);
            }
          }
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
          price_basis_type: 'HUMAN_VERIFIED', // [실무자 확정 단가 전용 타입 영구 보장]
          basis_calc_json: JSON.stringify(basis || {}),
          is_ordered: 0,
          confirmed_by: session?.name || '검토자',
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
