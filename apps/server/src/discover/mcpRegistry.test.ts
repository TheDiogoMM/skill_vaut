import { describe, it, expect } from 'vitest';
import { searchMcpRegistry } from './mcpRegistry.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchMcpRegistry', () => {
  it('maps registry servers into the common DiscoverResult shape, marked as official', async () => {
    const fetchImpl = (async () =>
      fakeResponse({
        servers: [
          {
            server: {
              name: 'io.example/pdf-tools',
              description: 'PDF tools MCP server',
              repository: { url: 'https://github.com/example/pdf-tools' },
            },
            _meta: {},
          },
        ],
      })) as typeof fetch;

    const results = await searchMcpRegistry('pdf', fetchImpl);

    expect(results).toEqual([
      {
        source: 'mcp_registry',
        itemType: 'mcp',
        name: 'io.example/pdf-tools',
        description: 'PDF tools MCP server',
        url: 'https://github.com/example/pdf-tools',
        rating: { kind: 'official', value: null },
        verified: true,
      },
    ]);
  });

  it('keeps only the latest version when the registry returns multiple versions of the same server', async () => {
    const fetchImpl = (async () =>
      fakeResponse({
        servers: [
          {
            server: {
              name: 'io.github.AryanBV/pdf-toolkit-mcp',
              description: 'PDF manipulation server, version 0.2.2',
              repository: { url: 'https://github.com/AryanBV/pdf-toolkit-mcp' },
            },
            _meta: {
              'io.modelcontextprotocol.registry/official': { isLatest: false },
            },
          },
          {
            server: {
              name: 'io.github.AryanBV/pdf-toolkit-mcp',
              description: 'PDF manipulation server, version 0.3.0',
              repository: { url: 'https://github.com/AryanBV/pdf-toolkit-mcp' },
            },
            _meta: {
              'io.modelcontextprotocol.registry/official': { isLatest: false },
            },
          },
          {
            server: {
              name: 'io.github.AryanBV/pdf-toolkit-mcp',
              description: 'PDF manipulation server, version 0.3.1',
              repository: { url: 'https://github.com/AryanBV/pdf-toolkit-mcp' },
            },
            _meta: {
              'io.modelcontextprotocol.registry/official': { isLatest: true },
            },
          },
          {
            server: {
              name: 'com.hellobasestation/pdfkit',
              description: 'AI-powered PDF tools, older version',
            },
            _meta: {
              'io.modelcontextprotocol.registry/official': { isLatest: false },
            },
          },
          {
            server: {
              name: 'com.hellobasestation/pdfkit',
              description: 'AI-powered PDF tools, latest version',
            },
            _meta: {
              'io.modelcontextprotocol.registry/official': { isLatest: true },
            },
          },
        ],
      })) as typeof fetch;

    const results = await searchMcpRegistry('pdf', fetchImpl);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual([
      'io.github.AryanBV/pdf-toolkit-mcp',
      'com.hellobasestation/pdfkit',
    ]);
    expect(results[0].description).toBe('PDF manipulation server, version 0.3.1');
    expect(results[1].description).toBe('AI-powered PDF tools, latest version');
  });

  it('falls back to the registry page URL when no repository url is present', async () => {
    const fetchImpl = (async () =>
      fakeResponse({ servers: [{ server: { name: 'io.example/no-repo' } }] })) as typeof fetch;

    const results = await searchMcpRegistry('', fetchImpl);

    expect(results[0].url).toBe('https://registry.modelcontextprotocol.io/servers/io.example%2Fno-repo');
  });

  it('includes the search term as a query param when provided', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchMcpRegistry('pdf', fetchImpl);

    expect(capturedUrl).toContain('search=pdf');
  });

  it('omits the search param entirely when the query is empty', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchMcpRegistry('', fetchImpl);

    expect(capturedUrl).not.toContain('search=');
  });

  it('returns an empty array when the API responds with an error', async () => {
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;
    expect(await searchMcpRegistry('pdf', fetchImpl)).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await searchMcpRegistry('pdf', fetchImpl)).toEqual([]);
  });
});
