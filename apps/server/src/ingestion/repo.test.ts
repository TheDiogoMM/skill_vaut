import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig } from '../config.js';
import { ingestRepo } from './repo.js';
import type { EnrichmentResult } from '../types.js';

vi.mock('simple-git', async (importOriginal) => {
  const actual = await importOriginal<typeof import('simple-git')>();
  return {
    ...actual,
    simpleGit: vi.fn((...args: Parameters<typeof actual.simpleGit>) => actual.simpleGit(...args)),
  };
});

function createFixtureRepo(withRemote?: string): string {
  const dir = path.join(os.tmpdir(), `skillvault-fixture-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture repo\n\nConteúdo de teste.');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
  if (withRemote) {
    execFileSync('git', ['remote', 'add', 'origin', withRemote], { cwd: dir });
  }
  return dir;
}

const stubEnrich = async (): Promise<EnrichmentResult> => ({
  summary: 'Resumo gerado',
  utility: 'Utilidade gerada',
  category: 'dev-tools',
  tags: ['git', 'exemplo'],
  source: 'ollama',
});

describe('ingestRepo', () => {
  const home = path.join(os.tmpdir(), `skillvault-repo-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('local_path: references the existing directory without copying it, and captures the git remote', async () => {
    const fixtureRepo = createFixtureRepo('https://example.com/own/fixture.git');
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Fixture Repo', source: { kind: 'local_path', path: fixtureRepo } },
      stubEnrich
    );

    expect(item.sourceType).toBe('local_path');
    expect(item.localPath).toBe(fixtureRepo);
    expect(item.sourceValue).toBe('https://example.com/own/fixture.git');
    expect(item.downloadStatus).toBe('local');
    expect(item.summary).toBe('Resumo gerado');
    // nothing was copied into the vault's repos dir
    expect(fs.readdirSync(config.reposDir)).toEqual([]);
  });

  it('local_path: falls back to the path itself as sourceValue when there is no git remote', async () => {
    const fixtureRepo = createFixtureRepo();
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Sem Remote', source: { kind: 'local_path', path: fixtureRepo } },
      stubEnrich
    );

    expect(item.sourceValue).toBe(fixtureRepo);
    expect(item.downloadStatus).toBe('local');
  });

  it('url: probes the remote with a temporary shallow clone, reads the README, and leaves no permanent copy', async () => {
    const fixtureRepo = createFixtureRepo();
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Fixture Remote', source: { kind: 'url', url: fixtureRepo } },
      stubEnrich
    );

    expect(item.sourceType).toBe('url');
    expect(item.sourceValue).toBe(fixtureRepo);
    expect(item.downloadStatus).toBe('not_downloaded');
    // the enrichment content really came from the README (proves the probe worked)
    expect(item.summary).toBe('Resumo gerado');
    // but no permanent clone exists yet at the computed destination
    expect(fs.existsSync(item.localPath)).toBe(false);
    expect(item.localPath.startsWith(config.reposDir)).toBe(true);
  });

  it('rejects a url that looks like a git option before invoking clone', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const stubEmptyEnrich = async (): Promise<EnrichmentResult> => ({
      summary: '',
      utility: '',
      category: '',
      tags: [],
      source: 'manual',
    });

    vi.mocked(simpleGit).mockClear();

    await expect(
      ingestRepo(
        config,
        itemsRepo,
        categoriesRepo,
        { name: 'Malicious', source: { kind: 'url', url: '--upload-pack=/bin/sh' } },
        stubEmptyEnrich
      )
    ).rejects.toThrow('invalid repository url');

    expect(simpleGit).not.toHaveBeenCalled();
  });
});
