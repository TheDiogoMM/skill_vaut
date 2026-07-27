import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createDb } from './connection.js';

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
});
