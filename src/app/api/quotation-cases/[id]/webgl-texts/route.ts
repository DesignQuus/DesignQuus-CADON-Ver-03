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
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId');

    const derivedDir = getStorageSubdir('derived');
    const localDerived = path.join(process.cwd(), 'storage', 'derived');

    // Guard: Verify that at least one valid source CAD drawing exists for this case
    let hasSourceDrawing = false;
    try {
      const row = await (fileId
        ? db.prepare(`
            SELECT 1 FROM uploaded_files
            WHERE quotation_case_id = ? AND (id = ? OR derived_from_file_id = ?) AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
            LIMIT 1
          `).get(id, fileId, fileId)
        : db.prepare(`
            SELECT 1 FROM uploaded_files
            WHERE quotation_case_id = ? AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
            LIMIT 1
          `).get(id));
      hasSourceDrawing = !!row;
    } catch (dbErr) {
      console.warn('[webgl-texts] DB check error, falling back to disk search:', dbErr);
      hasSourceDrawing = true;
    }

    const filePrefix = fileId ? `${id}_${fileId}` : id;
    const candidates = [
      path.join(derivedDir, `${filePrefix}__cad_texts.json`),
      path.join(localDerived, `${filePrefix}__cad_texts.json`)
    ];

    // If fileId given and derived_from_file_id might have been used in naming, check alternative
    if (fileId) {
      try {
        const altRow = (await db.prepare(`
          SELECT id FROM uploaded_files
          WHERE quotation_case_id = ? AND (derived_from_file_id = ? OR id = ?) AND file_type = 'DXF'
          LIMIT 1
        `).get(id, fileId, fileId)) as any;
        if (altRow && altRow.id) {
          const altPrefix = `${id}_${altRow.id}`;
          candidates.unshift(
            path.join(derivedDir, `${altPrefix}__cad_texts.json`),
            path.join(localDerived, `${altPrefix}__cad_texts.json`)
          );
        }
      } catch (altErr) {
        console.warn('[webgl-texts] Alt row lookup error:', altErr);
      }
    }

    // Always include case-level texts fallback
    candidates.push(
      path.join(derivedDir, `${id}__cad_texts.json`),
      path.join(localDerived, `${id}__cad_texts.json`)
    );

    // Auto-detect any existing CAD texts JSON matching case id on disk
    for (const d of [derivedDir, localDerived]) {
      try {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          for (const f of files) {
            if (f.startsWith(id) && f.endsWith('__cad_texts.json')) {
              const fullPath = path.join(d, f);
              if (!candidates.includes(fullPath)) {
                candidates.push(fullPath);
              }
            }
          }
        }
      } catch {}
    }

    function isValidJsonFile(filePath: string): boolean {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size < 10) return false;
        const fd = fs.openSync(filePath, 'r');
        const readLen = Math.min(stat.size, 64);
        const buf = Buffer.alloc(readLen);
        fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
        fs.closeSync(fd);
        const tail = buf.toString('utf8').trim();
        return tail.endsWith('}') || tail.endsWith(']');
      } catch {
        return false;
      }
    }

    let targetTxt = '';
    for (const c of candidates) {
      if (fs.existsSync(c) && isValidJsonFile(c)) {
        targetTxt = c;
        break;
      }
    }

    if (!targetTxt && !hasSourceDrawing) {
      return NextResponse.json({ error: '등록된 도면 파일이 없습니다.' }, { status: 404 });
    }

    // Auto-generate if missing in all locations
    if (!targetTxt || !fs.existsSync(targetTxt) || !isValidJsonFile(targetTxt)) {
      try {
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
            spawnSync('python', [pyScript, srcPath, destBin], { timeout: 180000 });
            if (fs.existsSync(candidates[0]) && isValidJsonFile(candidates[0])) {
              targetTxt = candidates[0];
            }
          }
        }
      } catch (genErr) {
        console.warn('[webgl-texts] On-the-fly generation error:', genErr);
      }
    }

    if (!targetTxt || !fs.existsSync(targetTxt)) {
      return NextResponse.json({ texts: [] });
    }

    const fileContent = fs.readFileSync(targetTxt, 'utf-8');
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      }
    });
  } catch (err: any) {
    console.error('[webgl-texts] Unexpected server error:', err);
    return NextResponse.json({ error: '텍스트 데이터 읽기 실패: ' + (err?.message || err) }, { status: 500 });
  }
}
