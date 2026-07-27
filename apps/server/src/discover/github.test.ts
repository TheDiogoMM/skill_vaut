import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { searchGitHub } from './github.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function repoItem(overrides: Partial<{ full_name: string; description: string | null; html_url: string; stargazers_count: number }>) {
  return {
    full_name: 'someone/repo',
    description: 'A repo',
    html_url: 'https://github.com/someone/repo',
    stargazers_count: 0,
    ...overrides,
  };
}

describe('searchGitHub', () => {
  it('maps GitHub search results into the common DiscoverResult shape', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({
        items: [
          repoItem({
            full_name: 'someone/awesome-mcp-server',
            description: 'An awesome MCP server',
            html_url: 'https://github.com/someone/awesome-mcp-server',
            stargazers_count: 1234,
          }),
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

  it('issues one fetch call per topic for the given item type', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const capturedUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      capturedUrls.push(url);
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(capturedUrls).toHaveLength(2);
    expect(capturedUrls.some((url) => url.includes(encodeURIComponent('topic:mcp-server')))).toBe(true);
    expect(capturedUrls.some((url) => url.includes(encodeURIComponent('topic:model-context-protocol')))).toBe(true);
    // Ensure each request carries only its own topic, not both combined.
    for (const url of capturedUrls) {
      expect(url.includes(encodeURIComponent('topic:mcp-server')) && url.includes(encodeURIComponent('topic:model-context-protocol'))).toBe(
        false
      );
    }
  });

  it('combines the free-text query with each topic filter separately', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const capturedUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      capturedUrls.push(url);
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(capturedUrls.some((url) => url.includes(encodeURIComponent('pdf topic:mcp-server')))).toBe(true);
    expect(capturedUrls.some((url) => url.includes(encodeURIComponent('pdf topic:model-context-protocol')))).toBe(true);
  });

  it('uses only the topic filter (no free-text term) when the query is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const capturedUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      capturedUrls.push(url);
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedUrls).toHaveLength(2);
    expect(capturedUrls.some((url) => url.endsWith(`q=${encodeURIComponent('topic:claude-skill')}&sort=stars&order=desc`))).toBe(true);
    expect(capturedUrls.some((url) => url.endsWith(`q=${encodeURIComponent('topic:claude-skills')}&sort=stars&order=desc`))).toBe(true);
  });

  it('merges and deduplicates results from multiple topic queries by url', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const shared = repoItem({
      full_name: 'someone/shared-repo',
      html_url: 'https://github.com/someone/shared-repo',
      stargazers_count: 50,
    });
    const uniqueToFirst = repoItem({
      full_name: 'someone/first-only',
      html_url: 'https://github.com/someone/first-only',
      stargazers_count: 10,
    });
    const uniqueToSecond = repoItem({
      full_name: 'someone/second-only',
      html_url: 'https://github.com/someone/second-only',
      stargazers_count: 20,
    });

    const fetchImpl = (async (url: string) => {
      if (url.includes(encodeURIComponent('topic:mcp-server'))) {
        return fakeResponse({ items: [shared, uniqueToFirst] });
      }
      return fakeResponse({ items: [shared, uniqueToSecond] });
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    const urls = results.map((r) => r.url);
    expect(urls.filter((u) => u === 'https://github.com/someone/shared-repo')).toHaveLength(1);
    expect(urls).toContain('https://github.com/someone/first-only');
    expect(urls).toContain('https://github.com/someone/second-only');
    expect(results).toHaveLength(3);
  });

  it('sorts merged results by rating (stars) descending', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const low = repoItem({ full_name: 'someone/low', html_url: 'https://github.com/someone/low', stargazers_count: 5 });
    const high = repoItem({ full_name: 'someone/high', html_url: 'https://github.com/someone/high', stargazers_count: 500 });
    const mid = repoItem({ full_name: 'someone/mid', html_url: 'https://github.com/someone/mid', stargazers_count: 50 });

    const fetchImpl = (async (url: string) => {
      if (url.includes(encodeURIComponent('topic:mcp-server'))) {
        return fakeResponse({ items: [low, high] });
      }
      return fakeResponse({ items: [mid] });
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results.map((r) => r.name)).toEqual(['someone/high', 'someone/mid', 'someone/low']);
  });

  it('sends an Authorization header when a GitHub token is configured', async () => {
    const config = loadConfig({ GITHUB_TOKEN: 'ghp_test' } as NodeJS.ProcessEnv);
    const capturedHeaders: (Record<string, string> | undefined)[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(init?.headers as Record<string, string>);
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders.length).toBeGreaterThan(0);
    for (const headers of capturedHeaders) {
      expect(headers).toMatchObject({ Authorization: 'Bearer ghp_test' });
    }
  });

  it('omits the Authorization header when no token is configured', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const capturedHeaders: (Record<string, string> | undefined)[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(init?.headers as Record<string, string>);
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders.length).toBeGreaterThan(0);
    for (const headers of capturedHeaders) {
      expect(headers).not.toHaveProperty('Authorization');
    }
  });

  it('returns results from the other topic when one topic request fails (non-2xx)', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const okRepo = repoItem({
      full_name: 'someone/still-here',
      html_url: 'https://github.com/someone/still-here',
      stargazers_count: 42,
    });

    const fetchImpl = (async (url: string) => {
      if (url.includes(encodeURIComponent('topic:mcp-server'))) {
        return fakeResponse(null, false);
      }
      return fakeResponse({ items: [okRepo] });
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'someone/still-here',
        description: 'A repo',
        url: 'https://github.com/someone/still-here',
        rating: { kind: 'stars', value: 42 },
        verified: false,
      },
    ]);
  });

  it('returns results from the other topic when one topic request throws', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const okRepo = repoItem({
      full_name: 'someone/survivor',
      html_url: 'https://github.com/someone/survivor',
      stargazers_count: 7,
    });

    const fetchImpl = (async (url: string) => {
      if (url.includes(encodeURIComponent('topic:mcp-server'))) {
        throw new Error('network down');
      }
      return fakeResponse({ items: [okRepo] });
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'someone/survivor',
        description: 'A repo',
        url: 'https://github.com/someone/survivor',
        rating: { kind: 'stars', value: 7 },
        verified: false,
      },
    ]);
  });

  it('returns an empty array when every topic request responds with an error', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });

  it('returns an empty array when every topic request throws', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });
});
