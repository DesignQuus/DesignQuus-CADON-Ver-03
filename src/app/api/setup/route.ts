export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { setupDatabase } from '@/lib/setup-db';

export async function GET() {
  try {
    const result = await setupDatabase();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /api/setup Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
