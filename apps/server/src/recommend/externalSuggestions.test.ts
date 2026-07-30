import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../config.js';
import type { Item } from '../types.js';
import type { DiscoverResult } from '../discover/types.js';

vi.mock('../discover/aggregate.js', () => ({ discoverItems: vi.fn() }));

import { discoverItems } from '../discover/aggregate.js';
import { resolveExternalSuggestions } from './externalSuggestions.js';

function fakeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Existing',
    sourceType: 'url',
    sourceValue: 'https://github.com/existing/repo',
    localPath: '/skillvault/repos/existing',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function fakeResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/repo',
    description: null,
    url: 'https://github.com/someone/repo',
    rating: { kind: 'stars', value: 60 },
    verified: false,
    ...overrides,
  };
}

describe('resolveExternalSuggestions', () => {
  it('filters out results whose url matches an existing item sourceValue', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://github.com/existing/repo' }),
      fakeResult({ url: 'https://github.com/new/repo' }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [fakeItem()], config, fetch);

    expect(result).toEqual([fakeResult({ url: 'https://github.com/new/repo' })]);
  });

  it('sorts results by rating value descending', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://a', rating: { kind: 'stars', value: 60 } }),
      fakeResult({ url: 'https://b', rating: { kind: 'stars', value: 90 } }),
      fakeResult({ url: 'https://c', rating: { kind: 'use_count', value: 70 } }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result.map((r) => r.url)).toEqual(['https://b', 'https://c', 'https://a']);
  });

  it('treats a null rating value as lowest when sorting', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://official', rating: { kind: 'official', value: null } }),
      fakeResult({ url: 'https://stars', rating: { kind: 'stars', value: 60 } }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result.map((r) => r.url)).toEqual(['https://stars', 'https://official']);
  });

  it('caps the result at 5 items', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        fakeResult({ url: `https://item-${i}`, rating: { kind: 'stars', value: 50 + i } })
      )
    );

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result).toHaveLength(5);
  });

  it('excludes non-official results with a rating below 50', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://low-stars', rating: { kind: 'stars', value: 49 } }),
      fakeResult({ url: 'https://ok-stars', rating: { kind: 'stars', value: 50 } }),
      fakeResult({ url: 'https://low-use-count', rating: { kind: 'use_count', value: 10 } }),
      fakeResult({ url: 'https://no-value', rating: { kind: 'stars', value: null } }),
      fakeResult({ url: 'https://official', rating: { kind: 'official', value: null } }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result.map((r) => r.url).sort()).toEqual(['https://official', 'https://ok-stars']);
  });

  it('calls discoverItems with no type filter, searching across skill/mcp/plugin', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([]);

    await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(discoverItems).toHaveBeenCalledWith('pdf', undefined, config, fetch);
  });
});
