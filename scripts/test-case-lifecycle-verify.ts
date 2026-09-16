import { queryTable } from '../egdesk-helpers';
import { db } from '../src/lib/db';

async function testLifecycleWithActualData() {
  console.log('=== [Step 1] 현재 quotation_cases 상태 확인 ===');
  const targetId = 'case_1789555469354'; // 테스트용DWG
  const before = await queryTable('quotation_cases', { filters: { id: targetId } });
  console.log('Target case before:', before.rows[0]?.id, before.rows[0]?.case_name, {
    deleted_at: before.rows[0]?.deleted_at,
    lifecycle_status: before.rows[0]?.lifecycle_status
  });

  console.log('\n=== [Step 2] 휴지통 이동(TRASH) 시뮬레이션 ===');
  const now = new Date().toISOString();
  const trashUpdate = await db.prepare(`
    UPDATE quotation_cases 
    SET lifecycle_status = 'TRASHED', 
        trashed_at = ?, 
        trashed_by_user_id = 'usr_admin', 
        deleted_at = ?, 
        deleted_by = 'usr_admin',
        updated_at = ?
    WHERE id = ?
  `).run(now, now, now, targetId);
  console.log('Trash update result:', trashUpdate);

  const afterTrash = await queryTable('quotation_cases', { filters: { id: targetId } });
  console.log('Target case after TRASH:', {
    deleted_at: afterTrash.rows[0]?.deleted_at,
    lifecycle_status: afterTrash.rows[0]?.lifecycle_status,
    trashed_at: afterTrash.rows[0]?.trashed_at
  });

  // activeCases 필터링 조건 검증: !c.deleted_at && (!c.lifecycle_status || c.lifecycle_status === 'ACTIVE')
  const c = afterTrash.rows[0];
  const isActive = !c.deleted_at && (!c.lifecycle_status || c.lifecycle_status === 'ACTIVE');
  const isTrashed = Boolean(c.deleted_at) || c.lifecycle_status === 'TRASHED';
  console.log('Filter result -> isActive:', isActive, '(false여야 함), isTrashed:', isTrashed, '(true여야 함)');

  if (!isActive && isTrashed) {
    console.log('===> 휴지통 이동 및 활성 목록 제외 완벽 검증 성공!');
  } else {
    console.error('===> 필터링 검증 실패!');
  }
}

testLifecycleWithActualData().catch(console.error);
