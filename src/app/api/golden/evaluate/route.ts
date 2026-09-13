import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir } from '@/lib/storage';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function runGoldenEvaluator(gtJsonPath: string, sysJsonPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'golden_evaluator.py');
    const proc = spawn('python', [scriptPath, gtJsonPath, sysJsonPath], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });

    proc.on('close', (code) => {
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ raw_output: stdout, error: stderr });
      }
    });
    proc.on('error', reject);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { goldenCaseId } = await req.json();
    const gcase = (await db.prepare('SELECT * FROM golden_cases WHERE id = ?').get(goldenCaseId || 'gcase_001')) as any;
    if (!gcase) {
      return NextResponse.json({ error: 'Golden Case를 찾을 수 없습니다.' }, { status: 404 });
    }

    const qcId = gcase.quotation_case_id;
    const drawings = await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ?').all(qcId);
    const bomAreas = await db.prepare('SELECT * FROM bom_areas WHERE quotation_case_id = ?').all(qcId);
    const rawBomItems = await db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ?').all(qcId);
    const masterCandidates = (await db.prepare(`
      SELECT mc.* FROM master_candidates mc
      JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id
      WHERE ni.quotation_case_id = ?
    `).all(qcId)) as any[];

    const gtData = {
      actual_drawing_count: gcase.actual_drawing_count,
      actual_bom_count: gcase.actual_bom_count,
      actual_item_count: gcase.actual_item_count
    };

    const sysData = {
      drawings,
      bom_areas: bomAreas,
      raw_bom_items: rawBomItems,
      master_results: masterCandidates.map((mc: any) => ({
        status: mc.rank === 1 ? 'MATCH_FOUND' : 'AMBIGUOUS'
      }))
    };

    const tempDir = getStorageSubdir('temp');
    const tempGtPath = path.join(tempDir, `gt_${Date.now()}.json`);
    const tempSysPath = path.join(tempDir, `sys_${Date.now()}.json`);
    fs.writeFileSync(tempGtPath, JSON.stringify(gtData));
    fs.writeFileSync(tempSysPath, JSON.stringify(sysData));

    const evalResult = await runGoldenEvaluator(tempGtPath, tempSysPath);
    if (fs.existsSync(tempGtPath)) fs.unlinkSync(tempGtPath);
    if (fs.existsSync(tempSysPath)) fs.unlinkSync(tempSysPath);

    // Baseline promotion if qualified
    const baselineId = `base_${Date.now()}`;
    await db.prepare(`
      INSERT INTO system_baselines (id, golden_case_id, baseline_name, parser_version, metrics_json, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      baselineId, gcase.id, 'BASELINE_V1', 'ezdxf-1.4.4 + LibreDWG-0.14',
      JSON.stringify(evalResult.metrics), session.userId, new Date().toISOString()
    );

    return NextResponse.json({ success: true, evalResult, baselineId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Golden 평가 실패' }, { status: 500 });
  }
}
