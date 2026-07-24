import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { ItemsRepository, type NewItem } from './items.js';

function sampleItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    type: 'repo',
    name: 'my-repo',
    sourceType: 'url',
    sourceValue: 'https://example.com/my-repo.git',
    localPath: '/tmp/skillvault/repos/my-repo',
    categoryId: null,
    summary: 'Um repositório de exemplo',
    utility: 'Serve de exemplo',
    tags: ['exemplo', 'dev-tools'],
    enrichmentSource: 'ollama',
    globalInstallStatus: null,
    downloadStatus: 'not_downloaded',
    ...overrides,
  };
}

describe('ItemsRepository', () => {
  let db: Database.Database;
  let repo: ItemsRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new ItemsRepository(db);
  });

  it('creates and fetches an item by id', () => {
    const created = repo.create(sampleItem());
    const fetched = repo.getById(created.id);
    expect(fetched).toEqual(created);
    expect(fetched?.tags).toEqual(['exemplo', 'dev-tools']);
  });

  it('lists items filtered by type, query, and tag', () => {
    repo.create(sampleItem({ name: 'repo-a', type: 'repo', tags: ['dados'] }));
    repo.create(sampleItem({ name: 'skill-b', type: 'skill', tags: ['automacao'] }));

    expect(repo.list({ type: 'skill' }).map((i) => i.name)).toEqual(['skill-b']);
    expect(repo.list({ q: 'repo-a' }).map((i) => i.name)).toEqual(['repo-a']);
    expect(repo.list({ tag: 'automacao' }).map((i) => i.name)).toEqual(['skill-b']);
  });

  it('updates category, summary, utility, and tags', () => {
    const created = repo.create(sampleItem());
    const updated = repo.update(created.id, { summary: 'Novo resumo', tags: ['novo'] });
    expect(updated?.summary).toBe('Novo resumo');
    expect(updated?.tags).toEqual(['novo']);
    expect(updated?.utility).toBe(created.utility);
  });

  it('deletes an item', () => {
    const created = repo.create(sampleItem());
    repo.delete(created.id);
    expect(repo.getById(created.id)).toBeUndefined();
  });
});

describe('ItemsRepository.markDownloaded', () => {
  it('flips download_status from not_downloaded to downloaded', () => {
    const db = createDb(':memory:');
    const repo = new ItemsRepository(db);
    const created = repo.create(sampleItem({ downloadStatus: 'not_downloaded' }));

    const updated = repo.markDownloaded(created.id);

    expect(updated.downloadStatus).toBe('downloaded');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
  });
});
