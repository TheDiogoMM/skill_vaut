import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs, type SkillVaultConfig } from '../config.js';
import { buildApp } from '../app.js';

vi.mock('../recommend/recommend.js', () => ({
  getRecommendations: vi.fn(),
}));

import { getRecommendations } from '../recommend/recommend.js';

describe('recommend routes', () => {
  const home = path.join(os.tmpdir(), `skillvault-recommend-routes-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function makeConfig(): SkillVaultConfig {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  it('returns 400 when ideia is missing', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({ method: 'POST', url: '/api/recommend', payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('returns recommendations and saves the consulta on success', async () => {
    vi.mocked(getRecommendations).mockResolvedValue({ skills: [], repos: [], mcps: [] });

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({
      method: 'POST',
      url: '/api/recommend',
      payload: { ideia: 'app de leitura de PDFs' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ skills: [], repos: [], mcps: [] });

    const history = await app.inject({ method: 'GET', url: '/api/consultas' });
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0].ideia).toBe('app de leitura de PDFs');
  });

  it('returns 503 and does not save a consulta when the LLM is unavailable', async () => {
    vi.mocked(getRecommendations).mockResolvedValue(null);

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({
      method: 'POST',
      url: '/api/recommend',
      payload: { ideia: 'app de leitura de PDFs' },
    });

    expect(response.statusCode).toBe(503);

    const history = await app.inject({ method: 'GET', url: '/api/consultas' });
    expect(history.json()).toHaveLength(0);
  });

  it('returns the last 10 consultas ordered by most recent first', async () => {
    vi.mocked(getRecommendations).mockResolvedValue({ skills: [], repos: [], mcps: [] });

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    for (let i = 0; i < 12; i++) {
      await app.inject({ method: 'POST', url: '/api/recommend', payload: { ideia: `ideia ${i}` } });
    }

    const history = await app.inject({ method: 'GET', url: '/api/consultas' });
    const ideias = history.json().map((c: { ideia: string }) => c.ideia);
    expect(ideias).toHaveLength(10);
    expect(ideias[0]).toBe('ideia 11');
  });
});
