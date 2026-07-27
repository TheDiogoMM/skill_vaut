import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createDb, migrateItemsTypeCheck } from './connection.js';

describe('createDb', () => {
  it('creates categories, items, and consultas tables', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('categories');
    expect(tables).toContain('items');
    expect(tables).toContain('consultas');
  });

  it('adds a download_status column to items (for pre-existing databases without it)', () => {
    const db = createDb(':memory:');
    const columns = db
      .prepare('PRAGMA table_info(items)')
      .all()
      .map((row) => (row as { name: string }).name);

    expect(columns).toContain('download_status');
  });

  it('migrates a pre-existing items table whose type CHECK does not allow plugin yet', () => {
    const dbPath = path.join(os.tmpdir(), `skillvault-migration-plugin-${Date.now()}.db`);
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
        name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
        source_value TEXT NOT NULL,
        local_path TEXT NOT NULL,
        category_id INTEGER,
        summary TEXT,
        utility TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
        global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
        download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
         VALUES ('repo', 'Old Repo', 'url', 'https://example.com/old.git', '/vault/old-repo', '[]', '2026-01-01', '2026-01-01')`
      )
      .run();
    legacy.close();

    const migrated = createDb(dbPath);

    expect(() =>
      migrated
        .prepare(
          `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
           VALUES ('plugin', 'New Plugin', 'url', 'https://example.com/plugin.git', '/vault/new-plugin', '[]', '2026-01-01', '2026-01-01')`
        )
        .run()
    ).not.toThrow();

    const rows = migrated.prepare('SELECT type, name FROM items ORDER BY id').all();
    expect(rows).toEqual([
      { type: 'repo', name: 'Old Repo' },
      { type: 'plugin', name: 'New Plugin' },
    ]);

    migrated.close();
    fs.rmSync(dbPath, { force: true });
  });

  it('is a no-op on a second createDb() call against the same already-migrated file', () => {
    const dbPath = path.join(os.tmpdir(), `skillvault-migration-reentrancy-${Date.now()}.db`);
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
        name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
        source_value TEXT NOT NULL,
        local_path TEXT NOT NULL,
        category_id INTEGER,
        summary TEXT,
        utility TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
        global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
        download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
         VALUES ('repo', 'Old Repo', 'url', 'https://example.com/old.git', '/vault/old-repo', '[]', '2026-01-01', '2026-01-01')`
      )
      .run();
    legacy.close();

    // First createDb() call performs the migration.
    const firstOpen = createDb(dbPath);
    const rowsAfterFirst = firstOpen.prepare('SELECT type, name FROM items ORDER BY id').all();
    firstOpen.close();

    // Second createDb() call against the same file must be a clean no-op: it should not
    // re-run the migration (which would fail since items_old_type_check no longer exists)
    // or error, and the data must be exactly what it was after the first migration.
    const secondOpen = createDb(dbPath);
    const rowsAfterSecond = secondOpen.prepare('SELECT type, name FROM items ORDER BY id').all();

    expect(rowsAfterSecond).toEqual(rowsAfterFirst);
    expect(rowsAfterSecond).toEqual([{ type: 'repo', name: 'Old Repo' }]);

    const tables = secondOpen
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain('items_old_type_check');

    // The new-type insert should still work (CHECK constraint allows 'plugin').
    expect(() =>
      secondOpen
        .prepare(
          `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
           VALUES ('plugin', 'New Plugin', 'url', 'https://example.com/plugin.git', '/vault/new-plugin', '[]', '2026-01-01', '2026-01-01')`
        )
        .run()
    ).not.toThrow();

    secondOpen.close();
    fs.rmSync(dbPath, { force: true });
  });

  it('leaves the original items table fully intact if a mid-migration statement fails (atomicity)', () => {
    // Exercises the REAL migrateItemsTypeCheck (not a re-implementation). We force a genuine
    // failure inside it by handing it a legacy `items` table that predates the
    // `global_install_status` column — a plausible even-older pre-existing database. The
    // migration's own INSERT INTO items (...) SELECT (...) FROM items_old_type_check
    // references global_install_status, which doesn't exist on items_old_type_check, so the
    // real SELECT genuinely throws partway through the real transaction: after
    // `CREATE TABLE items` has already run but before COMMIT. This proves the durability
    // guarantee the BEGIN/COMMIT fix relies on: closing and reopening the connection
    // (standing in for a crash + restart) rolls the whole sequence back and the original
    // items table survives, under its original name, with its original data, in its
    // original pre-migration shape (CHECK constraint still excluding 'plugin').
    const dbPath = path.join(os.tmpdir(), `skillvault-migration-atomicity-${Date.now()}.db`);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
        name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
        source_value TEXT NOT NULL,
        local_path TEXT NOT NULL,
        category_id INTEGER,
        summary TEXT,
        utility TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
        download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
       VALUES ('repo', 'Original Repo', 'url', 'https://example.com/old.git', '/vault/old-repo', '[]', '2026-01-01', '2026-01-01')`
    ).run();

    const originalTableSql = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
        .get() as { sql: string }
    ).sql;

    // The real migration function, called directly — no hand-copied SQL.
    expect(() => migrateItemsTypeCheck(db)).toThrow();

    // Simulate a crash: close without an explicit ROLLBACK, then reopen the same file.
    db.close();

    const reopened = new Database(dbPath);
    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain('items');
    expect(tables).not.toContain('items_old_type_check');

    // The surviving table must be the ORIGINAL pre-migration table, not a half-applied new one.
    const reopenedTableSql = (
      reopened
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
        .get() as { sql: string }
    ).sql;
    expect(reopenedTableSql).toEqual(originalTableSql);
    expect(reopenedTableSql).not.toContain("'plugin'");

    const rows = reopened.prepare('SELECT type, name FROM items').all();
    expect(rows).toEqual([{ type: 'repo', name: 'Original Repo' }]);

    reopened.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });
});
