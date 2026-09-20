/**
 * scripts/run-step10-matcher.ts
 * 
 * [CADON-BOM AI Ver-03] Phase 1-B: 매처 실측 검증 스크립트
 * 실제 도면 케이스(case_1789766302590)의 normalized_bom_items를 대상으로 
 * cad-pipeline.ts 10단계 매처를 구동하여 master_candidates에 실제 적재하고 통계를 산출합니다.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { queryTable, insertRows, executeSQL, deleteRows } from '../egdesk-helpers';

function runPython(scriptName: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', scriptName);
    const proc = spawn('python', [scriptPath, ...args], { cwd: process.cwd() });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script ${scriptName} exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python stdout: ${stdout}`));
      }
    });
  });
}

async function runStep10Verification() {
  const caseId = 'case_1789766302590';
  console.log(`=== [1-B] 케이스 ${caseId} 매처 파이프라인 10단계 실측 시작 ===`);

  const tempDir = os.tmpdir();
  const now = new Date().toISOString();

  // 1. normalized_bom_items 조회
  const normRes = await queryTable('normalized_bom_items', { limit: 1000 });
  const caseNormItems = (normRes.rows || []).filter((r: any) => r.quotation_case_id === caseId && !r.deleted_at);
  console.log(`[1-B] 대상 normalized_bom_items 건수: ${caseNormItems.length}건`);

  if (caseNormItems.length === 0) {
    throw new Error(`케이스 ${caseId}에 normalized_bom_items가 없습니다.`);
  }

  // 2. DB에서 product_masters 및 master_aliases 조회
  const mastersRes = await queryTable('product_masters', { limit: 1000 });
  const aliasesRes = await queryTable('master_aliases', { limit: 3000 });
  const pMasters = (mastersRes.rows || []).filter((r: any) => !r.deleted_at);
  const pAliases = (aliasesRes.rows || []).filter((r: any) => !r.deleted_at);

  console.log(`[1-B] DB 마스터 품목: ${pMasters.length}건, 별칭: ${pAliases.length}건 조회 완료`);

  const aliasMap = new Map<string, any[]>();
  for (const a of pAliases) {
    if (!aliasMap.has(a.master_id)) aliasMap.set(a.master_id, []);
    aliasMap.get(a.master_id)!.push(a);
  }

  const fullMasters = pMasters.map((m: any) => ({
    ...m,
    aliases: aliasMap.get(m.id) || []
  }));

  // 임시 파일 생성
  const tempNormJson = path.join(tempDir, `norm_test_${caseId}.json`);
  const tempMastersJson = path.join(tempDir, `masters_test_${caseId}.json`);

  fs.writeFileSync(tempNormJson, JSON.stringify({ normalized_items: caseNormItems }, null, 2), 'utf-8');
  fs.writeFileSync(tempMastersJson, JSON.stringify(fullMasters, null, 2), 'utf-8');

  // 3. master_matcher.py 실행
  console.log('[1-B] master_matcher.py 실행 중...');
  const masterResult = await runPython('master_matcher.py', [tempNormJson, tempMastersJson]);
  console.log(`[1-B] 매칭 완료! 소요시간: ${masterResult.duration_ms}ms, 매칭 결과 수: ${masterResult.total_items}건`);

  // 4. 기존 master_candidates 정리 후 인서트
  const candRows: any[] = [];
  for (let i = 0; i < masterResult.results.length; i++) {
    const mr = masterResult.results[i];
    const normItem = caseNormItems[i];
    const normId = normItem.id;

    for (let r = 0; r < mr.top_candidates.length; r++) {
      const tc = mr.top_candidates[r];
      candRows.push({
        id: `cand_${normId}_${r + 1}`,
        normalized_item_id: normId,
        master_id: tc.master_id || null,
        master_code: tc.master_code,
        standard_name: tc.standard_name,
        specification: tc.specification,
        material: tc.material,
        rank: r + 1,
        total_score: tc.total_score,
        positive_evidence_json: JSON.stringify(tc.positive_evidence || []),
        negative_evidence_json: JSON.stringify(tc.negative_evidence || []),
        candidate_status: r === 0 ? 'TOP_CANDIDATE' : 'ALTERNATIVE',
        tenant_id: 'tenant-cadon',
        created_at: now,
        updated_at: now
      });
    }
  }

  console.log(`[1-B] 생성된 master_candidates 후보 행 수: ${candRows.length}건`);

  if (candRows.length > 0) {
    // 기존 후보 조회 및 안전 삭제
    try {
      const existingCandRes = await queryTable('master_candidates', { limit: 5000 });
      const normIdSet = new Set(caseNormItems.map((n: any) => n.id));
      const toDelete = (existingCandRes.rows || []).filter((r: any) => normIdSet.has(r.normalized_item_id));
      for (const td of toDelete) {
        if (td.id) await deleteRows('master_candidates', { filters: { id: td.id } });
      }
    } catch (dErr) {
      console.warn('[1-B] Delete existing candidates note:', dErr);
    }
    await insertRows('master_candidates', candRows);
    console.log(`[1-B] master_candidates에 ${candRows.length}건 INSERT 완료!`);
  }

  // Cleanup
  if (fs.existsSync(tempNormJson)) fs.unlinkSync(tempNormJson);
  if (fs.existsSync(tempMastersJson)) fs.unlinkSync(tempMastersJson);

  // 5. 실측 집계
  const countRes = await executeSQL(`
    SELECT count(*) as total_candidates 
    FROM master_candidates
  `);
  console.log('[1-B] DB master_candidates 총 행 수 (SELECT COUNT):', countRes.rows[0].total_candidates);

  // 점수 통계
  const scores = candRows.map(c => c.total_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);

  console.log(`[1-B] total_score 분포: 최소 ${minScore}점, 평균 ${avgScore}점, 최대 ${maxScore}점`);

  // Top-1 후보 20건 샘플 및 정확도 육안 점검 데이터 출력
  const top1Candidates = candRows.filter(c => c.rank === 1);
  console.log(`\n=== [1-B] Top-1 추천 후보 샘플 20건 정확도 육안 검증 ===`);
  const verificationList: any[] = [];
  for (let i = 0; i < Math.min(20, top1Candidates.length); i++) {
    const c = top1Candidates[i];
    const originalItem = caseNormItems.find((n: any) => n.id === c.normalized_item_id);
    verificationList.push({
      No: i + 1,
      도면_원본명: originalItem ? originalItem.raw_name : '-',
      정규화명: originalItem ? originalItem.normalized_name : '-',
      도면재질: originalItem ? originalItem.material_candidate : '-',
      추천_마스터명: c.standard_name,
      마스터재질: c.material,
      점수: c.total_score,
      상태: c.candidate_status
    });
  }
  console.table(verificationList);

  // 6. 실제 행 3건 원본 데이터 (JSON evidence 포함) 출력
  console.log(`\n=== [1-B] 실제 행 3건 원본 데이터 (JSON Evidence 포함) ===`);
  const sample3 = candRows.slice(0, 3);
  console.log(JSON.stringify(sample3, null, 2));

  console.log('\n=== [1-B] 매처 실측 검증 완료 ===');
}

runStep10Verification().catch(err => {
  console.error('[1-B] 검증 실패:', err);
  process.exit(1);
});
