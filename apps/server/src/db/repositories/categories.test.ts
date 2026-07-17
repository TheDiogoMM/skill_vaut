import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { CategoriesRepository } from './categories.js';

describe('CategoriesRepository', () => {
  let db: Database.Database;
  let repo: CategoriesRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new CategoriesRepository(db);
  });

  it('creates and lists categories', () => {
    repo.create('dev-tools');
    repo.create('automação');
    expect(repo.list().map((c) => c.name)).toEqual(['automação', 'dev-tools']);
  });

  it('findOrCreate reuses an existing category by name', () => {
    const first = repo.findOrCreate('dev-tools');
    const second = repo.findOrCreate('dev-tools');
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('renames a category', () => {
    const category = repo.create('dev-tools');
    const renamed = repo.rename(category.id, 'ferramentas-dev');
    expect(renamed?.name).toBe('ferramentas-dev');
  });

  it('merges one category into another and reassigns items', () => {
    const source = repo.create('a-mesclar');
    const target = repo.create('categoria-final');
    db.prepare(
      `INSERT INTO items (type, name, source_type, source_value, local_path, category_id, tags, created_at, updated_at)
       VALUES ('skill', 'x', 'manual', 'x', '/tmp/x', ?, '[]', '2026-01-01', '2026-01-01')`
    ).run(source.id);

    repo.merge(source.id, target.id);

    const item = db.prepare('SELECT category_id FROM items WHERE name = ?').get('x') as {
      category_id: number;
    };
    expect(item.category_id).toBe(target.id);
    expect(repo.list().map((c) => c.id)).not.toContain(source.id);
  });
});
