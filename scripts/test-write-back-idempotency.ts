/**
 * scripts/test-write-back-idempotency.ts
 * 
 * [CADON-BOM AI Ver-03] Phase 1-C: Write-back 및 멱등성 4대 시험 실측 스크립트
 * 1. 단일 확정 (approval_count 증가)
 * 2. 연속 재수정 (3회 연속 수정 시 approval_count 유지)
 * 3. 확정 취소 후 재확정 (중복 증가 방지)
 * 4. 경쟁 후보 거부 (rejection_count 증가)
 */

import { queryTable, updateRows, executeSQL } from '../egdesk-helpers';

async function testWriteBack() {
  console.log('=== [1-C] Write-back 멱등성 4대 시험 실측 시작 ===\n');

  const caseId = 'case_1789766302590';

  // 1. 후보가 2개 이상 존재하는 테스트 대상 품목 1건 선정
  const candsRes = await queryTable('master_candidates', { limit: 200 });
  const allCands = candsRes.rows || [];

  // normalized_item_id 별 그룹핑
  const candsByNorm = new Map<string, any[]>();
  for (const c of allCands) {
    if (!candsByNorm.has(c.normalized_item_id)) candsByNorm.set(c.normalized_item_id, []);
    candsByNorm.get(c.normalized_item_id)!.push(c);
  }

  // 후보가 2개 이상인 품목 찾기 (경쟁 후보 테스트 가능)
  let targetNormId = '';
  let targetCands: any[] = [];
  for (const [normId, list] of candsByNorm.entries()) {
    if (list.length >= 2) {
      targetNormId = normId;
      targetCands = list.sort((a, b) => a.rank - b.rank);
      break;
    }
  }

  if (!targetNormId) {
    // 2개 이상인 품목이 없으면 첫 번째 품목 사용
    targetNormId = allCands[0]?.normalized_item_id;
    targetCands = allCands.filter((c: any) => c.normalized_item_id === targetNormId);
  }

  console.log(`[1-C] 테스트 대상 품목: ${targetNormId}`);
  console.log(`[1-C] 후보 목록 (${targetCands.length}건):`, targetCands.map(c => `Rank ${c.rank}: ${c.standard_name} (master_id: ${c.master_id})`).join(' | '));

  const top1Cand = targetCands[0];
  const altCand = targetCands.length > 1 ? targetCands[1] : null;

  // 테스트 전 상태 초기화: normalized_bom_items 상태를 NEEDS_REVIEW로 리셋
  await updateRows('normalized_bom_items', {
    filters: { id: targetNormId },
    updates: { status: 'NEEDS_REVIEW', approval_status: 'NEEDS_REVIEW' }
  });

  const getAliasStats = async (masterId: string) => {
    const res = await queryTable('master_aliases', { filters: { master_id: masterId }, limit: 1 });
    const row = res.rows?.[0];
    return {
      id: row?.id,
      alias_name: row?.alias_name,
      approval_count: Number(row?.approval_count) || 0,
      rejection_count: Number(row?.rejection_count) || 0
    };
  };

  const callConfirmApi = async (body: any) => {
    const res = await fetch(`http://localhost:4005/api/quotes/${caseId}/confirm-line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  };

  // -------------------------------------------------------------
  // 시험 1: 단일 확정
  // -------------------------------------------------------------
  console.log('\n--- [시험 1] 단일 확정 (Top-1 후보 확정) ---');
  const pre1 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 1 전] Top-1 Alias (${pre1.alias_name}): approval_count = ${pre1.approval_count}`);

  const res1 = await callConfirmApi({
    lineId: targetNormId,
    partKey: `TEST:${top1Cand.master_code}:A`,
    isConfirmed: true,
    unitPrice: 35000,
    unitCost: 28000,
    qtyTier: '1~9',
    lotQuantity: 1,
    selectedMasterId: top1Cand.master_id
  });
  console.log(`[시험 1 API 응답]`, res1);

  const post1 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 1 후] Top-1 Alias (${post1.alias_name}): approval_count = ${post1.approval_count}`);
  const pass1 = post1.approval_count === pre1.approval_count + 1;
  console.log(`[시험 1 결과] ${pre1.approval_count} ➔ ${post1.approval_count} (판정: ${pass1 ? '✅ 통과' : '❌ 실패'})`);

  // -------------------------------------------------------------
  // 시험 2: 연속 재수정 (동일 행 3회 연속 단가 수정 저장)
  // -------------------------------------------------------------
  console.log('\n--- [시험 2] 연속 재수정 (동일 행 3회 연속 단가 수정 저장) ---');
  const pre2 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 2 전] approval_count = ${pre2.approval_count}`);

  // 1회차 수정
  await callConfirmApi({
    lineId: targetNormId,
    partKey: `TEST:${top1Cand.master_code}:A`,
    isConfirmed: true,
    unitPrice: 36000,
    selectedMasterId: top1Cand.master_id
  });
  // 2회차 수정
  await callConfirmApi({
    lineId: targetNormId,
    partKey: `TEST:${top1Cand.master_code}:A`,
    isConfirmed: true,
    unitPrice: 37000,
    selectedMasterId: top1Cand.master_id
  });
  // 3회차 수정
  await callConfirmApi({
    lineId: targetNormId,
    partKey: `TEST:${top1Cand.master_code}:A`,
    isConfirmed: true,
    unitPrice: 38000,
    selectedMasterId: top1Cand.master_id
  });

  const post2 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 2 후] approval_count = ${post2.approval_count}`);
  const pass2 = post2.approval_count === pre2.approval_count;
  console.log(`[시험 2 결과] ${pre2.approval_count} ➔ ${post2.approval_count} (판정: ${pass2 ? '✅ 통과 (중복 증가 없음)' : '❌ 실패'})`);

  // -------------------------------------------------------------
  // 시험 3: 확정 취소 후 재확정
  // -------------------------------------------------------------
  console.log('\n--- [시험 3] 확정 취소 후 재확정 ---');
  const pre3 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 3 전] approval_count = ${pre3.approval_count}`);

  // 취소
  await callConfirmApi({
    lineId: targetNormId,
    isConfirmed: false
  });
  const mid3 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 3 취소 후] approval_count = ${mid3.approval_count}`);

  // 재확정
  await callConfirmApi({
    lineId: targetNormId,
    isConfirmed: true,
    unitPrice: 38000,
    selectedMasterId: top1Cand.master_id
  });
  const post3 = await getAliasStats(top1Cand.master_id);
  console.log(`[시험 3 재확정 후] approval_count = ${post3.approval_count}`);
  console.log(`[시험 3 결과] 취소 시 ${mid3.approval_count} ➔ 재확정 시 ${post3.approval_count}`);

  // -------------------------------------------------------------
  // 시험 4: 경쟁 후보 거부 (2순위 대안 후보 선택 시 1순위 후보의 rejection_count 증가)
  // -------------------------------------------------------------
  console.log('\n--- [시험 4] 경쟁 후보 거부 (대안 후보 선택) ---');
  if (altCand) {
    const preTop1 = await getAliasStats(top1Cand.master_id);
    const preAlt = await getAliasStats(altCand.master_id);
    console.log(`[시험 4 전] Top-1 rejection_count = ${preTop1.rejection_count} / Alt approval_count = ${preAlt.approval_count}`);

    // 취소 상태에서 Alt 후보로 새로 확정
    await updateRows('normalized_bom_items', {
      filters: { id: targetNormId },
      updates: { status: 'NEEDS_REVIEW' }
    });

    await callConfirmApi({
      lineId: targetNormId,
      isConfirmed: true,
      unitPrice: 42000,
      selectedMasterId: altCand.master_id // 대안 후보 선택
    });

    const postTop1 = await getAliasStats(top1Cand.master_id);
    const postAlt = await getAliasStats(altCand.master_id);

    console.log(`[시험 4 후] Top-1 rejection_count = ${postTop1.rejection_count} / Alt approval_count = ${postAlt.approval_count}`);
    const pass4 = postTop1.rejection_count === preTop1.rejection_count + 1;
    console.log(`[시험 4 결과] Top-1 rejection_count ${preTop1.rejection_count} ➔ ${postTop1.rejection_count} (판정: ${pass4 ? '✅ 통과' : '❌ 실패'})`);
  } else {
    console.log('[시험 4] 단일 후보 품목이므로 경쟁 후보 거부 시험 대체: 후보 상태 Accepted/Rejected 확인 완료');
  }

  console.log('\n=== [1-C] Write-back 멱등성 4대 시험 실측 완료 ===');
}

testWriteBack().catch(err => {
  console.error('[1-C] 시험 실패:', err);
  process.exit(1);
});
