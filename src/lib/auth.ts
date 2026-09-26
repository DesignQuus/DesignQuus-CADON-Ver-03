import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cadon-bom-secret-key-super-secure-production-2026'
);

export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'SALES_USER' | 'REVIEWER' | 'GUEST';

export interface UserSession {
  userId: string;
  loginId: string;
  name: string;
  role: UserRole;
  companyId?: string | null;
  tenant_id?: string | null;
  employee_number?: string | null;
  phone?: string | null;
}

export async function createSession(user: UserSession): Promise<string> {
  const tenantId = user.tenant_id || user.companyId || 'comp_unassigned';
  const tokenPayload = {
    ...user,
    tenant_id: tenantId,
    companyId: tenantId
  };

  const token = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: false,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  };

  cookieStore.set('cadon_session', token, cookieOptions);
  cookieStore.set('auth_token', token, cookieOptions);

  return token;
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('cadon_session')?.value || cookieStore.get('auth_token')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as any;
    return {
      userId: p.userId || p.id || '',
      loginId: p.loginId || p.username || '',
      name: p.name || '',
      role: p.role || 'SALES_USER',
      companyId: p.companyId || p.tenant_id || null,
      tenant_id: p.tenant_id || p.companyId || null,
      employee_number: p.employee_number || null,
      phone: p.phone || null
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete('cadon_session');
  cookieStore.delete('auth_token');
}

export async function authenticateUser(loginId: string, plainPass: string): Promise<UserSession | null> {
  const user = (await db.prepare('SELECT * FROM users WHERE login_id = ? AND is_active = 1').get(loginId)) as {
    id: string;
    login_id: string;
    password_hash: string;
    name: string;
    role: UserRole;
    company_id: string | null;
    tenant_id?: string | null;
    employee_number?: string | null;
    phone?: string | null;
    deleted_at?: string | null;
  } | undefined;

  if (!user || user.deleted_at) return null;

  const valid = bcrypt.compareSync(plainPass, user.password_hash);
  if (!valid) return null;

  try {
    await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  } catch (updateErr: any) {
    console.warn('[authenticateUser] Non-critical last_login_at update warning:', updateErr?.message);
  }

  const tenantId = user.tenant_id || user.company_id || 'comp_unassigned';
  return {
    userId: user.id,
    loginId: user.login_id,
    name: user.name,
    role: user.role,
    companyId: tenantId,
    tenant_id: tenantId,
    employee_number: user.employee_number || null,
    phone: user.phone || null
  };
}
