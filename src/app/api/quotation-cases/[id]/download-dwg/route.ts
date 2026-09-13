import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath } from '@/lib/storage';
import path from 'path';
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

  // Find original DWG file (or DXF fallback)
  let file = (await db.prepare(`
    SELECT * FROM uploaded_files
    WHERE quotation_case_id = ? AND (file_type = 'DWG' OR original_file_name LIKE '%.dwg')
    ORDER BY rowid DESC
    LIMIT 1
  `).get(id)) as any;

  if (!file) {
    file = (await db.prepare(`
      SELECT * FROM uploaded_files
      WHERE quotation_case_id = ? AND (file_type = 'DXF' OR original_file_name LIKE '%.dxf')
      ORDER BY rowid DESC
      LIMIT 1
    `).get(id)) as any;
  }

  if (!file) {
    return NextResponse.json({ error: '다운로드할 도면 파일이 없습니다.' }, { status: 404 });
  }

  const filePath = resolveStoragePath(file.storage_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const encodedFilename = encodeURIComponent(file.original_file_name);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.original_file_name}"; filename*=UTF-8''${encodedFilename}`
    }
  });
}
