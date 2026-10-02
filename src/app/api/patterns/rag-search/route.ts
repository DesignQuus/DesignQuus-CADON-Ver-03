import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { searchCadRagChunks } from '@/lib/cad-chunking-engine';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, caseId, companyName, chunkType, limit, threshold } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: '검색어를 입력해 주세요.' }, { status: 400 });
    }

    const results = await searchCadRagChunks(query.trim(), {
      caseId,
      companyName,
      chunkType,
      limit: limit ? Number(limit) : 10,
      threshold: threshold ? Number(threshold) : 0.15
    });

    return NextResponse.json({
      success: true,
      query: query.trim(),
      total: results.length,
      results
    });
  } catch (err: any) {
    console.error('[/api/patterns/rag-search] error:', err);
    return NextResponse.json({ error: err.message || '하이브리드 RAG 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
