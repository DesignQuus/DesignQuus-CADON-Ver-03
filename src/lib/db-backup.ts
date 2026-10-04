import fs from 'fs';
import path from 'path';
import { executeSQL, getTableSchema, listTables } from '../../egdesk-helpers';

/**
 * EGDesk My DB 안전 백업/전량 조회 유틸리티
 *
 * ⚠️ 배경: EGDesk `user_data_query`(queryTable)는 limit 미지정 시 기본 100행만 반환합니다.
 *    스키마 재구축(삭제 → 재생성 → 복원) 시 queryTable로 읽으면 100행 초과분이 영구 유실됩니다.
 *    반드시 이 모듈의 `readAllRows()`로 페이지 단위 전량 조회 + 건수 검증을 거쳐야 합니다.
 */

const PAGE_SIZE = 1000;

function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`허용되지 않는 테이블명: ${name}`);
  }
  return `"${name}"`;
}

/** 테이블 전체 행 수 (COUNT(*)) */
export async function countRows(tableName: string): Promise<number> {
  const res = await executeSQL(`SELECT COUNT(*) AS cnt FROM ${quoteIdent(tableName)}`);
  return Number(res?.rows?.[0]?.cnt ?? 0);
}

/**
 * 테이블의 모든 행을 rowid 순으로 페이지 조회하여 반환합니다.
 * 조회 건수가 COUNT(*)와 다르면 예외를 던집니다 (부분 백업으로 인한 유실 원천 차단).
 */
export async function readAllRows(tableName: string, pageSize: number = PAGE_SIZE): Promise<any[]> {
  const expected = await countRows(tableName);
  const rows: any[] = [];
  for (let offset = 0; offset < expected + pageSize; offset += pageSize) {
    const res = await executeSQL(
      `SELECT * FROM ${quoteIdent(tableName)} ORDER BY rowid LIMIT ${pageSize} OFFSET ${offset}`
    );
    const page: any[] = res?.rows || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  if (rows.length !== expected) {
    throw new Error(
      `[readAllRows] ${tableName}: 조회 건수(${rows.length})가 COUNT(*)(${expected})와 일치하지 않습니다.`
    );
  }
  return rows;
}

export function getBackupRoot(): string {
  return path.join(process.cwd(), '.backup');
}

export function makeTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 단일 테이블의 스키마 + 전체 행을 JSON 파일로 저장하고 파일 경로를 반환 */
export async function backupTableToFile(
  tableName: string,
  dir: string,
  pageSize: number = PAGE_SIZE
): Promise<{ file: string; rowCount: number; rows: any[] }> {
  fs.mkdirSync(dir, { recursive: true });
  const rows = await readAllRows(tableName, pageSize);
  let schema: any = null;
  try {
    schema = (await getTableSchema(tableName))?.schema ?? null;
  } catch {}
  const file = path.join(dir, `${tableName}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ tableName, backedUpAt: new Date().toISOString(), rowCount: rows.length, schema, rows }, null, 0),
    'utf8'
  );
  return { file, rowCount: rows.length, rows };
}

/** 모든 사용자 테이블을 JSON으로 백업 (매니페스트 포함). onlyTables 지정 시 해당 테이블만. */
export async function backupAllTables(
  dir: string,
  onlyTables?: string[]
): Promise<{ dir: string; tables: Array<{ tableName: string; rowCount: number; error?: string }> }> {
  fs.mkdirSync(dir, { recursive: true });
  const listRes = await listTables();
  let names: string[] = (listRes?.tables || []).map((t: any) => t.tableName);
  if (onlyTables && onlyTables.length > 0) names = names.filter(n => onlyTables.includes(n));
  const tables: Array<{ tableName: string; rowCount: number; error?: string }> = [];
  for (const name of names) {
    let lastErr = '';
    let done = false;
    // 대용량 행(cad_objects 등)은 응답이 커서 fetch가 끊길 수 있으므로 페이지를 줄여 재시도
    for (const pageSize of [PAGE_SIZE, 200, 50]) {
      try {
        const { rowCount } = await backupTableToFile(name, dir, pageSize);
        tables.push({ tableName: name, rowCount });
        done = true;
        break;
      } catch (e: any) {
        lastErr = e.message;
      }
    }
    if (!done) tables.push({ tableName: name, rowCount: -1, error: lastErr });
  }
  fs.writeFileSync(
    path.join(dir, '_manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), projectId: process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID, tables }, null, 2),
    'utf8'
  );
  return { dir, tables };
}
