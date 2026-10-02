import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { Readable } from 'stream';

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
      console.warn('[webgl-binary] DB check error, falling back to disk search:', dbErr);
      hasSourceDrawing = true;
    }

    const filePrefix = fileId ? `${id}_${fileId}` : id;
    const candidates: string[] = [
      path.join(derivedDir, `${filePrefix}__cad_webgl.bin`),
      path.join(localDerived, `${filePrefix}__cad_webgl.bin`),
      path.join(derivedDir, `${id}__cad_webgl.bin`),
      path.join(localDerived, `${id}__cad_webgl.bin`)
    ];

    // If fileId given and derived_from_file_id might have been used in naming, check alternative
    if (fileId) {
      try {
        const altRow = (await db.prepare(`
          SELECT id FROM uploaded_files
          WHERE quotation_case_id = ? AND (derived_from_file_id = ? OR id = ?) AND file_type = 'DXF'
          LIMIT 1
        `).get(id, fileId, fileId)) as any;
        if (altRow && altRow.id && altRow.id !== fileId) {
          const altPrefix = `${id}_${altRow.id}`;
          candidates.unshift(
            path.join(derivedDir, `${altPrefix}__cad_webgl.bin`),
            path.join(localDerived, `${altPrefix}__cad_webgl.bin`)
          );
        }
      } catch (altErr) {
        console.warn('[webgl-binary] Alt row lookup error:', altErr);
      }
    }

    // Auto-detect any existing CAD binary matching case id on disk
    for (const d of [derivedDir, localDerived]) {
      try {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          for (const f of files) {
            if (f.startsWith(id) && f.endsWith('__cad_webgl.bin')) {
              const fullPath = path.join(d, f);
              if (!candidates.includes(fullPath)) {
                candidates.push(fullPath);
              }
            }
          }
        }
      } catch {}
    }

    let targetBin = '';
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).size >= 28) {
          targetBin = c;
          break;
        }
      } catch {}
    }

    if (!targetBin && !hasSourceDrawing) {
      return NextResponse.json({ error: '등록된 도면 파일이 없습니다.' }, { status: 404 });
    }

    // Auto-generate if missing in all locations
    if (!targetBin || !fs.existsSync(targetBin)) {
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
          let srcPath = resolveStoragePath(sourceFile.storage_path);
          
          // If the source file is DWG, convert to DXF on-the-fly via dwg_converter.py
          if (sourceFile.file_type === 'DWG' || srcPath.toLowerCase().endsWith('.dwg')) {
            const dxfName = `${path.parse(sourceFile.stored_file_name || 'source').name}__converted.dxf`;
            const dxfPath = path.join(derivedDir, dxfName);
            if (!fs.existsSync(dxfPath)) {
              const convScript = path.join(process.cwd(), 'scripts', 'dwg_converter.py');
              spawnSync('python', [convScript, srcPath, dxfPath], { timeout: 60000 });
            }
            if (fs.existsSync(dxfPath)) {
              srcPath = dxfPath;
            }
          }

          if (fs.existsSync(srcPath) && srcPath.toLowerCase().endsWith('.dxf')) {
            const destBin = candidates[0];
            fs.mkdirSync(path.dirname(destBin), { recursive: true });
            const pyScript = path.join(process.cwd(), 'scripts', 'cad_webgl_exporter.py');
            spawnSync('python', [pyScript, srcPath, destBin], { timeout: 180000 });
            if (fs.existsSync(destBin) && fs.statSync(destBin).size >= 28) {
              targetBin = destBin;
            }
          }
        }
      } catch (genErr) {
        console.warn('[webgl-binary] On-the-fly generation error:', genErr);
      }
    }

    // If still not generated (e.g. LibreDWG not installed in host environment), provide a valid empty CADW binary (32 bytes header)
    if (!targetBin || !fs.existsSync(targetBin)) {
      const emptyBuf = Buffer.alloc(32);
      emptyBuf.write('CADW', 0, 'ascii'); // 0..3: magic
      emptyBuf.writeUInt32LE(2, 4);        // 4..7: version = 2
      emptyBuf.writeUInt32LE(0, 8);        // 8..11: numLines = 0
      emptyBuf.writeUInt32LE(0, 12);       // 12..15: numTris = 0
      emptyBuf.writeFloatLE(0, 16);        // 16..19: minX = 0
      emptyBuf.writeFloatLE(0, 20);        // 20..23: minY = 0
      emptyBuf.writeFloatLE(100, 24);      // 24..27: maxX = 100
      emptyBuf.writeFloatLE(100, 28);      // 28..31: maxY = 100
      return new NextResponse(emptyBuf, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': '32',
          'Cache-Control': 'no-store, no-cache',
          'Content-Disposition': `inline; filename="${id}__cad_webgl.bin"`
        }
      });
    }

    // Stream the binary file to avoid large memory buffer allocation in Node heap
    try {
      const stat = fs.statSync(targetBin);
      const nodeStream = fs.createReadStream(targetBin);
      const webStream = Readable.toWeb(nodeStream as any);

      return new NextResponse(webStream as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size.toString(),
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Content-Disposition': `inline; filename="${id}__cad_webgl.bin"`
        }
      });
    } catch (streamErr) {
      console.warn('[webgl-binary] Streaming failed, fallback to readFileSync:', streamErr);
      const fileBuffer = fs.readFileSync(targetBin);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Content-Disposition': `inline; filename="${id}__cad_webgl.bin"`
        }
      });
    }
  } catch (err: any) {
    console.error('[webgl-binary] Unexpected server error:', err);
    return NextResponse.json({ error: '바이너리 로드 실패: ' + (err?.message || err) }, { status: 500 });
  }
}
