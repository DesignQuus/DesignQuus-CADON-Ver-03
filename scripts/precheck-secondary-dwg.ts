import path from 'path';
import fs from 'fs';
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

    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Script ${scriptName} failed (code ${code}): ${stderr}`));
      }
      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
          resolve(JSON.parse(jsonStr));
        } else {
          resolve(JSON.parse(stdout.trim()));
        }
      } catch {
        resolve({ raw_output: stdout, error: stderr });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function testSecondaryDwgPrecheck() {
  console.log('=== 2차 도면(2503-021_sample_1) 적합성 사전 확인 시작 ===');
  const dwgPath = 'C:\\dev\\CADON-Ver-03\\test file\\2503-021_sample_1 (2)_202510231541.dwg';

  if (!fs.existsSync(dwgPath)) {
    console.error('파일이 존재하지 않습니다:', dwgPath);
    return;
  }

  const stat = fs.statSync(dwgPath);
  console.log(`1. 파일 크기: ${stat.size} bytes (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  const buf = fs.readFileSync(dwgPath);
  const header = buf.subarray(0, 6).toString('ascii');
  console.log(`2. DWG 헤더 버전: ${header}`);

  // 임시 DXF 변환 경로
  const tempDir = path.join(process.cwd(), 'scratch');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outDxfPath = path.join(tempDir, 'sample_precheck.dxf');

  // dwg_converter.py 테스트
  console.log('3. DXF 변환 시도 중...');
  try {
    const convRes = await runPythonScript('dwg_converter.py', [dwgPath, outDxfPath]);
    console.log('변환 결과:', JSON.stringify(convRes, null, 2));

    if (fs.existsSync(outDxfPath)) {
      const dxfStat = fs.statSync(outDxfPath);
      console.log(`DXF 변환 성공! 크기: ${dxfStat.size} bytes (${(dxfStat.size / 1024 / 1024).toFixed(2)} MB)`);

      // DXF 파서 테스트
      console.log('4. DXF 엔티티 파싱 테스트 중...');
      const parseRes = await runPythonScript('dxf_parser.py', [outDxfPath]);
      console.log(`파싱 상태: ${parseRes.status}`);
      console.log(`총 엔티티 수: ${parseRes.total_entities}`);
      console.log(`엔티티 구성:`, parseRes.entity_counts);
      console.log(`전체 바운딩 박스:`, parseRes.global_bounds);

      // 프레임 탐지 테스트
      console.log('5. 도면 프레임/시트 탐지 테스트 중...');
      const tempCadJson = path.join(tempDir, 'cad_precheck.json');
      fs.writeFileSync(tempCadJson, JSON.stringify(parseRes));
      const frameRes = await runPythonScript('frame_detector.py', [tempCadJson]);
      console.log(`프레임 탐지 상태: ${frameRes.status}`);
      console.log(`탐지된 프레임/시트 수: ${frameRes.frames ? frameRes.frames.length : 0}개`);

      // 표제란 및 구조 분석 테스트
      console.log('6. 표제란 및 구조 분석 테스트 중...');
      const strucRes = await runPythonScript('dwg_structure_analyzer.py', [tempCadJson, tempCadJson]);
      console.log(`구조 분석 상태: ${strucRes.status}`);
      console.log(`분석된 도면 시트 수: ${strucRes.drawings ? strucRes.drawings.length : 0}개`);
      if (strucRes.drawings && strucRes.drawings.length > 0) {
        console.log(`도면 시트 목록 (총 ${strucRes.drawings.length}개):`, strucRes.drawings.map((d: any) => ({
          index: d.drawing_index,
          drawing_no: d.drawing_no_normalized || d.drawing_no_raw,
          name: d.drawing_name_raw,
          type: d.drawing_type,
          scale: d.scale,
          material: d.material
        })));
      }

      // BOM 테이블 추출 테스트
      console.log('7. BOM 자재표 추출 테스트 중...');
      const bomRes = await runPythonScript('bom_table_extractor.py', [tempCadJson, tempCadJson]);
      console.log(`BOM 추출 상태: ${bomRes.status}`);
      console.log(`추출된 원시 BOM 행 수: ${bomRes.raw_bom_items ? bomRes.raw_bom_items.length : 0}개`);
      if (bomRes.raw_bom_items && bomRes.raw_bom_items.length > 0) {
        console.log('BOM 샘플 (상위 5개):', bomRes.raw_bom_items.slice(0, 5));
      }
    }
  } catch (err: any) {
    console.error('적합성 검사 중 에러:', err);
  }

  console.log('=== 사전 확인 완료 ===');
}

testSecondaryDwgPrecheck().catch(console.error);
