import fs from 'fs';
import '../src/lib/db';
import { readAllRows } from '../src/lib/db-backup';

/** 사용법: npx tsx scripts/verify-migration.ts <backup.json> — 백업 JSON과 라이브 테이블의 모든 공통 컬럼 값을 비교 */
async function main() {
  const file = process.argv[2];
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const live = await readAllRows(backup.tableName);
  const liveById = new Map(live.map((r: any) => [String(r.id), r]));
  let diffs = 0;
  for (const old of backup.rows) {
    const cur = liveById.get(String(old.id));
    if (!cur) { console.log(`❌ 누락 id=${old.id}`); diffs++; continue; }
    for (const k of Object.keys(old)) {
      if (k === '_version' || !(k in cur)) continue;
      if (String(old[k] ?? '') !== String(cur[k] ?? '')) {
        console.log(`❌ id=${old.id} ${k}: "${old[k]}" → "${cur[k]}"`);
        diffs++;
      }
    }
  }
  console.log(`백업 ${backup.rows.length}행 / 라이브 ${live.length}행 / 값 불일치 ${diffs}건`);
  process.exit(diffs === 0 && live.length === backup.rows.length ? 0 : 1);
}
main().catch(e => { console.error(e.message); process.exit(1); });
