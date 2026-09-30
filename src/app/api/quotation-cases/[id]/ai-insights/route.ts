import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { analyzeCadCaseWithAi } from '@/lib/cad-ai-service';
import fs from 'fs';
import path from 'path';
import { getStorageSubdir } from '@/lib/storage';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: '의뢰 건 ID가 필요합니다.' }, { status: 400 });
  }

  try {
    const result = await analyzeCadCaseWithAi(id);
    
    // Cache the AI analysis result in storage/derived
    const derivedDir = getStorageSubdir('derived');
    const cacheFile = path.join(derivedDir, `${id}__ai_insights.json`);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('[ai-insights] Cache save warning:', saveErr);
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[POST /api/quotation-cases/[id]/ai-insights] error:', err);
    return NextResponse.json({ error: err.message || 'AI 분석 실행 실패' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const derivedDir = getStorageSubdir('derived');
  const cacheFile = path.join(derivedDir, `${id}__ai_insights.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return NextResponse.json({ success: true, data: cached });
    } catch {}
  }

  // Not yet cached -> run analysis and cache
  try {
    const result = await analyzeCadCaseWithAi(id);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
    } catch {}
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI 분석 실패' }, { status: 500 });
  }
}
