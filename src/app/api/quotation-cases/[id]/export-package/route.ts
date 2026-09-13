import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const drawings = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ?').all(id)) as any[];
    const rawBom = (await db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ?').all(id)) as any[];
    const dwgFile = (await db.prepare("SELECT * FROM uploaded_files WHERE quotation_case_id = ? AND file_type = 'DWG' ORDER BY rowid DESC LIMIT 1").get(id)) as any;
    const dxfFile = (await db.prepare("SELECT * FROM uploaded_files WHERE quotation_case_id = ? AND file_type = 'DXF' ORDER BY rowid DESC LIMIT 1").get(id)) as any;

    const manifest = {
      case_info: {
        case_id: qc.id,
        case_no: qc.case_no,
        case_name: qc.case_name,
        project_name: '인버터 조립 LINE',
        customer: 'A&G/보그워너',
        designer: '이경중',
        design_date: '24.03.15'
      },
      dwg_path: dwgFile ? resolveStoragePath(dwgFile.storage_path) : null,
      dxf_path: dxfFile ? resolveStoragePath(dxfFile.storage_path) : null,
      title_blocks: drawings,
      bom_items: rawBom
    };

    const tempDir = getStorageSubdir('temp');
    const manifestPath = path.join(tempDir, `manifest_${id}_${Date.now()}.json`);
    const outputZipPath = path.join(tempDir, `CADON_BOM_Archive_${qc.case_no || id}.zip`);

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // Run python packager
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', ['scripts/create_export_package.py', manifestPath, outputZipPath], {
        cwd: process.cwd()
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Zip packaging failed with code ${code}`));
      });
      proc.on('error', reject);
    });

    if (!fs.existsSync(outputZipPath)) {
      return NextResponse.json({ error: 'ZIP 생성 실패' }, { status: 500 });
    }

    const zipBuffer = fs.readFileSync(outputZipPath);
    const fileName = encodeURIComponent(`${qc.case_name || 'CADON_BOM'}_보관패키지.zip`);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '패키지 생성 중 오류 발생' }, { status: 500 });
  }
}
