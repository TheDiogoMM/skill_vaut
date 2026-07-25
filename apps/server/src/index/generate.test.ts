import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Item, Category } from '../types.js';
import { buildIndexEntries, renderIndexMarkdown, writeIndexFiles } from './generate.js';

const category: Category = { id: 1, name: 'dev-tools', createdAt: '2026-01-01' };

const testLocations = { claudeSkillsDir: '/nonexistent-skills-dir', claudeConfigPath: '/nonexistent-config.json' };

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
  downloadStatus: 'not_downloaded',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('buildIndexEntries', () => {
  it('resolves category names and preserves item fields', () => {
    const entries = buildIndexEntries([item], [category], testLocations);
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
        downloadStatus: 'not_downloaded',
        installedGlobally: null,
      },
    ]);
  });
});

describe('renderIndexMarkdown', () => {
  it('groups entries by category', () => {
    const md = renderIndexMarkdown(buildIndexEntries([item], [category], testLocations));
    expect(md).toContain('## dev-tools');
    expect(md).toContain('my-repo');
  });

  it('escapes markdown special characters in item name, summary, and utility', () => {
    const itemWithSpecialChars: Item = {
      ...item,
      name: 'my_repo*name',
      summary: 'Summary with _underscore* and **asterisks**',
      utility: 'Utility with `backticks` [brackets]',
    };
    const md = renderIndexMarkdown(buildIndexEntries([itemWithSpecialChars], [category], testLocations));

    // Verify escaped characters are present
    expect(md).toContain('\\*');
    expect(md).toContain('\\_');
    expect(md).toContain('\\`');
    expect(md).toContain('\\[');
    expect(md).toContain('\\]');

    // Verify unescaped raw characters don't appear in dangerous positions
    // (not directly adjacent to bold/italic markers in the name field)
    const nameLineMatch = md.match(/- \*\*.*?\*\*/);
    expect(nameLineMatch).toBeDefined();
    expect(nameLineMatch![0]).toContain('my\\_repo\\*name');
  });

  it('preserves localPath raw (unescaped) inside code span for copy-paste', () => {
    const itemWithSpecialPath: Item = {
      ...item,
      localPath: '/tmp/my_project[env]/repo',
    };
    const md = renderIndexMarkdown(buildIndexEntries([itemWithSpecialPath], [category], testLocations));

    // Verify localPath contains raw special characters (not escaped backslashes)
    expect(md).toContain('`/tmp/my_project[env]/repo`');
    // Explicitly verify the raw characters are present without backslash escapes
    expect(md).toContain('my_project[env]');
    // Ensure we don't have escaped versions in the code span
    expect(md).not.toContain('`/tmp/my\\_project');
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
    const entries = buildIndexEntries([item], [category], testLocations);

    writeIndexFiles(entries, jsonPath, mdPath);

    expect(JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))).toEqual(entries);
    expect(fs.readFileSync(mdPath, 'utf-8')).toContain('my-repo');
  });
});
