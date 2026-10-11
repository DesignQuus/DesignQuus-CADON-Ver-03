import { getLocalSqlite } from '../src/lib/db';

async function migrate() {
  const db = getLocalSqlite();
  if (!db) {
    console.error('Local SQLite instance not found');
    process.exit(1);
  }

  console.log('1. Creating manual_price_history table if not exists...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_price_history (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL,
      revision_seq INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      previous_price REAL,
      price_diff REAL,
      change_type TEXT NOT NULL,
      quotation_case_id TEXT,
      company_id TEXT,
      company_name TEXT,
      remark TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mph_pool_id ON manual_price_history(pool_id);
    CREATE INDEX IF NOT EXISTS idx_mph_created_at ON manual_price_history(created_at);
  `);

  console.log('2. Fetching existing manual_price_pool rows...');
  const poolRows = db.prepare(`
    SELECT mpp.*, c.company_name 
    FROM manual_price_pool mpp
    LEFT JOIN companies c ON mpp.company_id = c.id
  `).all() as any[];

  console.log(`Found ${poolRows.length} items in manual_price_pool.`);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO manual_price_history (
      id, pool_id, revision_seq, unit_price, previous_price, price_diff,
      change_type, quotation_case_id, company_id, company_name, remark,
      created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const item of poolRows) {
    const existingHist = db.prepare(`SELECT count(*) as cnt FROM manual_price_history WHERE pool_id = ?`).get(item.id) as { cnt: number };
    if (existingHist.cnt === 0) {
      insertStmt.run(
        `mph_init_${item.id}`,
        item.id,
        1,
        item.unit_price || 0,
        item.unit_price || 0,
        0,
        'INITIAL',
        item.quotation_case_id || null,
        item.company_id || null,
        item.company_name || '사내 표준/기본',
        item.remark || '최초 실무 학습 등록',
        item.created_by_user_id || 'usr_admin',
        item.created_at || item.last_used_at || new Date().toISOString()
      );
      count++;
    }
  }

  console.log(`Successfully migrated ${count} initial history records.`);
}

migrate().catch(console.error);
