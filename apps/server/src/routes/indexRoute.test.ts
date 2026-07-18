import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { buildApp } from '../app.js';

describe('GET /api/index', () => {
  const home = path.join(os.tmpdir(), `skillvault-index-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('returns an empty array when no items have been added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({ method: 'GET', url: '/api/index' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns the generated index after an item is added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

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
