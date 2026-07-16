import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}
