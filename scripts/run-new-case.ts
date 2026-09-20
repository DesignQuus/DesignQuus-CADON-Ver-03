import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Auto-read .env.development.local if process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID is not yet set
const envPath = path.join(process.cwd(), '.env.development.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

async function runNewCase() {
  console.log('>>> STARTING NEW CASE PIPELINE...');
  const { insertRows, queryTable } = await import('../egdesk-helpers');
  const { getStorageSubdir } = await import('../src/lib/storage');
  const { processCadFilePipeline } = await import('../src/lib/cad-pipeline');

  const nowTime = new Date().toISOString();
  const dateStr = nowTime.slice(0, 10).replace(/-/g, '');
  const caseId = 'case_' + Date.now();
  const caseNo = 'QT-' + dateStr + '-NEW2';
  const caseName = '2차 신규 도면 검증 (새도면.dwg)';

  console.log('1. Creating new quotation case:', caseId, caseNo);
  await insertRows('quotation_cases', [{
    id: caseId,
    case_no: caseNo,
    company_id: 'comp_ag_borgwarner',
    project_id: 'proj_ag_inverter',
    case_name: caseName,
    request_date: nowTime.slice(0, 10),
    status: 'NEW',
    revision: 'A',
    quote_readiness: 'NOT_READY',
    created_by_user_id: 'usr_1789389016423',
    created_at: nowTime,
    updated_at: nowTime
  }]);

  console.log('2. Reading file: c:/dev/CADON-Ver-03/test file/새도면.dwg');
  const srcPath = 'c:/dev/CADON-Ver-03/test file/새도면.dwg';
  const buffer = fs.readFileSync(srcPath);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = '.dwg';

  const storageDir = getStorageSubdir('files');
  const storedFileName = Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext;
  const storagePath = path.join(storageDir, storedFileName);
  fs.writeFileSync(storagePath, buffer);

  const fileId = 'file_' + Date.now();
  console.log('3. Inserting uploaded_files record:', fileId, storedFileName);
  await insertRows('uploaded_files', [{
    id: fileId,
    quotation_case_id: caseId,
    original_file_name: '새도면.dwg',
    stored_file_name: storedFileName,
    storage_path: storagePath,
    file_type: 'DWG',
    file_role: 'SOURCE',
    file_size: buffer.length,
    checksum: checksum,
    upload_status: 'UPLOADED',
    uploaded_by_user_id: 'usr_1789389016423',
    created_at: nowTime
  }]);

  console.log('4. Running CAD pipeline for new case...');
  const res = await processCadFilePipeline(caseId, fileId, 'usr_1789389016423');
  console.log('Pipeline Result:', JSON.stringify(res, null, 2));

  console.log('=== CASE ID:', caseId, '===');
}

runNewCase().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
