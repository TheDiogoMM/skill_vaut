import type Database from 'better-sqlite3';
import type { Category } from '../../types.js';

interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
}

function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export class CategoriesRepository {
  constructor(private db: Database.Database) {}

  list(): Category[] {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY name').all() as CategoryRow[];
    return rows.map(toCategory);
  }

  create(name: string): Category {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO categories (name, created_at) VALUES (?, ?)')
      .run(name, createdAt);
    return { id: Number(result.lastInsertRowid), name, createdAt };
  }

  findByName(name: string): Category | undefined {
    const row = this.db.prepare('SELECT * FROM categories WHERE name = ?').get(name) as
      | CategoryRow
      | undefined;
    return row ? toCategory(row) : undefined;
  }

  findById(id: number): Category | undefined {
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | CategoryRow
      | undefined;
    return row ? toCategory(row) : undefined;
  }

  findOrCreate(name: string): Category {
    return this.findByName(name) ?? this.create(name);
  }

  rename(id: number, name: string): Category | undefined {
    this.db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | CategoryRow
      | undefined;
    return row ? toCategory(row) : undefined;
  }

  merge(sourceId: number, targetId: number): void {
    this.db.prepare('UPDATE items SET category_id = ? WHERE category_id = ?').run(targetId, sourceId);
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(sourceId);
  }
}
