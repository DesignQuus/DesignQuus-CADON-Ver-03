import { isTenantIsolated } from '../src/lib/tenant';
import { getTenantStorageKey, getClientTenantId } from '../src/lib/tenant-client';
import { jwtVerify, SignJWT } from 'jose';

async function runPhase1Test() {
  console.log('=== [PHASE 1: TENANT CORE MODULE TEST] ===');

  // 1. Test Client Tenant Storage Key Isolation
  console.log('\n--- 1. Testing getTenantStorageKey ---');
  const clientTenant = getClientTenantId();
  console.log('Default client tenant ID:', clientTenant);
  const storageKey = getTenantStorageKey('bom_filter_state');
  console.log('Generated tenant storage key:', storageKey);

  if (storageKey !== `_t_${clientTenant}_bom_filter_state`) {
    console.error('❌ Failed to generate proper tenant-prefixed storage key');
    process.exit(1);
  }
  console.log('✅ getTenantStorageKey isolation prefix: PASS');

  // 2. Test Table Isolation Policy
  console.log('\n--- 2. Testing isTenantIsolated Table Policy ---');
  const casesIsolated = isTenantIsolated('quotation_cases');
  const bomIsolated = isTenantIsolated('raw_bom_items');
  const usersIsolated = isTenantIsolated('users');
  const compIsolated = isTenantIsolated('companies');

  console.log('quotation_cases isolated:', casesIsolated);
  console.log('raw_bom_items isolated:', bomIsolated);
  console.log('users exempt from isolation:', !usersIsolated);
  console.log('companies exempt from isolation:', !compIsolated);

  if (!casesIsolated || !bomIsolated || usersIsolated || compIsolated) {
    console.error('❌ Table isolation policy mismatch');
    process.exit(1);
  }
  console.log('✅ Table isolation policy: PASS');

  // 3. Test JWT tenant_id Payload Encoding & Decoding
  console.log('\n--- 3. Testing JWT Token with tenant_id payload ---');
  const secret = new TextEncoder().encode('cadon-bom-secret-key-super-secure-production-2026');
  const testTenant = 'comp_sechang_intl';
  const token = await new SignJWT({
    userId: 'usr_test_1',
    loginId: 'tester',
    name: '세창 담당자',
    role: 'TENANT_ADMIN',
    tenant_id: testTenant,
    companyId: testTenant
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(secret);

  const { payload } = await jwtVerify(token, secret);
  console.log('Decoded Token Tenant ID:', (payload as any).tenant_id);
  console.log('Decoded Token Role:', (payload as any).role);

  if ((payload as any).tenant_id !== testTenant || (payload as any).role !== 'TENANT_ADMIN') {
    console.error('❌ Token payload verification failed');
    process.exit(1);
  }
  console.log('✅ JWT tenant_id payload & role: PASS');

  console.log('\n=== [PHASE 1 ALL TESTS PASSED] ===');
}

runPhase1Test().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
