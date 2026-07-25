import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { buildApp } from '../app.js';

// Item creation in this file goes through real enrichment, which otherwise
// calls out to Ollama/Gemini over the network — mock it so this test doesn't
// depend on (or slow down waiting on) whatever LLM backend happens to be
// reachable on the machine running the suite.
vi.mock('../enrichment/enrich.js', () => ({
  enrichContent: vi.fn(async () => ({
    summary: 'Resumo',
    utility: 'Utilidade',
    category: 'automacao',
    tags: ['mcp'],
    source: 'manual' as const,
  })),
  buildEnrichmentPrompt: vi.fn(() => ''),
}));

describe('GET /api/index', () => {
  const home = path.join(os.tmpdir(), `skillvault-index-route-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('returns an empty array when no items have been added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'GET', url: '/api/index' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns the generated index after an item is added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'MCP Index', config: { mcpServers: {} } },
    });

    const response = await app.inject({ method: 'GET', url: '/api/index' });
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('MCP Index');
  });
});
