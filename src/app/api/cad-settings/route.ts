import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import { resolveExecutable } from '@/lib/cad-resolver';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';


// Auto-detect helper for candidate CAD executables on Windows
function detectCandidatePaths() {
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  // 1. Gstarsoft DWG FastView candidates
  const fastviewCandidates = [
    'C:\\Gstarsoft\\DWGFastView\\gcStart.exe',
    'C:\\Gstarsoft\\DWGFastView\\GcLauncher.exe',
    'C:\\Gstarsoft\\DWGFastView\\dwgfastview.exe',
    'C:\\Users\\Public\\Desktop\\DWG FastView.lnk',
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\GstarSoft\\DWGFastView\\DWG FastView.lnk',
    path.join(progFiles, 'Gstarsoft', 'DWG FastView', 'gcStart.exe'),
    path.join(progFiles, 'Gstarsoft', 'DWG FastView', 'GcLauncher.exe'),
    path.join(progFiles, 'Gstarsoft', 'DWG FastView', 'dwgfastview.exe'),
    path.join(progFilesX86, 'Gstarsoft', 'DWG FastView', 'gcStart.exe'),
    path.join(progFilesX86, 'Gstarsoft', 'DWG FastView', 'GcLauncher.exe'),
    path.join(progFilesX86, 'Gstarsoft', 'DWG FastView', 'dwgfastview.exe')
  ].filter(p => fs.existsSync(p));

  // 2. Autodesk DWG TrueView candidates
  const trueviewYears = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'];
  const trueviewCandidates: string[] = [];
  for (const y of trueviewYears) {
    trueviewCandidates.push(path.join(progFiles, 'Autodesk', `DWG TrueView ${y} - English`, 'dwgviewr.exe'));
    trueviewCandidates.push(path.join(progFiles, 'Autodesk', `DWG TrueView ${y} - Korean`, 'dwgviewr.exe'));
    trueviewCandidates.push(path.join(progFiles, 'Autodesk', `DWG TrueView ${y}`, 'dwgviewr.exe'));
  }
  const detectedTrueview = trueviewCandidates.filter(p => fs.existsSync(p));

  // 3. ZWCAD Viewer candidates
  const zwviewCandidates = [
    path.join(progFiles, 'ZWSOFT', 'ZWCAD Viewer', 'zwview.exe'),
    path.join(progFilesX86, 'ZWSOFT', 'ZWCAD Viewer', 'zwview.exe'),
    path.join(progFiles, 'ZWSOFT', 'ZWCAD Viewer 2025', 'zwview.exe'),
    path.join(progFiles, 'ZWSOFT', 'ZWCAD Viewer 2024', 'zwview.exe')
  ].filter(p => fs.existsSync(p));

  // 4. Dassault eDrawings Viewer candidates
  const edrawingsCandidates = [
    path.join(progFiles, 'Common Files', 'eDrawings2025', 'eDrawings.exe'),
    path.join(progFiles, 'Common Files', 'eDrawings2024', 'eDrawings.exe'),
    path.join(progFiles, 'SolidWorks Corp', 'eDrawings', 'eDrawings.exe')
  ].filter(p => fs.existsSync(p));

  // 5. AutoCAD commercial versions
  const autocadCandidates = [
    path.join(progFiles, 'Autodesk', 'AutoCAD 2025', 'acad.exe'),
    path.join(progFiles, 'Autodesk', 'AutoCAD 2024', 'acad.exe'),
    path.join(progFiles, 'Autodesk', 'AutoCAD 2023', 'acad.exe'),
    path.join(progFiles, 'Autodesk', 'AutoCAD 2022', 'acad.exe'),
    ...detectedTrueview
  ].filter(p => fs.existsSync(p));

  const freeViewerPresets = [
    {
      id: 'fastview',
      name: 'Gstarsoft DWG FastView',
      vendor: 'Gstarsoft',
      defaultPath: 'C:\\Gstarsoft\\DWGFastView\\gcStart.exe',
      detectedPath: fastviewCandidates[0] || null,
      isInstalled: fastviewCandidates.length > 0
    },
    {
      id: 'trueview',
      name: 'Autodesk DWG TrueView',
      vendor: 'Autodesk',
      defaultPath: path.join(progFiles, 'Autodesk', 'DWG TrueView 2025 - English', 'dwgviewr.exe'),
      detectedPath: detectedTrueview[0] || null,
      isInstalled: detectedTrueview.length > 0
    },
    {
      id: 'zwcad',
      name: 'ZWCAD Viewer',
      vendor: 'ZWSOFT',
      defaultPath: path.join(progFiles, 'ZWSOFT', 'ZWCAD Viewer', 'zwview.exe'),
      detectedPath: zwviewCandidates[0] || null,
      isInstalled: zwviewCandidates.length > 0
    },
    {
      id: 'edrawings',
      name: 'Dassault eDrawings Viewer',
      vendor: 'Dassault Systèmes',
      defaultPath: path.join(progFiles, 'Common Files', 'eDrawings2025', 'eDrawings.exe'),
      detectedPath: edrawingsCandidates[0] || null,
      isInstalled: edrawingsCandidates.length > 0
    }
  ];

  return { fastviewCandidates, autocadCandidates, freeViewerPresets };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { fastviewCandidates, autocadCandidates, freeViewerPresets } = detectCandidatePaths();

  const fastviewRow = db.prepare(`SELECT value FROM cad_app_settings WHERE key = 'fastview_path'`).get() as any;
  const autocadRow = db.prepare(`SELECT value FROM cad_app_settings WHERE key = 'autocad_path'`).get() as any;

  // Only use explicitly configured paths from the database.
  // Do NOT fall back to detected candidates as configured paths, so that first-time users are prompted to configure.
  const rawFastview = fastviewRow?.value?.trim() || '';
  const rawAutocad = autocadRow?.value?.trim() || '';

  const resolvedFastview = rawFastview ? resolveExecutable(rawFastview) : null;
  const resolvedAutocad = rawAutocad ? resolveExecutable(rawAutocad) : null;

  return NextResponse.json({
    fastviewPath: rawFastview,
    autocadPath: rawAutocad,
    isFreeViewerConfigured: Boolean(rawFastview && resolvedFastview && fs.existsSync(resolvedFastview.exePath)),
    resolvedFastviewExe: resolvedFastview?.exePath || null,
    resolvedAutocadExe: resolvedAutocad?.exePath || null,
    fastviewExists: !!(resolvedFastview && fs.existsSync(resolvedFastview.exePath)),
    autocadExists: !!(resolvedAutocad && fs.existsSync(resolvedAutocad.exePath)),
    fastviewCandidates,
    autocadCandidates,
    freeViewerPresets
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
        error: `지정한 경로(${rawPath})에서 실행 파일(.exe)을 찾을 수 없습니다. 'C:\\Gstarsoft\\DWGFastView\\gcStart.exe'를 지정해 주세요.`
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
  const { fastviewPath, autocadPath } = body;

  if (fastviewPath !== undefined) {
    if (fastviewPath && fastviewPath.trim()) {
      db.prepare(`
        INSERT INTO cad_app_settings (key, value, updated_at)
        VALUES ('fastview_path', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(fastviewPath.trim(), now);
    } else {
      db.prepare(`DELETE FROM cad_app_settings WHERE key = 'fastview_path'`).run();
    }
  }

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
    message: 'CAD 실행 프로그램 설정이 성공적으로 저장되었습니다.'
  });
}
