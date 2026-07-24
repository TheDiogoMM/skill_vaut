import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((col) => col.name === column);
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

  return db;
}
