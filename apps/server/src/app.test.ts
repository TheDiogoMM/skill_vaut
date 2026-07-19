import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from './db/connection.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: path.join(os.tmpdir(), `skillvault-no-dist-${Date.now()}`),
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('static frontend serving', () => {
  const dir = path.join(os.tmpdir(), `skillvault-webdist-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves a static asset from webDistPath when index.html exists', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SkillVault</html>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hi")');

    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("hi")');
  });

  it('does not register static serving when webDistPath has no index.html', async () => {
    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/app.js' });
    expect(response.statusCode).toBe(404);
  });
});
