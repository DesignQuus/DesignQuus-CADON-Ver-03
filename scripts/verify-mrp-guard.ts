import { runMrpExplosion } from '../src/lib/mrp-engine';

async function verifyMrpGuard() {
  console.log('=== 1. caseId 누락 가드 테스트 ===');
  try {
    // @ts-ignore
    await runMrpExplosion('');
    console.error('FAIL: Expected error but succeeded');
  } catch (e: any) {
    console.log('SUCCESS: Guard caught missing caseId ->', e.message);
  }

  console.log('\n=== 2. 1차 케이스 runMrpExplosion 검증 ===');
  const res1 = await runMrpExplosion('case_1789766302590');
  console.log('1차 케이스 Audit:', {
    singleParts: res1.audit.totalDrawingsSinglePart,
    assemblies: res1.audit.totalDrawingsAssembly,
    sheetDemands: res1.sheetDemands.length,
    roundBarDemands: res1.roundBarDemands.length
  });

  console.log('\n=== 3. 2차 케이스 runMrpExplosion 검증 ===');
  const res2 = await runMrpExplosion('case_1789894718545');
  console.log('2차 케이스 Audit:', {
    singleParts: res2.audit.totalDrawingsSinglePart,
    assemblies: res2.audit.totalDrawingsAssembly,
    sheetDemands: res2.sheetDemands.length,
    roundBarDemands: res2.roundBarDemands.length
  });
}

verifyMrpGuard().catch(console.error);
