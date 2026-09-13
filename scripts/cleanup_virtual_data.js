// EGDesk Helpers 기반 데이터 정리 유틸리티 (better-sqlite3 의존성 완전 제거)
const { executeSQL, deleteRows, listTables } = require('../egdesk-helpers');

async function cleanupDataViaEgdesk(keepCaseId) {
  console.log('--- [EGDesk Helpers] 데이터 정리 작업 ---');
  try {
    const tables = await listTables();
    console.log('확인된 테이블 수:', tables?.length || 0);

    if (keepCaseId) {
      const cases = await executeSQL(`SELECT id, case_name FROM quotation_cases WHERE id != '${keepCaseId}'`);
      const toDelete = cases?.rows || [];
      console.log(`삭제 대상 케이스: ${toDelete.length}건`);
      for (const c of toDelete) {
        await deleteRows('quotation_cases', { filters: { id: String(c.id) } });
      }
    }
    console.log('✅ EGDesk Helpers 기반 정리 완료');
  } catch (err) {
    console.error('정리 중 오류 발생:', err);
  }
}

module.exports = { cleanupDataViaEgdesk };
