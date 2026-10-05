import fs from 'fs';
import path from 'path';

async function seedSnapshot() {
  const caseId = 'case_1791141003647';
  const derivedDir = path.join(process.cwd(), 'storage', 'derived');
  const snapshotPath = path.join(derivedDir, `case_${caseId}_snapshot.json`);

  // 기본 메타데이터 구조 구성
  const snapshot = {
    case: {
      id: caseId,
      case_name: '[MAIN BELT C/V DRIVE] 가공 견적',
      status: 'QUOTED',
      company_id: 'comp_1790030182693',
      company_name: '세창 엔지니어링',
      project_name: 'MAIN BELT C/V DRIVE',
      created_by_name: '김세창',
      quote_readiness: 'READY_TO_QUOTE',
      primary_file_name: 'MAIN BELT C_V DRIVE.dwg'
    },
    permission: { canEdit: true, canDelete: true, canApprove: true },
    files: [
      {
        id: 'file_1791141007968',
        quotation_case_id: caseId,
        original_file_name: 'MAIN BELT C_V DRIVE.dwg',
        file_role: 'PRIMARY',
        has_derived_dxf: true
      }
    ],
    drawings: [],
    relationships: [],
    bomAreas: [],
    rawBomItems: [],
    flattenedBomItems: [],
    normalizedItems: [],
    candidates: [],
    approvalRecords: [],
    finalBomItems: [],
    quotes: [],
    latestQuote: null,
    quoteItems: [],
    cadObjects: [],
    latestParseRun: null
  };

  // 만약 텍스트 파일이 있으면 읽어서 기본 drawings 생성
  const textsPath = path.join(derivedDir, `${caseId}__cad_texts.json`);
  if (fs.existsSync(textsPath)) {
    try {
      const texts = JSON.parse(fs.readFileSync(textsPath, 'utf8'));
      console.log(`Found ${texts.length} CAD texts for ${caseId}`);
    } catch {}
  }

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`Successfully seeded snapshot for ${caseId} at ${snapshotPath}`);
}

seedSnapshot().catch(console.error);
