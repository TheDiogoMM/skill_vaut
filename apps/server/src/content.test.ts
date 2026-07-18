import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFirstExisting, readItemContent } from './content.js';
import type { Item } from './types.js';

describe('readFirstExisting', () => {
  const dir = path.join(os.tmpdir(), `skillvault-content-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the first candidate file that exists', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# Hello');
    expect(readFirstExisting(dir, ['SKILL.md', 'README.md'])).toBe('# Hello');
  });

  it('returns an empty string when none exist', () => {
    fs.mkdirSync(dir, { recursive: true });
    expect(readFirstExisting(dir, ['SKILL.md', 'README.md'])).toBe('');
  });
});

function baseItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'x',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/tmp/does-not-exist',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('readItemContent', () => {
  const dir = path.join(os.tmpdir(), `skillvault-content-item-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads README.md for a repo item', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# Repo content');
    expect(readItemContent(baseItem({ type: 'repo', localPath: dir }))).toBe('# Repo content');
  });

  it('reads SKILL.md for a skill item', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Skill content');
    expect(readItemContent(baseItem({ type: 'skill', localPath: dir }))).toBe('# Skill content');
  });

  it('reads the raw file for an mcp item', () => {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, '{"mcpServers":{}}');
    expect(readItemContent(baseItem({ type: 'mcp', localPath: filePath }))).toBe('{"mcpServers":{}}');
  });

  it('returns an empty string when the path does not exist', () => {
    expect(readItemContent(baseItem({ type: 'repo', localPath: dir }))).toBe('');
  });
});
