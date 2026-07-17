import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugify, resolveUniqueDir, resolveUniqueFile } from './slug.js';

describe('slugify', () => {
  it('lowercases, strips accents, and hyphenates', () => {
    expect(slugify('Meu Repositório Incrível!')).toBe('meu-repositorio-incrivel');
  });

  it('falls back to "item" for empty input', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('resolveUniqueDir', () => {
  const parent = path.join(os.tmpdir(), `skillvault-slug-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('returns the base slug when free', () => {
    fs.mkdirSync(parent, { recursive: true });
    const { slug } = resolveUniqueDir(parent, 'My Skill');
    expect(slug).toBe('my-skill');
  });

  it('appends a numeric suffix on collision', () => {
    fs.mkdirSync(path.join(parent, 'my-skill'), { recursive: true });
    const { slug } = resolveUniqueDir(parent, 'My Skill');
    expect(slug).toBe('my-skill-2');
  });
});

describe('resolveUniqueFile', () => {
  const parent = path.join(os.tmpdir(), `skillvault-slug-file-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('appends a numeric suffix when the file already exists', () => {
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(path.join(parent, 'my-mcp.json'), '{}');
    const { slug, fullPath } = resolveUniqueFile(parent, 'My MCP', '.json');
    expect(slug).toBe('my-mcp-2');
    expect(fullPath).toBe(path.join(parent, 'my-mcp-2.json'));
  });
});
