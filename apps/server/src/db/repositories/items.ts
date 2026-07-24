import type Database from 'better-sqlite3';
import type { Item, ItemType, SourceType, EnrichmentSource, GlobalInstallStatus, DownloadStatus } from '../../types.js';

interface ItemRow {
  id: number;
  type: ItemType;
  name: string;
  source_type: SourceType;
  source_value: string;
  local_path: string;
  category_id: number | null;
  summary: string | null;
  utility: string | null;
  tags: string;
  enrichment_source: EnrichmentSource | null;
  global_install_status: GlobalInstallStatus | null;
  download_status: DownloadStatus | null;
  created_at: string;
  updated_at: string;
}

export interface NewItem {
  type: ItemType;
  name: string;
  sourceType: SourceType;
  sourceValue: string;
  localPath: string;
  categoryId: number | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  enrichmentSource: EnrichmentSource | null;
  globalInstallStatus: GlobalInstallStatus | null;
  downloadStatus: DownloadStatus | null;
}

export interface ItemUpdate {
  categoryId?: number | null;
  summary?: string | null;
  utility?: string | null;
  tags?: string[];
}

export interface ItemFilters {
  q?: string;
  type?: ItemType;
  categoryId?: number;
  tag?: string;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    sourceType: row.source_type,
    sourceValue: row.source_value,
    localPath: row.local_path,
    categoryId: row.category_id,
    summary: row.summary,
    utility: row.utility,
    tags: JSON.parse(row.tags) as string[],
    enrichmentSource: row.enrichment_source,
    globalInstallStatus: row.global_install_status,
    downloadStatus: row.download_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ItemsRepository {
  constructor(private db: Database.Database) {}

  create(input: NewItem): Item {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO items (
          type, name, source_type, source_value, local_path, category_id,
          summary, utility, tags, enrichment_source, global_install_status, download_status,
          created_at, updated_at
        ) VALUES (@type, @name, @sourceType, @sourceValue, @localPath, @categoryId,
          @summary, @utility, @tags, @enrichmentSource, @globalInstallStatus, @downloadStatus,
          @createdAt, @updatedAt)`
      )
      .run({
        type: input.type,
        name: input.name,
        sourceType: input.sourceType,
        sourceValue: input.sourceValue,
        localPath: input.localPath,
        categoryId: input.categoryId,
        summary: input.summary,
        utility: input.utility,
        tags: JSON.stringify(input.tags),
        enrichmentSource: input.enrichmentSource,
        globalInstallStatus: input.globalInstallStatus,
        downloadStatus: input.downloadStatus,
        createdAt: now,
        updatedAt: now,
      });
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Item | undefined {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    return row ? toItem(row) : undefined;
  }

  list(filters: ItemFilters = {}): Item[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.type) {
      clauses.push('type = @type');
      params.type = filters.type;
    }
    if (filters.categoryId !== undefined) {
      clauses.push('category_id = @categoryId');
      params.categoryId = filters.categoryId;
    }
    if (filters.q) {
      clauses.push('(name LIKE @q OR summary LIKE @q OR utility LIKE @q)');
      params.q = `%${filters.q}%`;
    }
    if (filters.tag) {
      clauses.push('tags LIKE @tag');
      params.tag = `%"${filters.tag}"%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM items ${where} ORDER BY created_at DESC`)
      .all(params) as ItemRow[];
    return rows.map(toItem);
  }

  update(id: number, patch: ItemUpdate): Item | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const categoryId = patch.categoryId !== undefined ? patch.categoryId : existing.categoryId;
    const summary = patch.summary !== undefined ? patch.summary : existing.summary;
    const utility = patch.utility !== undefined ? patch.utility : existing.utility;
    const tags = patch.tags !== undefined ? patch.tags : existing.tags;

    this.db
      .prepare(
        `UPDATE items SET category_id = @categoryId, summary = @summary, utility = @utility,
         tags = @tags, updated_at = @updatedAt WHERE id = @id`
      )
      .run({
        id,
        categoryId,
        summary,
        utility,
        tags: JSON.stringify(tags),
        updatedAt: new Date().toISOString(),
      });
    return this.getById(id);
  }

  markDownloaded(id: number): Item {
    this.db
      .prepare(`UPDATE items SET download_status = 'downloaded', updated_at = @updatedAt WHERE id = @id`)
      .run({ id, updatedAt: new Date().toISOString() });
    return this.getById(id)!;
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }
}
