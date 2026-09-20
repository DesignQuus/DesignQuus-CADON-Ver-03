import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function getFileInfo(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const size = buf.length;
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const header = buf.subarray(0, 6).toString('ascii');
  return { size, hash, header };
}

const testDir = 'C:\\dev\\CADON-Ver-03\\test file';
const files = [
  '2503-021_sample_1 (2)_202510231541.dwg',
  '2503-021_sample_1 (3)_202510231541.dwg',
  'test1.dwg',
  '새도면.dwg',
  '테스트용DWG-2.dwg'
];

for (const f of files) {
  const p = path.join(testDir, f);
  if (fs.existsSync(p)) {
    const info = getFileInfo(p);
    console.log(`[${f}]`);
    console.log(`  - Size: ${info.size} bytes (${(info.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  - SHA-256: ${info.hash}`);
    console.log(`  - Header: ${info.header}`);
  } else {
    console.log(`[${f}] NOT FOUND`);
  }
}
