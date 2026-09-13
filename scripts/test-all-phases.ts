import { execSync } from 'child_process';

const PHASES = [
  { name: 'Phase 1: Tenant Core Modules', file: 'scripts/test_phase1_tenant.ts' },
  { name: 'Phase 2: Database Schema & Migration', file: 'scripts/test_phase2_db.ts' },
  { name: 'Phase 3: Operators API & Guard Rules', file: 'scripts/test_phase3_operators.ts' },
  { name: 'Phase 4: Members Portal UI & Navigation', file: 'scripts/test_phase4_ui.ts' },
  { name: 'Phase 5: Full Multi-Tenant System Integration', file: 'scripts/test_phase5_tenant_all.ts' },
];

async function runAll() {
  console.log('================================================================');
  console.log('       CADON-BOM AI: COMPREHENSIVE MULTI-TENANT TEST SUITE      ');
  console.log('================================================================\n');

  let passed = 0;
  for (const phase of PHASES) {
    console.log(`\n▶ [RUNNING] ${phase.name}...`);
    try {
      execSync(`npx tsx ${phase.file}`, { stdio: 'inherit' });
      console.log(`✔ [PASS] ${phase.name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${phase.name}`);
      process.exit(1);
    }
  }

  console.log('\n================================================================');
  console.log(`   🎉 ALL ${passed}/${PHASES.length} MULTI-TENANT TEST PHASES PASSED 100%!  `);
  console.log('================================================================');
}

runAll();
