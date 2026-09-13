import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId');

  // Guard: Verify that at least one valid source CAD drawing exists for this case
  const hasSourceDrawing = fileId
    ? db.prepare(`
        SELECT 1 FROM uploaded_files
        WHERE quotation_case_id = ? AND (id = ? OR derived_from_file_id = ?) AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
        LIMIT 1
      `).get(id, fileId, fileId)
    : db.prepare(`
        SELECT 1 FROM uploaded_files
        WHERE quotation_case_id = ? AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
        LIMIT 1
      `).get(id);

  if (!hasSourceDrawing) {
    return NextResponse.json({ error: '등록된 도면 파일이 없습니다.' }, { status: 404 });
  }

  const derivedDir = getStorageSubdir('derived');
  const localDerived = path.join(process.cwd(), 'storage', 'derived');
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\SteveLee', 'AppData', 'Roaming');
  const projectId = process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID || '5883d2d5-7b0a-4947-a4fa-1f702c1dbc2f';
  const envName = process.env.NEXT_PUBLIC_EGDESK_ENV || 'development';
  const egdeskDerived = path.join(appData, 'egdesk', 'user-data', envName, 'projects', projectId, 'storage', 'derived');

  const filePrefix = fileId ? `${id}_${fileId}` : id;
  const candidates = [
    path.join(derivedDir, `${filePrefix}__cad_texts.json`),
    path.join(localDerived, `${filePrefix}__cad_texts.json`),
    path.join(egdeskDerived, `${filePrefix}__cad_texts.json`)
  ];

  // If fileId given and derived_from_file_id might have been used in naming, check alternative
  if (fileId) {
    const altRow = db.prepare(`
      SELECT id FROM uploaded_files
      WHERE quotation_case_id = ? AND (derived_from_file_id = ? OR id = ?) AND file_type = 'DXF'
      LIMIT 1
    `).get(id, fileId, fileId) as any;
    if (altRow && altRow.id !== fileId) {
      const altPrefix = `${id}_${altRow.id}`;
      candidates.push(
        path.join(derivedDir, `${altPrefix}__cad_texts.json`),
        path.join(localDerived, `${altPrefix}__cad_texts.json`),
        path.join(egdeskDerived, `${altPrefix}__cad_texts.json`)
      );
    }
  }

  // Fallback to legacy case-level cache if fileId is not explicitly provided
  if (!fileId) {
    candidates.push(
      path.join(derivedDir, `${id}__cad_texts.json`),
      path.join(localDerived, `${id}__cad_texts.json`),
      path.join(egdeskDerived, `${id}__cad_texts.json`)
    );
  }

  let targetTxt = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      targetTxt = c;
      break;
    }
  }

  // Cross-sync if found in one location
  if (targetTxt) {
    for (const c of candidates.slice(0, 3)) {
      if (!fs.existsSync(c)) {
        try {
          fs.mkdirSync(path.dirname(c), { recursive: true });
          fs.copyFileSync(targetTxt, c);
        } catch {}
      }
    }
  }

  // Auto-generate if missing in all locations
  if (!targetTxt || !fs.existsSync(targetTxt)) {
    const sourceFile = fileId
      ? ((await db.prepare(`
          SELECT * FROM uploaded_files
          WHERE quotation_case_id = ? AND (id = ? OR derived_from_file_id = ?) AND file_type IN ('DXF', 'DWG')
          ORDER BY (CASE WHEN file_type = 'DXF' THEN 1 ELSE 2 END) ASC, rowid DESC
          LIMIT 1
        `).get(id, fileId, fileId)) as any)
      : ((await db.prepare(`
          SELECT * FROM uploaded_files
          WHERE quotation_case_id = ? AND file_type IN ('DXF', 'DWG')
          ORDER BY (CASE WHEN file_type = 'DXF' THEN 1 ELSE 2 END) ASC, rowid DESC
          LIMIT 1
        `).get(id)) as any);

    if (sourceFile && sourceFile.storage_path) {
      const srcPath = resolveStoragePath(sourceFile.storage_path);
      if (fs.existsSync(srcPath)) {
        const pyScript = path.join(process.cwd(), 'scripts', 'cad_webgl_exporter.py');
        const destBin = path.join(candidates[0].replace('__cad_texts.json', '__cad_webgl.bin'));
        fs.mkdirSync(path.dirname(destBin), { recursive: true });
        spawnSync('python', [pyScript, srcPath, destBin], { timeout: 30000 });
        if (fs.existsSync(candidates[0])) {
          targetTxt = candidates[0];
          // Copy to other locations as well
          for (const c of candidates.slice(0, 3)) {
            if (c !== candidates[0] && !fs.existsSync(c)) {
              try {
                fs.mkdirSync(path.dirname(c), { recursive: true });
                fs.copyFileSync(candidates[0], c);
              } catch {}
            }
          }
        }
      }
    }
  }

  if (!targetTxt || !fs.existsSync(targetTxt)) {
    return NextResponse.json({ texts: [] });
  }

  try {
    const fileContent = fs.readFileSync(targetTxt, 'utf-8');
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: '텍스트 데이터 읽기 실패: ' + err.message }, { status: 500 });
  }
}
