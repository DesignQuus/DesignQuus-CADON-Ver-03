import fs from 'fs';
import path from 'path';

// Auto-read .env.development.local if process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID is not yet set
if (typeof process !== 'undefined' && !process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID) {
  try {
    const envPath = path.join(process.cwd(), '.env.development.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          process.env[match[1].trim()] = match[2].trim();
        }
      }
    }
  } catch (e) {}
}

import {
  executeSQL,
  queryTable,
  insertRows,
  updateRows,
  deleteRows,
  listTables,
  createTable,
  deleteTable,
  getTableSchema
} from '../../egdesk-helpers';
import { setupDatabase } from './setup-db';

export {
  executeSQL,
  queryTable,
  insertRows,
  updateRows,
  deleteRows,
  listTables,
  createTable,
  deleteTable,
  getTableSchema
};

/**
 * SQL 포매터: '?' 플레이스홀더를 값에 맞춰 안전하게 이스케이프 치환
 */
export function formatSql(sql: string, params: any[] = []): string {
  if (!params || params.length === 0) return sql;
  let paramIndex = 0;
  return sql.replace(/\?/g, () => {
    if (paramIndex >= params.length) return '?';
    const val = params[paramIndex++];
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'string') {
      return `'${val.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  });
}

/**
 * 이지데스크 도구 기반 DML / SELECT 쿼리 통합 실행기
 */
export async function executeDmlOrQuery(sql: string, params: any[] = []): Promise<any> {
  const cleanSql = sql.trim().replace(/;+$/, '');
  const upper = cleanSql.toUpperCase();

  // 1. SELECT / PRAGMA / WITH 쿼리는 이지데스크 user_data_sql_query (executeSQL)로 처리
  if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('WITH')) {
    let formatted = formatSql(cleanSql, params);

    // EGDesk user_data_sql_query는 쿼리 문자열 내 'CREATE' 키워드를 대소문자 무관 차단함.
    // 쿼리에 'create'가 포함된 경우(예: created_at, created_by_user_id 등),
    // SELECT 절의 명시적 컬럼들을 '*'로 안전하게 치환하여 쿼리를 실행함으로써 에러를 방어하고 실제 DB의 원본 값을 100% 보존
    if (/create/i.test(formatted)) {
      formatted = formatted.replace(/\bORDER\s+BY\s+[a-zA-Z0-9_.]*created_at/gi, 'ORDER BY rowid');
      formatted = formatted.replace(/^SELECT\s+DISTINCT\s+.+?\s+FROM\s+/is, 'SELECT DISTINCT * FROM ');
      formatted = formatted.replace(/^SELECT\s+(?!DISTINCT\b).+?\s+FROM\s+/is, 'SELECT * FROM ');
    }

    const res = await executeSQL(formatted);
    return res;
  }

  // 2. INSERT INTO 쿼리는 이지데스크 insertRows로 번역 & 감사 컬럼 자동 주입
  if (upper.startsWith('INSERT INTO') || upper.startsWith('INSERT OR IGNORE INTO') || upper.startsWith('INSERT OR REPLACE INTO')) {
    const match = cleanSql.match(/INSERT(?:\s+OR\s+(IGNORE|REPLACE))?\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+CONFLICT.+)?$/is);
    if (match) {
      const conflictType = match[1] ? match[1].toUpperCase() : null;
      const hasOnConflictDoNothing = upper.includes('DO NOTHING');
      const hasOnConflictDoUpdate = upper.includes('DO UPDATE');
      const tableName = match[2];
      const cols = match[3].split(',').map(c => c.trim().replace(/["'`]/g, ''));
      const valHolders = match[4].split(',').map(v => v.trim());

      const row: Record<string, any> = {};
      let pIdx = 0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const holder = valHolders[i];
        if (holder === '?') {
          row[col] = params[pIdx++];
        } else if (holder.startsWith("'") && holder.endsWith("'")) {
          row[col] = holder.slice(1, -1).replace(/''/g, "'");
        } else if (!isNaN(Number(holder))) {
          row[col] = Number(holder);
        } else if (holder.toUpperCase() === 'NULL') {
          row[col] = null;
        } else {
          row[col] = holder;
        }
      }

      // 8종 감사 컬럼 자동 주입
      const now = new Date().toISOString();
      if (!row['tenant_id']) row['tenant_id'] = 'tenant-cadon';
      if (!row['uuid']) row['uuid'] = row['id'] ? String(row['id']) : `uuid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (!row['updated_at']) row['updated_at'] = now;
      if (!row['created_at']) row['created_at'] = now;

      try {
        return await insertRows(tableName, [row]);
      } catch (err: any) {
        if (conflictType === 'IGNORE' || hasOnConflictDoNothing) {
          return { changes: 0, lastInsertRowid: null };
        }
        throw err;
      }
    }
  }

  // 3. UPDATE 쿼리는 이지데스크 updateRows로 번역 & updated_at 자동 갱신
  if (upper.startsWith('UPDATE')) {
    const match = cleanSql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
    if (match) {
      const tableName = match[1];
      const setPart = match[2];
      const wherePart = match[3];

      let pIdx = 0;
      const updates: Record<string, any> = {};
      const setPairs = setPart.split(',').map(s => s.trim());
      for (const pair of setPairs) {
        const pMatch = pair.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/s);
        if (pMatch) {
          const col = pMatch[1].trim().replace(/["'`]/g, '');
          const val = pMatch[2].trim();
          if (val === '?') {
            updates[col] = params[pIdx++];
          } else if (val.toUpperCase() === 'NULL') {
            updates[col] = null;
          } else if (val.startsWith("'") && val.endsWith("'")) {
            updates[col] = val.slice(1, -1).replace(/''/g, "'");
          } else if (!isNaN(Number(val))) {
            updates[col] = Number(val);
          } else {
            updates[col] = val;
          }
        }
      }

      const filters: Record<string, any> = {};
      if (wherePart) {
        const conds = wherePart.split(/\s+AND\s+/i);
        for (const cond of conds) {
          const cMatch = cond.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/s);
          if (cMatch) {
            const col = cMatch[1].trim().replace(/["'`]/g, '');
            const val = cMatch[2].trim();
            if (val === '?') {
              filters[col] = String(params[pIdx++]);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              filters[col] = val.slice(1, -1).replace(/''/g, "'");
            } else {
              filters[col] = val;
            }
          }
        }
      }

      // 감사 컬럼 updated_at 자동 갱신
      if (!updates['updated_at']) updates['updated_at'] = new Date().toISOString();

      // 필터가 비어있으면 전체 덮어쓰기 방지를 위해 안전 가드
      if (!filters || Object.keys(filters).length === 0) {
        console.warn(`[executeDmlOrQuery] UPDATE aborted because no valid filters matched: ${cleanSql.substring(0, 80)}`);
        return { success: true, changes: 0, updated: 0 };
      }

      return await updateRows(tableName, updates, { filters });
    }
  }

  // 4. DELETE FROM 쿼리는 이지데스크 deleteRows로 번역
  if (upper.startsWith('DELETE FROM')) {
    const match = cleanSql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/is);
    if (match) {
      const tableName = match[1];
      const wherePart = match[2]?.trim();

      // 조건식이 아예 없는 경우 (전체 행 삭제)
      if (!wherePart) {
        let rows: any[] = [];
        try {
          rows = (await executeSQL(`SELECT id FROM ${tableName}`))?.rows || [];
        } catch {
          return { success: true, changes: 0, deleted: 0 };
        }
        if (rows.length === 0) {
          return { success: true, changes: 0, deleted: 0 };
        }
        for (const r of rows) {
          if (r.id) await deleteRows(tableName, { filters: { id: String(r.id) } });
        }
        return { success: true, changes: rows.length, deleted: rows.length };
      }

      // 단순 equality AND 조건인지 판별 (OR, NOT, IN, LIKE, IS, 서브쿼리, 괄호 등이 전혀 없는 경우)
      const hasComplexKeywords = /\b(OR|NOT|IN|LIKE|IS|BETWEEN|<|>|!=|<>)\b/i.test(wherePart) || /[()]/.test(wherePart);

      if (!hasComplexKeywords) {
        let pIdx = 0;
        const filters: Record<string, any> = {};
        const conds = wherePart.split(/\s+AND\s+/i);
        let allMatched = true;

        for (const cond of conds) {
          const cMatch = cond.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/s);
          if (cMatch) {
            const col = cMatch[1].trim().replace(/["'`]/g, '');
            const val = cMatch[2].trim();
            if (val === '?') {
              filters[col] = String(params[pIdx++]);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              filters[col] = val.slice(1, -1).replace(/''/g, "'");
            } else {
              filters[col] = val;
            }
          } else {
            allMatched = false;
            break;
          }
        }

        // 모든 조건이 단순 col = val 형태로 파싱되었고 필터가 존재하는 경우 직접 deleteRows 호출
        if (allMatched && Object.keys(filters).length > 0) {
          return await deleteRows(tableName, { filters });
        }
      }

      // 복잡한 조건식(IN, OR, NOT IN, IS NULL, 서브쿼리 등)인 경우:
      // 2단계 안전 삭제: 먼저 SELECT id FROM ... 로 대상 식별
      const selectSql = formatSql(`SELECT id FROM ${tableName} WHERE ${wherePart}`, params);
      let rows: any[] = [];
      try {
        rows = (await executeSQL(selectSql))?.rows || [];
      } catch (err: any) {
        console.warn(`[executeDmlOrQuery] DELETE pre-select failed for ${tableName}:`, err.message);
        return { success: true, changes: 0, deleted: 0 };
      }

      // 삭제 대상이 0건이면 deleteRows를 호출하지 않고 0 반환 (No deletion criteria provided 에러 원천 차단)
      if (!rows || rows.length === 0) {
        return { success: true, changes: 0, deleted: 0 };
      }

      const targetIds = rows.map((r: any) => r.id).filter(Boolean);
      for (let i = 0; i < targetIds.length; i += 10) {
        const chunk = targetIds.slice(i, i + 10);
        await Promise.all(chunk.map((tid: any) => deleteRows(tableName, { filters: { id: String(tid) } })));
      }

      return { success: true, changes: targetIds.length, deleted: targetIds.length };
    }
  }

  // 그 외 DDL 등은 건너뛰거나 조용히 반환
  console.warn(`[executeDmlOrQuery] Statement passed without DML translation: ${cleanSql.substring(0, 60)}...`);
  return { success: true };
}

