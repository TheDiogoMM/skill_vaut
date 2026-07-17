import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig } from '../config.js';
import { ingestRepo } from './repo.js';
import type { EnrichmentResult } from '../types.js';

function createFixtureRepo(): string {
  const dir = path.join(os.tmpdir(), `skillvault-fixture-repo-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture repo\n\nConteúdo de teste.');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('ingestRepo', () => {
  const home = path.join(os.tmpdir(), `skillvault-repo-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('clones the repo, reads the README, enriches, and saves the item', async () => {
    const fixtureRepo = createFixtureRepo();
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const stubEnrich = async (): Promise<EnrichmentResult> => ({
      summary: 'Resumo gerado',
      utility: 'Utilidade gerada',
      category: 'dev-tools',
      tags: ['git', 'exemplo'],
      source: 'ollama',
    });

    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Fixture Repo', url: fixtureRepo },
      stubEnrich
    );

    expect(item.type).toBe('repo');
    expect(fs.existsSync(path.join(item.localPath, 'README.md'))).toBe(true);
    expect(item.summary).toBe('Resumo gerado');
    expect(item.tags).toEqual(['git', 'exemplo']);

    const category = categoriesRepo.findByName('dev-tools');
    expect(item.categoryId).toBe(category?.id);
  });
});
