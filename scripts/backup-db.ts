/**
 * EGDesk My DB 전체 백업 스크립트
 *
 * 사용법:  npx tsx scripts/backup-db.ts
 *
 * 1) 물리 SQLite 파일(user_data.db + -wal/-shm) 사본  →  .backup/db-<타임스탬프>/physical/
 * 2) 테이블별 JSON 전량 덤프(COUNT(*) 건수 검증)      →  .backup/db-<타임스탬프>/tables/
 *
 * 스키마 재구축(setup:db) 전에 반드시 실행합니다. `.backup/`은 .gitignore 대상입니다.
 */
import fs from 'fs';
import path from 'path';
import '../src/lib/db'; // .env 로드 및 EGDesk 접속 환경변수 보정
import { backupAllTables, getBackupRoot, makeTimestamp } from '../src/lib/db-backup';

function copyPhysicalDb(destDir: string): string[] {
  const projectId = process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID;
  const env = process.env.NEXT_PUBLIC_EGDESK_ENV || 'development';
  if (!projectId || !process.env.APPDATA) return [];
  const srcDir = path.join(process.env.APPDATA, 'egdesk', 'user-data', env, 'projects', projectId);
  const copied: string[] = [];
  if (!fs.existsSync(srcDir)) return copied;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of ['user_data.db', 'user_data.db-wal', 'user_data.db-shm']) {
    const src = path.join(srcDir, name);
    if (!fs.existsSync(src)) continue;
    try {
      fs.copyFileSync(src, path.join(destDir, name));
      copied.push(name);
    } catch (e: any) {
      console.warn(`⚠️ 물리 파일 복사 실패 (${name}): ${e.message}`);
    }
  }
  return copied;
}

async function main() {
  const tablesArg = process.argv.slice(2).find(a => a.startsWith('--tables='));
  const onlyTables = tablesArg ? tablesArg.slice('--tables='.length).split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const root = path.join(getBackupRoot(), `db-${makeTimestamp()}${onlyTables ? '-partial' : ''}`);
  console.log(`📦 백업 위치: ${root}`);

  if (!onlyTables) {
    const physical = copyPhysicalDb(path.join(root, 'physical'));
    console.log(physical.length ? `✓ 물리 DB 파일 복사: ${physical.join(', ')}` : '⚠️ 물리 DB 파일을 찾지 못해 JSON 덤프만 진행합니다.');
  }

  const { tables } = await backupAllTables(path.join(root, 'tables'), onlyTables);
  const failed = tables.filter(t => t.error);
  const total = tables.reduce((s, t) => s + Math.max(0, t.rowCount), 0);
  for (const t of tables) {
    console.log(`  ${t.error ? '❌' : '✓'} ${t.tableName.padEnd(36)} ${t.error ? t.error : `${t.rowCount}행`}`);
  }
  console.log(`\n테이블 ${tables.length}개, 총 ${total}행 백업. 실패 ${failed.length}개.`);
  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ 백업 실패:', err?.message || err);
  process.exit(1);
});
