import { db } from '../src/lib/db';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cadon-bom-secret-key-super-secure-production-2026'
);

async function main() {
  const token = await new SignJWT({
    userId: 'user_admin',
    loginId: 'admin',
    name: '관리자',
    role: 'SUPER_ADMIN',
    tenant_id: 'comp_default',
    companyId: 'comp_default'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(JWT_SECRET);

  const authHeader = {
    'Cookie': `cadon_session=${token}; auth_token=${token}`,
    'Content-Type': 'application/json'
  };

  const now = new Date().toISOString();
  const draftCaseId = 'verify_draft_case';
  const approvedCaseId = 'verify_approved_case';
  const draftQuoteId = 'verify_draft_quote';
  const approvedQuoteId = 'verify_approved_quote';

  const comp = (await db.prepare('SELECT id FROM companies LIMIT 1').get()) as any;
  const proj = (await db.prepare('SELECT id FROM projects LIMIT 1').get()) as any;
  const companyId = comp?.id || 'comp_sechang';
  const projectId = proj?.id || 'proj_default';

  try {
    // 0. 준비
    await db.prepare('DELETE FROM quote_items WHERE quote_id IN (?, ?)').run(draftQuoteId, approvedQuoteId);
    await db.prepare('DELETE FROM quotes WHERE id IN (?, ?)').run(draftQuoteId, approvedQuoteId);
    await db.prepare('DELETE FROM quotation_cases WHERE id IN (?, ?)').run(draftCaseId, approvedCaseId);

    await db.prepare(`
      INSERT INTO quotation_cases (id, case_no, case_name, company_id, project_id, status, request_date, revision, quote_readiness, created_by_user_id, created_at)
      VALUES (?, 'CASE-VERIFY-DRAFT', '검증용 DRAFT 케이스', ?, ?, 'DRAFT', ?, 'R00', 'READY', 'user_admin', ?)
    `).run(draftCaseId, companyId, projectId, now.slice(0, 10), now);

    await db.prepare(`
      INSERT INTO quotes (
        id, quotation_case_id, quote_no, quote_version, company_id, project_id,
        status, currency, subtotal, discount_type, discount_rate, discount_amount,
        tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id, created_at
      ) VALUES (
        ?, ?, 'Q-VERIFY-DRAFT', 1, ?, ?,
        'DRAFT', 'KRW', 500000, 'NONE', 0, 0,
        10, 50000, 550000, ?, 0, 'user_admin', ?
      )
    `).run(draftQuoteId, draftCaseId, companyId, projectId, now.slice(0, 10), now);

    await db.prepare(`
      INSERT INTO quotation_cases (id, case_no, case_name, company_id, project_id, status, request_date, revision, quote_readiness, created_by_user_id, created_at)
      VALUES (?, 'CASE-VERIFY-APPROVED', '검증용 APPROVED 케이스', ?, ?, 'APPROVED', ?, 'R00', 'READY', 'user_admin', ?)
    `).run(approvedCaseId, companyId, projectId, now.slice(0, 10), now);

    await db.prepare(`
      INSERT INTO quotes (
        id, quotation_case_id, quote_no, quote_version, company_id, project_id,
        status, currency, subtotal, discount_type, discount_rate, discount_amount,
        tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id, created_at
      ) VALUES (
        ?, ?, 'Q-VERIFY-APPROVED', 1, ?, ?,
        'APPROVED', 'KRW', 500000, 'NONE', 0, 0,
        10, 50000, 550000, ?, 1, 'user_admin', ?
      )
    `).run(approvedQuoteId, approvedCaseId, companyId, projectId, now.slice(0, 10), now);

    await db.prepare(`
      INSERT INTO quote_items (
        id, quote_id, item_no, item_name, quantity, unit, unit_price, amount,
        price_source, price_status, is_included, created_at
      ) VALUES (
        'qi_verify_1', ?, 1, '검증 부품', 1, 'EA', 500000, 500000,
        'MANUAL', 'CONFIRMED', 1, ?
      )
    `).run(approvedQuoteId, now);

    console.log('>>> [1] DRAFT 견적서로 /quotes/[id]/publish 접근');
    const resPage = await fetch(`http://localhost:4005/quotes/${draftCaseId}/publish`);
    console.log('Status Code:', resPage.status);
    const pageHtml = await resPage.text();
    console.log('Response Length (bytes):', pageHtml.length);
    console.log('Contains blocked UI code:', pageHtml.includes('미승인 견적서 열람 및 외부 발행 차단') || pageHtml.includes('거버넌스 승인 가드 차단'));
    
    // publish 화면이 내부적으로 데이터 호출하는 API 확인
    const resCaseApi = await fetch(`http://localhost:4005/api/quotation-cases/${draftCaseId}`, { headers: authHeader });
    const caseJson = await resCaseApi.json();
    const lq = caseJson.latestQuote;
    console.log('Latest Quote from API:', { status: lq?.status, is_locked: lq?.is_locked });
    console.log('Guard Evaluation (isApproved = status === "APPROVED" && is_locked === 1):', lq?.status === 'APPROVED' && lq?.is_locked === 1);

    console.log('\n>>> [2] 엑셀/CSV 내보내기 API 직접 호출 (POST /api/quotes/[id]/export-excel)');
    const resExport = await fetch(`http://localhost:4005/api/quotes/${draftQuoteId}/export-excel`, {
      method: 'POST',
      headers: authHeader
    });
    console.log('Status Code:', resExport.status);
    const exportJson = await resExport.json();
    console.log('Response Body:', JSON.stringify(exportJson, null, 2));

    console.log('\n>>> [2-2] 다건 일괄 엑셀 내보내기 API 직접 호출 (POST /api/quotation-cases/bulk-export)');
    const resBulk = await fetch(`http://localhost:4005/api/quotation-cases/bulk-export`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ caseIds: [draftCaseId] })
    });
    console.log('Status Code:', resBulk.status);
    const bulkJson = await resBulk.json();
    console.log('Response Body:', JSON.stringify(bulkJson, null, 2));

    console.log('\n>>> [4] APPROVED 견적서 정상 접근 확인 (과차단 여부)');
    const resAppExport = await fetch(`http://localhost:4005/api/quotes/${approvedQuoteId}/export-excel`, {
      method: 'POST',
      headers: authHeader
    });
    console.log('Status Code:', resAppExport.status);
    const appExportJson = await resAppExport.json();
    console.log('Response Body:', JSON.stringify(appExportJson, null, 2));

  } finally {
    await db.prepare('DELETE FROM quote_items WHERE quote_id IN (?, ?)').run(draftQuoteId, approvedQuoteId);
    await db.prepare('DELETE FROM quotes WHERE id IN (?, ?)').run(draftQuoteId, approvedQuoteId);
    await db.prepare('DELETE FROM quotation_cases WHERE id IN (?, ?)').run(draftCaseId, approvedCaseId);
    await db.prepare('DELETE FROM quote_exports WHERE file_name LIKE "%VERIFY%"').run();
    console.log('\n[정리 완료] 임시 테스트 레코드 DB 완전 삭제 원복.');
  }
}

main().catch(console.error);
