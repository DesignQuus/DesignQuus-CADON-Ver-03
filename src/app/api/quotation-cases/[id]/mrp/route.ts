import { NextRequest, NextResponse } from 'next/server';
import { runMrpExplosion } from '@/lib/mrp-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 조건 B: quotation_case_id 하드 바인딩 (전달된 id 또는 타깃 케이스)
    const caseId = id || 'case_1789766302590';
    
    const result = await runMrpExplosion(caseId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to run MRP explosion:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
