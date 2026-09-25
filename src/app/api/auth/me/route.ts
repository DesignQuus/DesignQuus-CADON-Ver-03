import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  let myActiveCasesCount = 0;
  try {
    const allCases = (await db.prepare('SELECT id, created_by_user_id, status, lifecycle_status, deleted_at FROM quotation_cases').all()) as any[];
    const isCaseDeleted = (c: any) => Boolean(c.deleted_at) && c.deleted_at !== 'NULL' && c.deleted_at !== 'null';
    myActiveCasesCount = allCases.filter(c =>
      c.created_by_user_id === session.userId &&
      !isCaseDeleted(c) &&
      c.lifecycle_status !== 'TRASHED' &&
      c.lifecycle_status !== 'ARCHIVED' &&
      c.status !== 'ARCHIVED'
    ).length;
  } catch (err) {
    console.warn('Failed to compute myActiveCasesCount:', err);
  }

  return NextResponse.json({
    user: {
      ...session,
      myActiveCasesCount
    }
  });
}

