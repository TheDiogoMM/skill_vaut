import { describe, it, expect } from 'vitest';
import { buildExportRows, renderExportMarkdown } from './export.js';
import type { Item, Category } from '../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Item A',
    sourceType: 'url',
    sourceValue: 'https://example.com/repo.git',
    localPath: '/local/path',
    categoryId: null,
    summary: 'Resumo A',
    utility: 'Utilidade A',
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const category: Category = { id: 1, name: 'dev-tools', createdAt: '' };

describe('buildExportRows', () => {
  it('uses sourceValue as the link when it looks like a URL', () => {
    const rows = buildExportRows([sampleItem({ sourceValue: 'https://example.com/repo.git' })], []);
    expect(rows[0].link).toBe('https://example.com/repo.git');
  });

  it('falls back to localPath when sourceValue is not a URL', () => {
    const rows = buildExportRows(
      [sampleItem({ sourceValue: '/local/source', localPath: '/local/vault-copy' })],
      []
    );
    expect(rows[0].link).toBe('/local/vault-copy');
  });

  it('uses summary as the description, falling back to utility, then a placeholder', () => {
    const [withSummary] = buildExportRows([sampleItem({ summary: 'Resumo', utility: 'Utilidade' })], []);
    expect(withSummary.description).toBe('Resumo');

    const [withUtilityOnly] = buildExportRows([sampleItem({ summary: null, utility: 'Utilidade' })], []);
    expect(withUtilityOnly.description).toBe('Utilidade');

    const [withNeither] = buildExportRows([sampleItem({ summary: null, utility: null })], []);
    expect(withNeither.description).toBe('sem descrição');
  });

  it('resolves the category name, defaulting to "Sem categoria"', () => {
    const [withCategory] = buildExportRows([sampleItem({ categoryId: 1 })], [category]);
    expect(withCategory.category).toBe('dev-tools');

    const [withoutCategory] = buildExportRows([sampleItem({ categoryId: null })], [category]);
    expect(withoutCategory.category).toBe('Sem categoria');
  });
});

describe('renderExportMarkdown', () => {
  it('groups rows by category, sorted alphabetically, with name/description/link', () => {
    const md = renderExportMarkdown([
      { category: 'design', name: 'Item B', link: 'https://example.com/b', description: 'Descrição B' },
      { category: 'dev-tools', name: 'Item A', link: '/local/a', description: 'Descrição A' },
    ]);

    const devToolsIndex = md.indexOf('## dev-tools');
    const designIndex = md.indexOf('## design');
    expect(designIndex).toBeGreaterThanOrEqual(0);
    expect(devToolsIndex).toBeGreaterThan(designIndex);

    expect(md).toContain('- **Item A** — Descrição A');
    expect(md).toContain('Link: `/local/a`');
    expect(md).toContain('- **Item B** — Descrição B');
    expect(md).toContain('Link: https://example.com/b');
  });
});
