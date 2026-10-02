'use client';

/**
 * ⚡ CADON Ultra-Fast CAD Cache Architecture (Autodesk SVF2 & OPFS Native)
 * - Level 1: In-Memory RAM Map (0ms Instant Hit)
 * - Level 2: OPFS (Origin Private File System, Browser Native SSD Cache)
 * - Level 3: IndexedDB Binary Blob Store (Fallback)
 */

const memoryBinaryCache = new Map<string, ArrayBuffer>();
const memoryJsonCache = new Map<string, any>();

const DB_NAME = 'cadon_cad_store';
const DB_VERSION = 1;
const STORE_NAME = 'cad_blobs';

let idbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

// 💡 1. OPFS (Origin Private File System) Directory Handle
let opfsDirPromise: Promise<FileSystemDirectoryHandle | null> | null = null;

async function getOpfsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === 'undefined') return null;
  if (opfsDirPromise) return opfsDirPromise;

  opfsDirPromise = (async () => {
    try {
      if (navigator.storage && typeof navigator.storage.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle('cadon_cad_cache', { create: true });
      }
    } catch (e) {
      console.warn('[cad-cache] OPFS not available, falling back to IndexedDB:', e);
    }
    return null;
  })();

  return opfsDirPromise;
}

/**
 * CAD 바이너리(ArrayBuffer) 캐시 조회 (RAM -> OPFS -> IndexedDB)
 */
export async function getCachedCadBinary(key: string): Promise<ArrayBuffer | null> {
  if (!key) return null;

  // 1. RAM Cache Hit (0ms)
  const mem = memoryBinaryCache.get(key);
  if (mem) {
    return mem.slice(0); // slice to prevent buffer detachment
  }

  // 2. OPFS Native Disk Hit
  try {
    const opfsDir = await getOpfsDirectory();
    if (opfsDir) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.bin';
      const fileHandle = await opfsDir.getFileHandle(sanitizedKey);
      const file = await fileHandle.getFile();
      if (file.size > 0) {
        const buffer = await file.arrayBuffer();
        memoryBinaryCache.set(key, buffer.slice(0));
        return buffer;
      }
    }
  } catch {
    // File not found or read error -> proceed to IndexedDB fallback
  }

  // 3. IndexedDB Fallback Hit
  try {
    const db = await getIndexedDB();
    const buffer = await new Promise<ArrayBuffer | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result instanceof ArrayBuffer) {
          resolve(req.result);
        } else if (req.result instanceof Blob) {
          req.result.arrayBuffer().then(resolve).catch(() => resolve(null));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });

    if (buffer && buffer.byteLength > 0) {
      memoryBinaryCache.set(key, buffer.slice(0));
      return buffer;
    }
  } catch {
    // IndexedDB error
  }

  return null;
}

/**
 * CAD 바이너리(ArrayBuffer) 캐시 저장 (RAM + OPFS/IndexedDB 비동기 백그라운드 영구화)
 */
export async function setCachedCadBinary(key: string, buffer: ArrayBuffer): Promise<void> {
  if (!key || !buffer || buffer.byteLength === 0) return;

  // 1. RAM Cache Save
  memoryBinaryCache.set(key, buffer.slice(0));

  // 2. OPFS Save
  try {
    const opfsDir = await getOpfsDirectory();
    if (opfsDir) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.bin';
      const fileHandle = await opfsDir.getFileHandle(sanitizedKey, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
      return;
    }
  } catch (e) {
    console.warn('[cad-cache] Failed to write binary to OPFS:', e);
  }

  // 3. IndexedDB Fallback Save
  try {
    const db = await getIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(buffer.slice(0), key);
  } catch (e) {
    console.warn('[cad-cache] Failed to write binary to IndexedDB:', e);
  }
}

/**
 * CAD 텍스트 JSON 캐시 조회
 */
export async function getCachedCadTexts(key: string): Promise<any | null> {
  if (!key) return null;
  const jsonKey = `texts_${key}`;

  const mem = memoryJsonCache.get(jsonKey);
  if (mem) return mem;

  try {
    const opfsDir = await getOpfsDirectory();
    if (opfsDir) {
      const sanitizedKey = jsonKey.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      const fileHandle = await opfsDir.getFileHandle(sanitizedKey);
      const file = await fileHandle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      memoryJsonCache.set(jsonKey, parsed);
      return parsed;
    }
  } catch {
    // Fallback
  }

  try {
    const db = await getIndexedDB();
    const data = await new Promise<any>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(jsonKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (data) {
      memoryJsonCache.set(jsonKey, data);
      return data;
    }
  } catch {
    // Fallback
  }

  return null;
}

/**
 * CAD 텍스트 JSON 캐시 저장
 */
export async function setCachedCadTexts(key: string, data: any): Promise<void> {
  if (!key || !data) return;
  const jsonKey = `texts_${key}`;
  memoryJsonCache.set(jsonKey, data);

  try {
    const opfsDir = await getOpfsDirectory();
    if (opfsDir) {
      const sanitizedKey = jsonKey.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      const fileHandle = await opfsDir.getFileHandle(sanitizedKey, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data));
      await writable.close();
      return;
    }
  } catch (e) {
    console.warn('[cad-cache] Failed to write texts to OPFS:', e);
  }

  try {
    const db = await getIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, jsonKey);
  } catch (e) {
    console.warn('[cad-cache] Failed to write texts to IndexedDB:', e);
  }
}

/**
 * 특정 키 또는 전체 캐시 무효화 (도면 재분석 또는 업데이트 시)
 */
export async function invalidateCadCache(key?: string): Promise<void> {
  if (key) {
    memoryBinaryCache.delete(key);
    memoryJsonCache.delete(`texts_${key}`);
    try {
      const opfsDir = await getOpfsDirectory();
      if (opfsDir) {
        const binKey = key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.bin';
        const txtKey = `texts_${key}`.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
        await opfsDir.removeEntry(binKey).catch(() => {});
        await opfsDir.removeEntry(txtKey).catch(() => {});
      }
    } catch {}
    try {
      const db = await getIndexedDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.objectStore(STORE_NAME).delete(`texts_${key}`);
    } catch {}
  } else {
    memoryBinaryCache.clear();
    memoryJsonCache.clear();
  }
}
