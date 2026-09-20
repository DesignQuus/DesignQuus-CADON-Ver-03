import fs from 'fs';
import path from 'path';

async function inspectCadJson() {
  const jsonPath = path.join(process.cwd(), 'scratch', 'cad_precheck.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('cad_precheck.json not found');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('=== 2차 도면(2503-021_sample_1) 내부 내용 분석 ===');
  console.log('총 엔티티 수:', data.total_entities);

  // 텍스트/MTEXT 엔티티 샘플링
  const texts = (data.objects || []).filter((o: any) => o.entity_type === 'TEXT' || o.entity_type === 'MTEXT');
  console.log(`텍스트 엔티티 총 건수: ${texts.length}건`);

  const sampleTexts = texts.slice(0, 30).map((t: any) => t.raw_text);
  console.log('텍스트 샘플 30건:', sampleTexts);

  // 레이어 목록
  const layers = new Set<string>();
  for (const o of (data.objects || [])) {
    if (o.layer) layers.add(o.layer);
  }
  console.log('도면 내 레이어 목록:', Array.from(layers));

  // INSERT 블록 참조 샘플링
  const inserts = (data.objects || []).filter((o: any) => o.entity_type === 'INSERT');
  console.log(`INSERT(블록) 엔티티 수: ${inserts.length}건`);
  const blockNames = new Set<string>();
  for (const ins of inserts) {
    if (ins.geometry_data?.block_name) blockNames.add(ins.geometry_data.block_name);
  }
  console.log('블록 이름 목록:', Array.from(blockNames).slice(0, 20));
}

inspectCadJson().catch(console.error);
