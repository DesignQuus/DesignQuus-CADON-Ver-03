import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath } from '@/lib/storage';
import fs from 'fs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const exp = db.prepare('SELECT * FROM quote_exports WHERE id = ?').get(id) as any;
  if (!exp) {
    return NextResponse.json({ error: '다운로드할 파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 🛡️ [조치 A] 미승인 견적서 파일 다운로드 원천 차단 가드
  if (exp.quote_id) {
    const quote = (await db.prepare('SELECT status, is_locked FROM quotes WHERE id = ?').get(exp.quote_id)) as any;
    if (quote && (quote.status !== 'APPROVED' || quote.is_locked !== 1)) {
      return NextResponse.json({ 
        error: '미승인 견적서는 다운로드할 수 없습니다. 모든 단가 검토 후 [견적 승인]을 완료해주세요.' 
      }, { status: 403 });
    }
  }

  const fullPath = resolveStoragePath(exp.storage_path);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: '다운로드할 파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(fullPath);
  const encodedName = encodeURIComponent(exp.file_name);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`
    }
  });
}
