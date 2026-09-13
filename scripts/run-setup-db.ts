import { setupDatabase } from '../src/lib/setup-db';

async function main() {
  console.log('====================================================');
  console.log('   CADON-BOM AI: EGDesk Database Zero-Config Setup  ');
  console.log('====================================================');

  try {
    const res = await setupDatabase();
    console.log('SUCCESS:', res.message);
    process.exit(0);
  } catch (err: any) {
    console.error('FAILURE:', err.message);
    process.exit(1);
  }
}

main();
