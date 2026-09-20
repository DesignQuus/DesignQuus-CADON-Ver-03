import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

function runPythonScript(scriptName: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const proc = spawn('python', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString('utf-8'); });
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Script ${scriptName} failed (code ${code}): ${stderr}`));
      }
      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          resolve(JSON.parse(stdout.substring(jsonStart, jsonEnd + 1)));
        } else {
          resolve(JSON.parse(stdout.trim()));
        }
      } catch {
        resolve({ raw_output: stdout, error: stderr });
      }
    });
  });
}

async function runFullPipelinePrecheck() {
  const tempDir = path.join(process.cwd(), 'scratch');
  const tempCadJson = path.join(tempDir, 'cad_precheck.json');
  const tempFrameJson = path.join(tempDir, 'frame_precheck.json');
  const tempTitleJson = path.join(tempDir, 'title_precheck.json');

  // 3. Structure Classifier
  console.log('3. Structure Classifier 실행...');
  const strucRes = await runPythonScript('structure_classifier.py', [tempTitleJson]);
  console.log('Structure Classifier 결과:', {
    status: strucRes.status,
    drawings_count: strucRes.drawings?.length,
    relationships_count: strucRes.relationships?.length
  });

  const tempStrucJson = path.join(tempDir, 'struc_precheck.json');
  fs.writeFileSync(tempStrucJson, JSON.stringify(strucRes));

  // 4. BOM Area Detector
  console.log('4. BOM Area Detector 실행...');
  const bomAreaRes = await runPythonScript('bom_area_detector.py', [tempCadJson, tempStrucJson]);
  console.log('BOM Area Detector 결과:', {
    status: bomAreaRes.status,
    bom_areas_count: bomAreaRes.bom_areas?.length
  });

  const tempBomAreaJson = path.join(tempDir, 'bom_area_precheck.json');
  fs.writeFileSync(tempBomAreaJson, JSON.stringify(bomAreaRes));

  // 5. BOM Row Extractor
  console.log('5. BOM Row Extractor 실행...');
  const bomRowRes = await runPythonScript('bom_row_extractor.py', [tempCadJson, tempBomAreaJson]);
  console.log('BOM Row Extractor 결과:', {
    status: bomRowRes.status,
    raw_bom_items_count: bomRowRes.raw_bom_items?.length
  });
  if (bomRowRes.raw_bom_items && bomRowRes.raw_bom_items.length > 0) {
    console.log('BOM 행 샘플 (상위 5개):', bomRowRes.raw_bom_items.slice(0, 5));
  }

  // 6. Feature Analyzer (가공 피처 및 중량 추출)
  console.log('6. Feature Analyzer 실행...');
  const featRes = await runPythonScript('feature_analyzer.py', [tempCadJson, tempStrucJson]);
  console.log('Feature Analyzer 결과:', {
    status: featRes.status,
    features_count: featRes.features?.length
  });
  if (featRes.features && featRes.features.length > 0) {
    const totalWeight = featRes.features.reduce((acc: number, f: any) => acc + (f.part_weight_kg || 0), 0);
    console.log(`추출 피처 건수: ${featRes.features.length}건, 임시 합산 중량: ${totalWeight.toFixed(3)} kg`);
    console.log('피처 샘플 3개:', featRes.features.slice(0, 3).map((f: any) => ({
      dwgNo: f.drawing_no_normalized,
      weight: f.part_weight_kg,
      w: f.bbox_width,
      l: f.bbox_length,
      t: f.bbox_thickness,
      mat: f.material_code,
      proc: f.process_type
    })));
  }
}

runFullPipelinePrecheck().catch(console.error);
