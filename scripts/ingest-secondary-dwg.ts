import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, insertRows } from '../src/lib/db';
import { getStorageSubdir } from '../src/lib/storage';
import { processCadFilePipeline } from '../src/lib/cad-pipeline';
import { runMrpExplosion } from '../src/lib/mrp-engine';

async function ingestSecondaryDwg() {
  console.log('=== 6. 2차 도면(2503-021_sample_1) 신규 케이스 생성 및 파이프라인 투입 시작 ===');

  const srcDwgPath = 'C:\\dev\\CADON-Ver-03\\test file\\2503-021_sample_1 (2)_202510231541.dwg';
  if (!fs.existsSync(srcDwgPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${srcDwgPath}`);
  }

  const fileBuffer = fs.readFileSync(srcDwgPath);
  const fileSize = fileBuffer.length;
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const originalFileName = '2503-021_sample_1 (2)_202510231541.dwg';
  const now = new Date().toISOString();

  // 1. 신규 케이스 생성
  const caseId = `case_${Date.now()}`;
  const caseNo = `QT-20260920-SMPL1`;
  const caseTitle = `[2차 검증] 2503-021 sample 1 컨베이어 라인`;

  console.log(`1. 신규 케이스 생성: ${caseId} (${caseNo})`);
  await db.prepare(`
    INSERT INTO quotation_cases (
      id, case_no, title, status, company_id, current_stage, created_at, updated_at
    ) VALUES (?, ?, ?, 'ANALYZING', 'comp_unassigned', 'CAD_PARSING', ?, ?)
  `).run(caseId, caseNo, caseTitle, now, now);

  // 2. storage/files 에 파일 복사 및 uploaded_files 등록
  const storageDir = getStorageSubdir('files');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const storedFileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.dwg`;
  const storagePath = path.join(storageDir, storedFileName);
  fs.writeFileSync(storagePath, fileBuffer);

  const fileId = `file_${Date.now()}`;
  console.log(`2. 파일 등록: ${fileId} (${storedFileName}, ${fileSize} bytes)`);

  await insertRows('uploaded_files', [{
    id: fileId,
    quotation_case_id: caseId,
    original_file_name: originalFileName,
    stored_file_name: storedFileName,
    storage_path: storagePath,
    file_type: 'DWG',
    file_role: 'SOURCE',
    file_size: fileSize,
    checksum,
    upload_status: 'UPLOADED',
    uploaded_by_user_id: 'usr_admin',
    created_at: now
  }]);

  // 3. CAD 파이프라인 실행
  console.log('3. processCadFilePipeline 파이프라인 실행 중 (DXF 변환 -> 엔티티 파싱 -> 시트 분석 -> BOM 추출 -> 피처)...');
  const pipelineRes = await processCadFilePipeline(caseId, fileId, 'usr_admin');
  console.log('파이프라인 실행 결과:', pipelineRes);

  if (!pipelineRes.success) {
    console.error('파이프라인 실패:', pipelineRes.error);
    return;
  }

  // 4. 투입 후 실측 검증
  console.log('=== 4. 2차 도면 투입 결과 실측 수치 수집 ===');

  // [1] 도면 시트 현황
  const dwgs = await db.prepare(`
    SELECT drawing_type, is_quote_included, COUNT(*) as cnt
    FROM drawings
    WHERE quotation_case_id = ?
    GROUP BY drawing_type, is_quote_included
  `).all(caseId);
  console.log('[도면 시트 현황]:', JSON.stringify(dwgs, null, 2));

  const totalDwgs = await db.prepare(`SELECT COUNT(*) as c FROM drawings WHERE quotation_case_id = ?`).get(caseId) as any;
  const excDwgs = await db.prepare(`SELECT COUNT(*) as c FROM drawings WHERE quotation_case_id = ? AND is_quote_included = 0`).get(caseId) as any;
  const incDwgs = await db.prepare(`SELECT COUNT(*) as c FROM drawings WHERE quotation_case_id = ? AND is_quote_included = 1`).get(caseId) as any;
  console.log(`- 전체 도면: ${totalDwgs.c}장 (제외: ${excDwgs.c}장, 포함: ${incDwgs.c}장)`);

  // [2] BOM 품목 현황
  const rawCount = await db.prepare(`SELECT COUNT(*) as c FROM raw_bom_items WHERE quotation_case_id = ?`).get(caseId) as any;
  const normCount = await db.prepare(`SELECT COUNT(*) as c FROM normalized_bom_items WHERE quotation_case_id = ?`).get(caseId) as any;
  console.log(`- 원시 BOM(raw_bom_items): ${rawCount.c}건`);
  console.log(`- 정규화 BOM(normalized_bom_items): ${normCount.c}건`);

  // [3] 중량 집계 및 MRP 엔진 검산
  console.log('5. MRP 엔진 검산 실행 중...');
  try {
    const mrpRes = await runMrpExplosion(caseId);
    console.log('[MRP 엔진 실측 결과]:');
    console.log(`- 단품 소요량 건수: ${mrpRes.flattenedParts.length}장`);
    console.log(`- 판재 중량: ${mrpRes.audit.sheetTotalWeightKg} kg`);
    console.log(`- 환봉 중량: ${mrpRes.audit.roundBarTotalWeightKg} kg`);
    console.log(`- 총 시스템 중량: ${mrpRes.audit.systemTotalWeightKg} kg`);
    console.log(`- 모수 일치 여부: ${mrpRes.audit.isCountMatched}`);
    console.log(`- 중량 보존 여부: ${mrpRes.audit.isWeightConserved}`);
  } catch (mrpErr) {
    console.warn('MRP 엔진 실행 경고 (BOM 트리 구조에 따름):', mrpErr);
  }

  // [4] 마스터 매칭 현황
  const candCount = await db.prepare(`
    SELECT COUNT(*) as total_candidates, COUNT(DISTINCT normalized_item_id) as distinct_items
    FROM master_candidates
    WHERE normalized_item_id IN (SELECT id FROM normalized_bom_items WHERE quotation_case_id = ?)
  `).get(caseId) as any;
  console.log(`- 마스터 매칭: 후보 ${candCount?.total_candidates || 0}건, 고유 품목 ${candCount?.distinct_items || 0}개`);

  // [5] CAD 파싱 및 엔티티
  const parseRuns = await db.prepare(`
    SELECT id, status, total_entities, duration_ms, created_at
    FROM cad_parse_runs
    WHERE source_file_id = ?
  `).all(fileId) as any[];
  console.log('- 파싱 이력:', parseRuns);

  const cadObjCount = await db.prepare(`
    SELECT COUNT(*) as c FROM cad_objects
    WHERE parse_run_id IN (SELECT id FROM cad_parse_runs WHERE source_file_id = ?)
  `).get(fileId) as any;
  console.log(`- 유효 cad_objects: ${cadObjCount.c}건`);

  console.log('=== 2차 도면 투입 및 실측 완료 ===');
}

ingestSecondaryDwg().catch(console.error);
