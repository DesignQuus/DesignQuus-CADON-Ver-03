/**
 * 테넌트 컨텍스트 유틸리티 (서버 사이드 전용)
 * 
 * Next.js 서버 컴포넌트 및 API Route 핸들러에서 현재 로그인한 사용자의
 * tenant_id를 cadon_session 혹은 auth_token 쿠키로부터 안전하게 추출합니다.
 */

import { jwtVerify, decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { queryTable } from '../../egdesk-helpers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cadon-bom-secret-key-super-secure-production-2026'
);

/**
 * 현재 로그인 세션의 tenant_id를 서버 사이드에서 추출합니다.
 * API Route 혹은 Server Component 내부에서 호출 가능합니다.
 *
 * @returns tenant_id 문자열 (미로그인 시 null 반환)
 */
export async function getTenantId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('cadon_session')?.value || cookieStore.get('auth_token')?.value;
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const tenantId = (payload as any).tenant_id || (payload as any).companyId;
      if (typeof tenantId === 'string' && tenantId.trim() !== '') return tenantId;
    } catch {
      const payload = decodeJwt(token);
      const tenantId = (payload as any).tenant_id || (payload as any).companyId;
      if (typeof tenantId === 'string' && tenantId.trim() !== '') return tenantId;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 현재 로그인 세션의 사용자 전체 정보를 서버 사이드에서 추출합니다.
 */
export async function getSessionUser(): Promise<{
  id: string;
  userId: string;
  loginId: string;
  name: string;
  role: string;
  tenant_id: string;
  companyId: string | null;
} | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('cadon_session')?.value || cookieStore.get('auth_token')?.value;
    if (!token) return null;

    let p: any = null;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      p = payload;
    } catch {
      p = decodeJwt(token);
    }

    if (!p) return null;

    const tenantId = p.tenant_id || p.companyId || 'comp_unassigned';
    const resolvedId = String(p.userId || p.id || '');
    return {
      id: resolvedId,
      userId: resolvedId,
      loginId: p.loginId || p.username || 'user',
      name: p.name || 'User',
      role: p.role || 'SALES_USER',
      tenant_id: tenantId,
      companyId: p.companyId || tenantId || null
    };
  } catch (e) {
    return null;
  }
}

/**
 * 테넌트 격리가 필요 없는 공용 테이블 목록
 */
export const TENANT_EXEMPT_TABLES: string[] = [
  'companies',
  'users',
  'system_approval_settings'
];

/**
 * 주어진 테이블명이 테넌트 격리 대상인지 여부를 반환합니다.
 */
export function isTenantIsolated(tableName: string): boolean {
  return !TENANT_EXEMPT_TABLES.includes(tableName);
}

/**
 * 테넌트 격리를 지원하는 시스템 설정 조회 헬퍼 (서버 사이드 전용)
 * 1. 현재 세션의 tenant_id를 확인하여 `${tenant_id}:${key}` 우선 조회
 * 2. 존재하지 않는 경우 단순 `key`로 폴백 조회
 */
export async function getTenantSetting(key: string, defaultValue: string | null = null): Promise<string | null> {
  try {
    const tenantId = (await getTenantId()) || 'default';
    const cKey = `${tenantId}:${key}`;

    // 1차: 테넌트 복합 키로 우선 조회
    const result = await queryTable('system_settings', { filters: { key: cKey }, limit: 1 }).catch(() => null);
    const rows = (Array.isArray(result) ? result : result?.rows) || [];
    if (rows.length > 0 && rows[0].value !== undefined && rows[0].value !== null) {
      return rows[0].value;
    }

    // 2차: 단순 키 레거시 레코드 폴백 조회
    const legacyResult = await queryTable('system_settings', { filters: { key }, limit: 1 }).catch(() => null);
    const legacyRows = ((Array.isArray(legacyResult) ? legacyResult : legacyResult?.rows) || []).filter(
      (r: any) => !r.tenant_id || r.tenant_id === '' || r.tenant_id === 'default' || r.tenant_id === tenantId
    );
    if (legacyRows.length > 0 && legacyRows[0].value !== undefined && legacyRows[0].value !== null) {
      return legacyRows[0].value;
    }

    return defaultValue;
  } catch (e) {
    return defaultValue;
  }
}
