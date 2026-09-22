import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath } from '@/lib/storage';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { resolveExecutable } from '@/lib/cad-resolver';

// Smart Locator: Find the user's original desktop file
function findOriginalFileOnUserPc(fileName: string): string | null {
  if (!fileName) return null;
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\SteveLee';
  const candidates = [
    path.join(userProfile, 'OneDrive', 'Desktop', 'DWG 모음', fileName),
    path.join(userProfile, 'Desktop', 'DWG 모음', fileName),
    path.join(userProfile, 'OneDrive', '바탕 화면', 'DWG 모음', fileName),
    path.join(userProfile, '바탕 화면', 'DWG 모음', fileName),
    path.join(userProfile, 'OneDrive', 'Desktop', fileName),
    path.join(userProfile, 'Desktop', fileName),
    path.join(userProfile, 'OneDrive', '바탕 화면', fileName),
    path.join(userProfile, '바탕 화면', fileName),
    path.join(userProfile, 'Downloads', fileName)
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  let targetApp = 'folder';
  try {
    const body = await req.json();
    if (body?.app) targetApp = body.app;
  } catch {}

  // 1. Find file record in database
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
    return NextResponse.json({ error: '열 수 있는 CAD 파일이 존재하지 않습니다.' }, { status: 404 });
  }

  // 2. Check if original file is located on the user's Desktop/OneDrive folder
  const desktopOriginalPath = findOriginalFileOnUserPc(file.original_file_name);
  const internalStoragePath = resolveStoragePath(file.storage_path);
  const targetFilePath = desktopOriginalPath || (fs.existsSync(internalStoragePath) ? internalStoragePath : null);

  if (!targetFilePath || !fs.existsSync(targetFilePath)) {
    return NextResponse.json({ error: `파일을 찾을 수 없습니다: ${file.original_file_name}` }, { status: 404 });
  }

  // 3. Action: Open containing folder in Windows Explorer (Desktop / Storage)
  if (targetApp === 'folder') {
    const escapedFile = targetFilePath.replace(/'/g, "''");
    // Directly select the file in Windows Explorer
    const cmd = `cmd.exe /c start "" explorer.exe /select,"${targetFilePath}"`;
    exec(cmd, (err) => {
      if (err) {
        exec(`powershell.exe -NoProfile -Command "Start-Process explorer.exe -ArgumentList '/select,\\\"${escapedFile}\\\"'"`);
      }
    });

    const locationName = desktopOriginalPath ? '바탕화면 원본 폴더' : '도면 저장소 폴더';

    return NextResponse.json({
      success: true,
      message: `${locationName}를 열었습니다: ${file.original_file_name}`,
      fileName: file.original_file_name,
      filePath: targetFilePath,
      app: 'folder'
    });
  }

  // 4. Action: Open with configured CAD application
  try {
    const autocadRow = db.prepare(`SELECT value FROM cad_app_settings WHERE key = 'autocad_path'`).get() as any;
    let configuredPath = autocadRow?.value?.trim() || '';

    // Auto-detect AutoCAD if not yet explicitly configured
    if (!configuredPath) {
      const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const autodeskDir = path.join(progFiles, 'Autodesk');
      if (fs.existsSync(autodeskDir)) {
        try {
          const subdirs = fs.readdirSync(autodeskDir);
          const acadDirs = subdirs
            .filter(d => /^AutoCAD\s*\d{4}/i.test(d))
            .sort((a, b) => b.localeCompare(a));
          for (const ad of acadDirs) {
            const exe = path.join(autodeskDir, ad, 'acad.exe');
            if (fs.existsSync(exe)) {
              configuredPath = exe;
              break;
            }
          }
        } catch {}
      }
    }

    const appName = 'AutoCAD';

    if (!configuredPath) {
      return NextResponse.json({
        success: false,
        notConfigured: true,
        error: 'PC에 AutoCAD가 설정되어 있지 않습니다. 상단 [CAD 설정]에서 AutoCAD 실행 파일 경로를 지정해 주세요.'
      }, { status: 400 });
    }

    const resolved = configuredPath ? resolveExecutable(configuredPath) : null;

    if (resolved && fs.existsSync(resolved.exePath)) {
      const escapedExe = resolved.exePath.replace(/'/g, "''");
      const escapedDir = resolved.workingDir.replace(/'/g, "''");
      const escapedFile = targetFilePath.replace(/'/g, "''");

      const psCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedDir}' -ArgumentList '\\"${escapedFile}\\"'"`;
      
      exec(psCmd, (err) => {
        if (err) console.error('Error starting CAD process:', err);
      });

      const exeName = path.basename(resolved.exePath).toLowerCase();
      const friendlyName = exeName.includes('gc') || exeName.includes('fastview') ? 'DWG FastView' :
                           exeName.includes('trueview') || exeName.includes('dwgviewr') ? 'DWG TrueView' :
                           exeName.includes('zw') ? 'ZWCAD Viewer' :
                           appName;

      return NextResponse.json({
        success: true,
        message: `${friendlyName}(으)로 도면을 열었습니다: ${file.original_file_name}`,
        fileName: file.original_file_name,
        filePath: targetFilePath,
        app: targetApp,
        exePath: resolved.exePath
      });
    } else {
      if (targetApp === 'fastview' || targetApp === 'free_viewer') {
        return NextResponse.json({
          success: false,
          notConfigured: true,
          error: 'CAD 설정 창에서 무료 뷰어를 설정 후 사용 할 수 있습니다.'
        }, { status: 400 });
      }

      if (targetApp === 'autocad') {
        return NextResponse.json({
          success: false,
          notConfigured: true,
          error: '지정된 AutoCAD 실행 파일을 찾을 수 없습니다. CAD 설정 창에서 설치 경로를 확인해 주세요.'
        }, { status: 400 });
      }

      // Fallback for general case: Windows Explorer select
      exec(`cmd.exe /c start "" explorer.exe /select,"${targetFilePath}"`);

      return NextResponse.json({
        success: true,
        message: `바탕화면 원본 도면 위치를 열었습니다: ${file.original_file_name}`,
        fileName: file.original_file_name,
        filePath: targetFilePath,
        app: 'folder'
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: `도면 열기 실패: ${err.message}` }, { status: 500 });
  }
}
