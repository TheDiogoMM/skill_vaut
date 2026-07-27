import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { searchGitHub } from './github.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchGitHub', () => {
  it('maps GitHub search results into the common DiscoverResult shape', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({
        items: [
          {
            full_name: 'someone/awesome-mcp-server',
            description: 'An awesome MCP server',
            html_url: 'https://github.com/someone/awesome-mcp-server',
            stargazers_count: 1234,
          },
        ],
      })) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'someone/awesome-mcp-server',
        description: 'An awesome MCP server',
        url: 'https://github.com/someone/awesome-mcp-server',
        rating: { kind: 'stars', value: 1234 },
        verified: false,
      },
    ]);
  });

  it('combines the query with type-specific topic filters', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(capturedUrl).toContain(encodeURIComponent('pdf topic:mcp-server topic:model-context-protocol'));
  });

  it('uses only topic filters (no free-text term) when the query is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedUrl).toContain(encodeURIComponent('topic:claude-skill topic:claude-skills'));
  });

  it('sends an Authorization header when a GitHub token is configured', async () => {
    const config = loadConfig({ GITHUB_TOKEN: 'ghp_test' } as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders).toMatchObject({ Authorization: 'Bearer ghp_test' });
  });

  it('omits the Authorization header when no token is configured', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders).not.toHaveProperty('Authorization');
  });

  it('returns an empty array when the GitHub API responds with an error', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });
});
