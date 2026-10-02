import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { generateCadSemanticChunks, saveCadSemanticChunks } from '@/lib/cad-chunking-engine';
import { queryTable } from '../../../../../egdesk-helpers';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const caseId = url.searchParams.get('caseId');

    const filters: Record<string, string> = {};
    if (caseId) filters.case_id = caseId;

    const queryRes = await queryTable('cad_rag_chunks', {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      limit: 100
    });

    const rows = Array.isArray(queryRes) ? queryRes : (queryRes?.rows || []);
    const chunks = rows.map((r: any) => ({
      id: r.chunk_id || String(r.id),
      caseId: r.case_id,
      companyName: r.company_name,
      drawingNo: r.drawing_no,
      chunkType: r.chunk_type,
      chunkTitle: r.chunk_title,
      chunkContent: r.chunk_text,
      parentChunkId: r.parent_chunk_id,
      metadata: JSON.parse(r.metadata_json || '{}'),
      createdAt: r.created_at
    }));

    return NextResponse.json({
      success: true,
      total: chunks.length,
      chunks
    });
  } catch (err: any) {
    console.error('[/api/patterns/chunks GET] error:', err);
    return NextResponse.json({ error: err.message || '청크 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { caseId, autoSave = true } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'caseId가 필요합니다.' }, { status: 400 });
    }

    const chunks = await generateCadSemanticChunks(caseId);
    let savedCount = 0;

    if (autoSave && chunks.length > 0) {
      const saveRes = await saveCadSemanticChunks(chunks);
      savedCount = saveRes.savedCount;
    }

    return NextResponse.json({
      success: true,
      caseId,
      total: chunks.length,
      savedCount,
      chunks
    });
  } catch (err: any) {
    console.error('[/api/patterns/chunks POST] error:', err);
    return NextResponse.json({ error: err.message || 'CAD 시맨틱 청킹 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
