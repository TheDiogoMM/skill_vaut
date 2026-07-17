import { describe, it, expect } from 'vitest';
import { createDb } from './db/connection.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: loadConfig({} as NodeJS.ProcessEnv) });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
