import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  // Guard: Verify that at least one valid source CAD drawing exists for this case
  const hasSourceDrawing = db.prepare(`
    SELECT 1 FROM uploaded_files
    WHERE quotation_case_id = ? AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
    LIMIT 1
  `).get(id);

  if (!hasSourceDrawing) {
    return NextResponse.json({ error: '등록된 도면 파일이 없습니다.' }, { status: 404 });
  }

  // 1. Look for registered VECTOR_SVG file
  let svgFile = (await db.prepare(`
    SELECT * FROM uploaded_files
    WHERE quotation_case_id = ? AND (file_role = 'VECTOR_SVG' OR original_file_name LIKE '%.svg')
    ORDER BY rowid DESC
    LIMIT 1
  `).get(id)) as any;

  let svgPath: string | null = null;
  if (svgFile && svgFile.storage_path) {
    const p = resolveStoragePath(svgFile.storage_path);
    if (fs.existsSync(p)) svgPath = p;
  }

  // 2. Fallback: Check storage/derived or storage directory
  if (!svgPath) {
    const derivedCandidates = [
      path.join(getStorageSubdir('derived'), `${id}__hd_vector.svg`),
      path.join(process.cwd(), 'storage', 'derived', `${id}__hd_vector.svg`),
      path.join(process.cwd(), 'storage', 'test_vector.svg')
    ];
    for (const c of derivedCandidates) {
      if (fs.existsSync(c)) {
        svgPath = c;
        break;
      }
    }
  }

  // 3. On-demand Generation: If SVG not found, generate it immediately from source DXF
  if (!svgPath || !fs.existsSync(svgPath)) {
    const sourceFile = (await db.prepare(`
      SELECT * FROM uploaded_files
      WHERE quotation_case_id = ? AND file_type IN ('DXF', 'DWG')
      ORDER BY (CASE WHEN file_type = 'DXF' THEN 1 ELSE 2 END) ASC, rowid DESC
      LIMIT 1
    `).get(id)) as any;

    if (sourceFile && sourceFile.storage_path) {
      const srcPath = resolveStoragePath(sourceFile.storage_path);
      if (fs.existsSync(srcPath)) {
        const derivedStorageDir = getStorageSubdir('derived');
        const targetSvg = path.join(derivedStorageDir, `${id}__hd_vector.svg`);

        const { spawnSync } = await import('child_process');
        spawnSync('python', ['scripts/vector_svg_renderer.py', srcPath, targetSvg]);
        if (fs.existsSync(targetSvg)) {
          svgPath = targetSvg;
        }
      }
    }
  }

  if (!svgPath || !fs.existsSync(svgPath)) {
    return NextResponse.json({ error: '생성된 고화질 벡터 SVG 파일이 없습니다.' }, { status: 404 });
  }

  try {
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Content-Disposition': 'inline'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: '벡터 SVG 읽기 실패: ' + err.message }, { status: 500 });
  }
}
