import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs, type SkillVaultConfig } from '../config.js';
import { buildApp } from '../app.js';

vi.mock('../discover/aggregate.js', () => ({
  discoverItems: vi.fn(),
}));

import { discoverItems } from '../discover/aggregate.js';

describe('GET /api/discover', () => {
  const home = path.join(os.tmpdir(), `skillvault-discover-routes-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-discover-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function makeConfig(): SkillVaultConfig {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  it('returns results from discoverItems', async () => {
    vi.mocked(discoverItems).mockResolvedValue([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'x/y',
        description: null,
        url: 'https://github.com/x/y',
        rating: { kind: 'stars', value: 10 },
        verified: false,
      },
    ]);

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({ method: 'GET', url: '/api/discover?q=pdf&type=mcp' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(discoverItems).toHaveBeenCalledWith('pdf', 'mcp', expect.anything());
  });

  it('defaults q to an empty string and type to undefined when omitted', async () => {
    vi.mocked(discoverItems).mockResolvedValue([]);
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    await app.inject({ method: 'GET', url: '/api/discover' });

    expect(discoverItems).toHaveBeenCalledWith('', undefined, expect.anything());
  });

  it('returns 400 for an unsupported type', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({ method: 'GET', url: '/api/discover?type=nim' });

    expect(response.statusCode).toBe(400);
    expect(discoverItems).not.toHaveBeenCalled();
  });

  it('normalizes a repeated q param instead of 500ing', async () => {
    vi.mocked(discoverItems).mockResolvedValue([]);
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const response = await app.inject({ method: 'GET', url: '/api/discover?q=a&q=b&type=skill' });

    expect(response.statusCode).toBe(200);
    const [calledQuery] = vi.mocked(discoverItems).mock.calls[0];
    expect(typeof calledQuery).toBe('string');
    expect(discoverItems).toHaveBeenCalledWith('a', 'skill', expect.anything());
  });
});
