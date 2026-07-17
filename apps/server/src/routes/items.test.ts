import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { buildApp } from '../app.js';

function createFixtureRepo(): string {
  const dir = path.join(os.tmpdir(), `skillvault-route-fixture-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('POST /api/items (type=repo)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('ingests a repo and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Fixture Repo', url: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe('repo');
    expect(fs.existsSync(path.join(config.indexJsonPath))).toBe(true);
  });

  it('rejects a repo without a url', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Sem URL' },
    });

    expect(response.statusCode).toBe(400);
  });
});
