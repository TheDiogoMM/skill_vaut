import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { searchSmithery } from './smithery.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchSmithery', () => {
  it('returns an empty array without calling fetch when no API key is configured', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    const results = await searchSmithery('pdf', config, fetchImpl);

    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it('maps servers into the common DiscoverResult shape when a key is configured', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({
        servers: [
          {
            qualifiedName: 'someone/pdf-mcp',
            displayName: 'PDF MCP',
            description: 'Handles PDFs',
            useCount: 4200,
            verified: true,
            // The Smithery API exposes the server's link as a flat `homepage` string,
            // not a nested `repository.url` field (confirmed against Smithery's own
            // docs at https://smithery.ai/docs/concepts/registry_search_servers).
            homepage: 'https://github.com/someone/pdf-mcp',
          },
        ],
      })) as typeof fetch;

    const results = await searchSmithery('pdf', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'smithery',
        itemType: 'mcp',
        name: 'PDF MCP',
        description: 'Handles PDFs',
        url: 'https://github.com/someone/pdf-mcp',
        rating: { kind: 'use_count', value: 4200 },
        verified: true,
      },
    ]);
  });

  it('falls back to qualifiedName when displayName is absent, and to the Smithery page when no homepage is present', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({ servers: [{ qualifiedName: 'someone/no-display-name' }] })) as typeof fetch;

    const results = await searchSmithery('', config, fetchImpl);

    expect(results[0].name).toBe('someone/no-display-name');
    expect(results[0].url).toBe('https://smithery.ai/server/someone%2Fno-display-name');
    expect(results[0].verified).toBe(false);
    expect(results[0].rating).toEqual({ kind: 'use_count', value: null });
  });

  it('sends the API key as a bearer token', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchSmithery('pdf', config, fetchImpl);

    expect(capturedHeaders).toMatchObject({ Authorization: 'Bearer key' });
  });

  it('returns an empty array when the API responds with an error', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;
    expect(await searchSmithery('pdf', config, fetchImpl)).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await searchSmithery('pdf', config, fetchImpl)).toEqual([]);
  });
});
