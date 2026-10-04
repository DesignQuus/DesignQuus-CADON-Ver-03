import { setupDatabase } from '../src/lib/setup-db';

/**
 * 사용법:
 *   npx tsx scripts/run-setup-db.ts --dry-run                 # 변경 예정 내역만 출력
 *   npx tsx scripts/run-setup-db.ts --only=quotation_cases    # 지정 테이블만 마이그레이션 (쉼표로 여러 개)
 *   npx tsx scripts/run-setup-db.ts                           # 전체 셋업 (사전에 scripts/backup-db.ts 실행 권장)
 */
async function main() {
  console.log('====================================================');
  console.log('   CADON-BOM AI: EGDesk Database Zero-Config Setup  ');
  console.log('====================================================');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const onlyTables = onlyArg ? onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : undefined;

  try {
    const res = await setupDatabase({ dryRun, onlyTables });
    if (res.results) console.log(JSON.stringify(res.results, null, 2));
    console.log(res.success ? 'SUCCESS:' : 'FAILURE:', res.message);
    process.exit(res.success ? 0 : 1);
  } catch (err: any) {
    console.error('FAILURE:', err.message);
    process.exit(1);
  }
}

main();
