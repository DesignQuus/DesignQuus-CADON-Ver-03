import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cadon-bom-secret-key-super-secure-production-2026'
);

export interface UserSession {
  userId: string;
  loginId: string;
  name: string;
  role: 'SUPER_ADMIN' | 'SALES_USER' | 'REVIEWER';
  companyId?: string | null;
}

export async function createSession(user: UserSession): Promise<string> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('cadon_session', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });

  return token;
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('cadon_session')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserSession;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete('cadon_session');
}

export async function authenticateUser(loginId: string, plainPass: string): Promise<UserSession | null> {
  const user = (await db.prepare('SELECT * FROM users WHERE login_id = ? AND is_active = 1').get(loginId)) as {
    id: string;
    login_id: string;
    password_hash: string;
    name: string;
    role: 'SUPER_ADMIN' | 'SALES_USER' | 'REVIEWER';
    company_id: string | null;
  } | undefined;

  if (!user) return null;

  const valid = bcrypt.compareSync(plainPass, user.password_hash);
  if (!valid) return null;

  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);

  return {
    userId: user.id,
    loginId: user.login_id,
    name: user.name,
    role: user.role,
    companyId: user.company_id
  };
}