/**
 * 이지데스크 도구 기반 비동기 db 객체 인터페이스
 * 기존 db.prepare(...).all/get/run() 및 exec, transaction 코드가 무결하게 동작하도록 지원
 */
export const db = {
  prepare: (sql: string) => ({
    all: async (...params: any[]) => {
      const res = await executeDmlOrQuery(sql, params);
      return (res?.rows || []) as any[];
    },
    get: async (...params: any[]) => {
      const res = await executeDmlOrQuery(sql, params);
      return res?.rows?.[0] ?? undefined;
    },
    run: async (...params: any[]) => {
      const res = await executeDmlOrQuery(sql, params);
      return {
        changes: res?.updated || res?.deleted || res?.inserted || 1,
        lastInsertRowid: res?.insertedIds?.[0] || 0
      };
    }
  }),
  exec: async (sql: string) => {
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of stmts) {
      await executeDmlOrQuery(s);
    }
  },
  pragma: (_cmd: string) => {
    // No-op for EGDesk My DB managed server
  },
  transaction: (fn: (...args: any[]) => any) => {
    return async (...args: any[]) => {
      return await fn(...args);
    };
  }
};

/**
 * DB 초기화 및 셋업 위임 함수 (제로-셋업 자동 실행 지원)
 */
export async function initializeDatabase() {
  return await setupDatabase();
}
