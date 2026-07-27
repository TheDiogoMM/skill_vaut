import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs, type SkillVaultConfig } from '../config.js';
import { buildApp } from '../app.js';
import type { DiscoverResult } from '../discover/types.js';

vi.mock('../discover/aggregate.js', () => ({
  discoverItems: vi.fn(),
}));
vi.mock('../discover/translate.js', () => ({
  translateDescriptions: vi.fn(),
}));

import { discoverItems } from '../discover/aggregate.js';
import { translateDescriptions } from '../discover/translate.js';

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

describe('POST /api/discover/translate', () => {
  const home = path.join(os.tmpdir(), `skillvault-discover-translate-routes-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-discover-translate-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function makeConfig(): SkillVaultConfig {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  function sampleResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
    return {
      source: 'github',
      itemType: 'mcp',
      name: 'x/y',
      description: 'Handles PDFs',
      url: 'https://github.com/x/y',
      rating: { kind: 'stars', value: 10 },
      verified: false,
      ...overrides,
    };
  }

  it('returns the translated results from translateDescriptions', async () => {
    const original = [sampleResult()];
    const translated = [sampleResult({ description: 'Lida com PDFs' })];
    vi.mocked(translateDescriptions).mockResolvedValue(translated);

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({
      method: 'POST',
      url: '/api/discover/translate',
      payload: original,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(translated);
    expect(translateDescriptions).toHaveBeenCalledWith(original, expect.anything());
  });

  it('returns 400 when the body is not an array', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({
      method: 'POST',
      url: '/api/discover/translate',
      payload: { not: 'an array' },
    });

    expect(response.statusCode).toBe(400);
    expect(translateDescriptions).not.toHaveBeenCalled();
  });

  it('returns 400 instead of crashing when an array element is malformed', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/discover/translate', payload: [null] }),
      app.inject({ method: 'POST', url: '/api/discover/translate', payload: ['just a string'] }),
      app.inject({ method: 'POST', url: '/api/discover/translate', payload: [{ description: 123 }] }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
    }
    expect(translateDescriptions).not.toHaveBeenCalled();
  });
});
