import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { resolveExecutable } from '@/lib/cad-resolver';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';

// Auto-detect helper for AutoCAD / commercial CAD executables on Windows
function detectCandidatePaths() {
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const autocadCandidates: string[] = [];
  const autodeskDir = path.join(progFiles, 'Autodesk');

  // 1. Dynamic scan of Autodesk folder for AutoCAD versions (e.g., AutoCAD 2026, AutoCAD 2025, etc.)
  if (fs.existsSync(autodeskDir)) {
    try {
      const subdirs = fs.readdirSync(autodeskDir);
      const acadDirs = subdirs
        .filter(d => /^AutoCAD\s*\d{4}/i.test(d))
        .sort((a, b) => b.localeCompare(a)); // Newer versions first
      for (const ad of acadDirs) {
        const exe = path.join(autodeskDir, ad, 'acad.exe');
        if (fs.existsSync(exe)) {
          autocadCandidates.push(exe);
        }
      }
    } catch {}
  }

  // 2. Explicit year check for standard AutoCAD paths
  const years = ['2027', '2026', '2025', '2024', '2023', '2022', '2021', '2020'];
  for (const y of years) {
    const p = path.join(progFiles, 'Autodesk', `AutoCAD ${y}`, 'acad.exe');
    if (fs.existsSync(p) && !autocadCandidates.includes(p)) {
      autocadCandidates.push(p);
    }
  }

  // 3. Fallback to DWG TrueView if installed
  for (const y of years) {
    const tvCandidates = [
      path.join(progFiles, 'Autodesk', `DWG TrueView ${y} - English`, 'dwgviewr.exe'),
      path.join(progFiles, 'Autodesk', `DWG TrueView ${y} - Korean`, 'dwgviewr.exe'),
      path.join(progFiles, 'Autodesk', `DWG TrueView ${y}`, 'dwgviewr.exe')
    ];
    for (const tv of tvCandidates) {
      if (fs.existsSync(tv) && !autocadCandidates.includes(tv)) {
        autocadCandidates.push(tv);
      }
    }
  }

  return { autocadCandidates };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { autocadCandidates } = detectCandidatePaths();

  const autocadRow = db.prepare(`SELECT value FROM cad_app_settings WHERE key = 'autocad_path'`).get() as any;
  const rawAutocad = autocadRow?.value?.trim() || '';

  const effectivePath = rawAutocad || (autocadCandidates[0] || '');
  const resolvedAutocad = effectivePath ? resolveExecutable(effectivePath) : null;
  const autocadExists = Boolean(resolvedAutocad && fs.existsSync(resolvedAutocad.exePath));
  const isAutocadInstalled = autocadCandidates.length > 0 || autocadExists;

  return NextResponse.json({
    autocadPath: rawAutocad || (autocadCandidates[0] || ''),
    detectedAutocadPath: autocadCandidates[0] || null,
    autocadCandidates,
    autocadExists,
    isAutocadInstalled,
    isConfigured: Boolean(rawAutocad && autocadExists)
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json();
  const now = new Date().toISOString();

  // Test action
  if (body.action === 'test') {
    const rawPath = body.exePath?.trim();
    const resolved = resolveExecutable(rawPath);

    if (!resolved || !fs.existsSync(resolved.exePath)) {
      return NextResponse.json({
        success: false,
        error: `지정한 경로(${rawPath})에서 실행 파일(.exe)을 찾을 수 없습니다.`
      }, { status: 400 });
    }

    // Find sample DWG from storage
    const dwgRow = (await db.prepare(`SELECT storage_path FROM uploaded_files WHERE file_type = 'DWG' OR original_file_name LIKE '%.dwg' ORDER BY rowid DESC LIMIT 1`).get()) as any;
    const sampleFile = dwgRow?.storage_path ? resolveStoragePath(dwgRow.storage_path) : path.join(getStorageSubdir('files'), 'REAL_TEST_MACHINE.dwg');
    const targetFile = fs.existsSync(sampleFile) ? sampleFile : process.cwd();

    try {
      const escapedExe = resolved.exePath.replace(/'/g, "''");
      const escapedDir = resolved.workingDir.replace(/'/g, "''");
      const escapedFile = targetFile.replace(/'/g, "''");

      const psCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedDir}' -ArgumentList '\\"${escapedFile}\\"'"`;
      
      execSync(psCmd);

      return NextResponse.json({
        success: true,
        message: `테스트 실행 성공: ${path.basename(resolved.exePath)} (경로: ${resolved.exePath}) 프로그램이 실행되었습니다.`,
        exePath: resolved.exePath
      });
    } catch (err: any) {
      return NextResponse.json({
        success: false,
        error: `프로그램 실행 실패: ${err.message}`
      }, { status: 500 });
    }
  }

  // Save action
  const { autocadPath } = body;

  if (autocadPath !== undefined) {
    if (autocadPath && autocadPath.trim()) {
      db.prepare(`
        INSERT INTO cad_app_settings (key, value, updated_at)
        VALUES ('autocad_path', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(autocadPath.trim(), now);
    } else {
      db.prepare(`DELETE FROM cad_app_settings WHERE key = 'autocad_path'`).run();
    }
  }

  return NextResponse.json({
    success: true,
    message: 'AutoCAD 실행 프로그램 설정이 성공적으로 저장되었습니다.'
  });
}
