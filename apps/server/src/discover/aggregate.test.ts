import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../config.js';
import type { DiscoverResult } from './types.js';

vi.mock('./github.js', () => ({ searchGitHub: vi.fn() }));
vi.mock('./mcpRegistry.js', () => ({ searchMcpRegistry: vi.fn() }));
vi.mock('./smithery.js', () => ({ searchSmithery: vi.fn() }));
vi.mock('./translate.js', () => ({ translateDescriptions: vi.fn((results) => Promise.resolve(results)) }));

import { searchGitHub } from './github.js';
import { searchMcpRegistry } from './mcpRegistry.js';
import { searchSmithery } from './smithery.js';
import { translateDescriptions } from './translate.js';
import { discoverItems } from './aggregate.js';

function fakeResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'x',
    description: null,
    url: 'https://example.com',
    rating: { kind: 'stars', value: 1 },
    verified: false,
    ...overrides,
  };
}

describe('discoverItems', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls only GitHub for itemType=skill', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ itemType: 'skill' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const results = await discoverItems('pdf', 'skill', config, fetch);

    expect(searchGitHub).toHaveBeenCalledWith('pdf', 'skill', config, fetch);
    expect(searchMcpRegistry).not.toHaveBeenCalled();
    expect(searchSmithery).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('calls only GitHub for itemType=plugin', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ itemType: 'plugin' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    await discoverItems('pdf', 'plugin', config, fetch);

    expect(searchGitHub).toHaveBeenCalledWith('pdf', 'plugin', config, fetch);
    expect(searchMcpRegistry).not.toHaveBeenCalled();
    expect(searchSmithery).not.toHaveBeenCalled();
  });

  it('calls GitHub, the MCP registry, and Smithery for itemType=mcp, concatenating results', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ source: 'github' })]);
    vi.mocked(searchMcpRegistry).mockResolvedValue([fakeResult({ source: 'mcp_registry' })]);
    vi.mocked(searchSmithery).mockResolvedValue([fakeResult({ source: 'smithery' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const results = await discoverItems('pdf', 'mcp', config, fetch);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.source)).toEqual(['github', 'mcp_registry', 'smithery']);
  });

  it('queries all three types when itemType is omitted', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([]);
    vi.mocked(searchMcpRegistry).mockResolvedValue([]);
    vi.mocked(searchSmithery).mockResolvedValue([]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    await discoverItems('', undefined, config, fetch);

    expect(searchGitHub).toHaveBeenCalledTimes(3);
    expect(searchGitHub).toHaveBeenCalledWith('', 'skill', config, fetch);
    expect(searchGitHub).toHaveBeenCalledWith('', 'mcp', config, fetch);
    expect(searchGitHub).toHaveBeenCalledWith('', 'plugin', config, fetch);
    expect(searchMcpRegistry).toHaveBeenCalledTimes(1);
    expect(searchSmithery).toHaveBeenCalledTimes(1);
  });

  it('translates the aggregated results before returning them', async () => {
    const rawResult = fakeResult({ itemType: 'skill', description: 'Original description' });
    const translatedResult = { ...rawResult, description: 'Descrição traduzida' };
    vi.mocked(searchGitHub).mockResolvedValue([rawResult]);
    vi.mocked(translateDescriptions).mockResolvedValue([translatedResult]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const results = await discoverItems('pdf', 'skill', config, fetch);

    expect(translateDescriptions).toHaveBeenCalledWith([rawResult], config, fetch);
    expect(results).toEqual([translatedResult]);
  });
});
