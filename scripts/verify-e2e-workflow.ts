import { db } from '../src/lib/db';

async function verifyEndToEndWorkflow() {
  console.log('=== [Option 3] CADON 1~5단계 엔드투엔드 파이프라인 검증 시작 ===\n');

  // 1단계: 견적건 및 등록 도면 상태 확인
  const qc = (await db.prepare(`
    SELECT id, case_no, case_name, status, quote_readiness, company_id, designer_name, project_name, quote_memo
    FROM quotation_cases ORDER BY created_at DESC LIMIT 1
  `).get()) as any;
  console.log('▶ [1단계: 도면 접수 & CAD 파싱]');
  console.log(`- 견적건: ${qc.case_no} | ${qc.case_name}`);
  console.log(`- 진행 상태: ${qc.status} | 견적 준비도: ${qc.quote_readiness}`);

  const files = (await db.prepare('SELECT id, original_file_name, file_type, file_size FROM uploaded_files WHERE quotation_case_id = ?').all(qc.id)) as any[];
  console.log(`- 등록 파일 수: ${files.length}개 (${files.map(f => f.original_file_name).join(', ')})`);

  const drawings = (await db.prepare('SELECT id, drawing_no_raw, drawing_name_raw, drawing_type FROM drawings WHERE quotation_case_id = ?').all(qc.id)) as any[];
  console.log(`- 파싱된 도면 수: ${drawings.length}매`);

  // 2단계: 표제란 & AI VLM 추출 정보
  console.log('\n▶ [2단계: 표제란 확인 & AI VLM 메타]');
  let compName = '고객사 미지정';
  if (qc.company_id) {
    const comp = (await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(qc.company_id)) as any;
    if (comp) compName = comp.company_name;
  }
  console.log(`- 발주 고객사: ${compName} (ID: ${qc.company_id})`);
  console.log(`- 프로젝트명: ${qc.project_name || '(미지정)'}`);
  console.log(`- 설계자: ${qc.designer_name || '(미지정)'}`);
  console.log(`- 특기 메모:\n${qc.quote_memo || '(없음)'}`);

  // 3단계: 멀티레벨 BOM 전개 & 부품 정규화
  console.log('\n▶ [3단계: 멀티레벨 BOM 전개 & 부품 정규화]');
  const rawBom = (await db.prepare('SELECT COUNT(*) as cnt FROM raw_bom_items WHERE quotation_case_id = ?').get(qc.id)) as any;
  const flatBom = (await db.prepare('SELECT COUNT(*) as cnt FROM flattened_bom_items WHERE quotation_case_id = ?').get(qc.id)) as any;
  const normBom = (await db.prepare('SELECT COUNT(*) as cnt FROM normalized_bom_items WHERE quotation_case_id = ?').get(qc.id)) as any;
  console.log(`- Raw BOM 행 수: ${rawBom.cnt}건`);
  console.log(`- Flattened BOM 행 수: ${flatBom.cnt}건`);
  console.log(`- 정규화 부품 수: ${normBom.cnt}건`);

  // 4단계: 품목 마스터 매칭 & 단가 산출
  console.log('\n▶ [4단계: 품목 마스터 매칭 & 단가 산출]');
  const candidates = (await db.prepare(`
    SELECT mc.normalized_item_id, mc.standard_name, mc.total_score, mc.candidate_status
    FROM master_candidates mc
    JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id
    WHERE ni.quotation_case_id = ?
    LIMIT 5
  `).all(qc.id)) as any[];
  console.log(`- 마스터 매칭 후보 수: ${candidates.length}건 샘플:`);
  candidates.forEach(c => {
    console.log(`  • ${c.standard_name} (적합도: ${c.total_score}점, 상태: ${c.candidate_status})`);
  });

  // 5단계: 견적서 발행 상태
  console.log('\n▶ [5단계: 공식 견적서 발행 & 패키지]');
  const quotes = (await db.prepare('SELECT id, quote_no, total_amount, quote_version, created_at FROM quotes WHERE quotation_case_id = ? ORDER BY quote_version DESC').all(qc.id)) as any[];
  console.log(`- 발행된 견적서 수: ${quotes.length}건`);
  if (quotes.length > 0) {
    quotes.forEach(q => {
      console.log(`  • 견적번호: ${q.quote_no} (v${q.quote_version}) | 견적총액: ${Number(q.total_amount).toLocaleString()}원 | 발행일: ${q.created_at}`);
    });
  } else {
    console.log('  • 아직 공식 견적이 미발행 상태입니다.');
  }

  console.log('\n=== 파이프라인 검증 완료 ===');
}

verifyEndToEndWorkflow().catch(console.error);
