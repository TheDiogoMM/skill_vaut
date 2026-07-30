import { describe, it, expect } from 'vitest';
import { buildRecommendSummary } from './recommendSummary.js';
import type { RecommendedItem, RecommendResult, DiscoverResult } from '../types.js';

function sampleRecommendedItem(overrides: Partial<RecommendedItem> = {}): RecommendedItem {
  return {
    id: 1,
    type: 'skill',
    name: 'PDF Parser',
    sourceType: 'url',
    sourceValue: 'https://example.com/pdf-parser.git',
    localPath: 'C:\\skillvault\\skills\\pdf-parser',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    installedPath: null,
    createdAt: '',
    updatedAt: '',
    motivo: 'Extrai texto de PDFs',
    ...overrides,
  };
}

function sampleDiscoverResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/pdf-tool',
    description: null,
    url: 'https://github.com/someone/pdf-tool',
    rating: { kind: 'stars', value: 60 },
    verified: false,
    ...overrides,
  };
}

function emptyResult(overrides: Partial<RecommendResult> = {}): RecommendResult {
  return {
    skills: [],
    repos: [],
    mcps: [],
    plugins: [],
    externalSuggestions: [],
    ...overrides,
  };
}

describe('buildRecommendSummary', () => {
  it('lists each catalog item as name and local path under its section', () => {
    const summary = buildRecommendSummary('ler pdfs', emptyResult({ skills: [sampleRecommendedItem()] }));

    expect(summary).toContain('Skills:');
    expect(summary).toContain('- PDF Parser — C:\\skillvault\\skills\\pdf-parser');
  });

  it('lists external suggestions as name and url under their own section', () => {
    const summary = buildRecommendSummary(
      'ler pdfs',
      emptyResult({ externalSuggestions: [sampleDiscoverResult()] })
    );

    expect(summary).toContain('Sugestões externas (não instaladas):');
    expect(summary).toContain('- someone/pdf-tool — https://github.com/someone/pdf-tool');
  });

  it('omits sections that have no items', () => {
    const summary = buildRecommendSummary('ler pdfs', emptyResult({ skills: [sampleRecommendedItem()] }));

    expect(summary).not.toContain('Repos:');
    expect(summary).not.toContain('MCPs:');
    expect(summary).not.toContain('Plugins:');
    expect(summary).not.toContain('Sugestões externas');
  });

  it('includes the ideia in the header', () => {
    const summary = buildRecommendSummary('ler pdfs', emptyResult({ skills: [sampleRecommendedItem()] }));

    expect(summary).toContain('ler pdfs');
  });
});
