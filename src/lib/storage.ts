import path from 'path';
import fs from 'fs';
import os from 'os';

export function getEgdeskStorageDir(): string {
  if (process.env.EGDESK_STORAGE_DIR && fs.existsSync(process.env.EGDESK_STORAGE_DIR)) {
    return process.env.EGDESK_STORAGE_DIR;
  }

  // Auto-read .env.development.local if not already loaded in non-Next environments
  if (!process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID) {
    try {
      const envPath = path.join(process.cwd(), '.env.development.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/NEXT_PUBLIC_EGDESK_PROJECT_ID=([^\r\n]+)/);
        if (match && match[1]) {
          process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID = match[1].trim();
        }
      }
    } catch (e) {
      // ignore
    }
  }

  const projectId = process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID || '6db634cd-3796-4c8b-8aba-549cb79c49e9';
  const envName = process.env.NEXT_PUBLIC_EGDESK_ENV || 'development';
  const userHome = os.homedir() || process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || (userHome ? path.join(userHome, 'AppData', 'Roaming') : '');
  
  if (appData) {
    const egdeskProjectDir = path.join(appData, 'egdesk', 'user-data', envName, 'projects', projectId);
    if (fs.existsSync(egdeskProjectDir)) {
      const egdeskStorage = path.join(egdeskProjectDir, 'storage');
      if (!fs.existsSync(egdeskStorage)) {
        fs.mkdirSync(egdeskStorage, { recursive: true });
      }
      return egdeskStorage;
    }
  }

  // Fallback to local storage in workspace
  const localDir = path.join(process.cwd(), 'storage');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

export function getStorageSubdir(subdir: 'files' | 'derived' | 'exports' | 'templates' | 'temp'): string {
  const base = getEgdeskStorageDir();
  const dir = path.join(base, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveStoragePath(storedPath: string): string {
  if (!storedPath) return '';
  if (fs.existsSync(storedPath)) return storedPath;

  const fileName = path.basename(storedPath);
  const base = getEgdeskStorageDir();

  // Check subdirectories in EGDesk storage
  for (const sub of ['files', 'derived', 'exports', 'templates', 'temp'] as const) {
    const candidate = path.join(base, sub, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback check in local workspace storage
  const localCandidate = path.resolve(process.cwd(), storedPath);
  if (fs.existsSync(localCandidate)) return localCandidate;

  for (const sub of ['files', 'derived', 'exports', 'templates', 'temp'] as const) {
    const candidate = path.join(process.cwd(), 'storage', sub, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return storedPath;
}
