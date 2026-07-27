import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((col) => col.name === column);
}

function itemsTypeCheckAllowsPlugin(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
    .get() as { sql: string } | undefined;
  return !!row && row.sql.includes("'plugin'");
}

function migrateItemsTypeCheck(db: Database.Database): void {
  if (itemsTypeCheckAllowsPlugin(db)) return;

  db.exec(`
    ALTER TABLE items RENAME TO items_old_type_check;
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp','plugin')),
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
      source_value TEXT NOT NULL,
      local_path TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      summary TEXT,
      utility TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
      global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
      download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO items (
      id, type, name, source_type, source_value, local_path, category_id,
      summary, utility, tags, enrichment_source, global_install_status, download_status,
      created_at, updated_at
    )
    SELECT
      id, type, name, source_type, source_value, local_path, category_id,
      summary, utility, tags, enrichment_source, global_install_status, download_status,
      created_at, updated_at
    FROM items_old_type_check;
    DROP TABLE items_old_type_check;
  `);
}

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  if (!hasColumn(db, 'items', 'download_status')) {
    db.exec(
      "ALTER TABLE items ADD COLUMN download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded'))"
    );
  }

  migrateItemsTypeCheck(db);

  return db;
}
