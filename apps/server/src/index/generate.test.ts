import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Item, Category } from '../types.js';
import { buildIndexEntries, renderIndexMarkdown, writeIndexFiles } from './generate.js';

const category: Category = { id: 1, name: 'dev-tools', createdAt: '2026-01-01' };

const item: Item = {
  id: 1,
  type: 'repo',
  name: 'my-repo',
  sourceType: 'url',
  sourceValue: 'https://example.com/my-repo.git',
  localPath: '/tmp/skillvault/repos/my-repo',
  categoryId: 1,
  summary: 'Resumo',
  utility: 'Utilidade',
  tags: ['tag1'],
  enrichmentSource: 'ollama',
  globalInstallStatus: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('buildIndexEntries', () => {
  it('resolves category names and preserves item fields', () => {
    const entries = buildIndexEntries([item], [category]);
    expect(entries).toEqual([
      {
        id: 1,
        type: 'repo',
        name: 'my-repo',
        category: 'dev-tools',
        summary: 'Resumo',
        utility: 'Utilidade',
        tags: ['tag1'],
        localPath: '/tmp/skillvault/repos/my-repo',
      },
    ]);
  });
});

describe('renderIndexMarkdown', () => {
  it('groups entries by category', () => {
    const md = renderIndexMarkdown(buildIndexEntries([item], [category]));
    expect(md).toContain('## dev-tools');
    expect(md).toContain('my-repo');
  });
});

describe('writeIndexFiles', () => {
  const dir = path.join(os.tmpdir(), `skillvault-index-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes index.json and INDEX.md to disk', () => {
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, 'index.json');
    const mdPath = path.join(dir, 'INDEX.md');
    const entries = buildIndexEntries([item], [category]);

    writeIndexFiles(entries, jsonPath, mdPath);

    expect(JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))).toEqual(entries);
    expect(fs.readFileSync(mdPath, 'utf-8')).toContain('my-repo');
  });
});
