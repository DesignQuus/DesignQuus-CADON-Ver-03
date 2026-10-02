import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

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

    // Verify that a valid CAD file exists
    let hasFile = false;
    try {
      const row = await (fileId
        ? db.prepare(`SELECT 1 FROM uploaded_files WHERE quotation_case_id = ? AND (id = ? OR derived_from_file_id = ?) LIMIT 1`).get(id, fileId, fileId)
        : db.prepare(`SELECT 1 FROM uploaded_files WHERE quotation_case_id = ? LIMIT 1`).get(id));
      hasFile = !!row;
    } catch (e) {
      hasFile = true;
    }

    const derivedDir = getStorageSubdir('derived');
    const localDerived = path.join(process.cwd(), 'storage', 'derived');
    const filePrefix = fileId ? `${id}_${fileId}` : id;

    const candidates = [
      path.join(derivedDir, `${filePrefix}__cad_rasters.json`),
      path.join(localDerived, `${filePrefix}__cad_rasters.json`)
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
            path.join(derivedDir, `${altPrefix}__cad_rasters.json`),
            path.join(localDerived, `${altPrefix}__cad_rasters.json`)
          );
        }
      } catch {}
    }

    candidates.push(
      path.join(derivedDir, `${id}__cad_rasters.json`),
      path.join(localDerived, `${id}__cad_rasters.json`)
    );

    let rasters: any[] = [];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const data = JSON.parse(fs.readFileSync(c, 'utf-8'));
          if (data && data.rasters && Array.isArray(data.rasters)) {
            rasters = data.rasters;
            break;
          }
        } catch {}
      }
    }

    return new NextResponse(JSON.stringify({ rasters }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (err: any) {
    console.error('[webgl-rasters] Unexpected server error:', err);
    return NextResponse.json({ rasters: [] }, { status: 200 });
  }
}
