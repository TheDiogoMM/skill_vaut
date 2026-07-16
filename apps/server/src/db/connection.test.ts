import { describe, it, expect } from 'vitest';
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
});
