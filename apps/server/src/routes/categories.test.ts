import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs, type SkillVaultConfig } from '../config.js';
import { buildApp } from '../app.js';

describe('categories routes', () => {
  const home = path.join(os.tmpdir(), `skillvault-categories-routes-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function makeConfig(): SkillVaultConfig {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  it('creates, lists, renames, and merges categories', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const createA = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    expect(createA.statusCode).toBe(201);
    const categoryA = createA.json();

    const createB = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'automacao' },
    });
    const categoryB = createB.json();

    const list = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(list.json()).toHaveLength(2);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${categoryA.id}`,
      payload: { name: 'ferramentas-dev' },
    });
    expect(rename.json().name).toBe('ferramentas-dev');

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${categoryA.id}/merge`,
      payload: { target_id: categoryB.id },
    });
    expect(merge.statusCode).toBe(204);

    const finalList = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(finalList.json()).toHaveLength(1);
  });

  it('returns 400 from PATCH when the body is missing a name', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${category.id}`,
      payload: {},
    });
    expect(rename.statusCode).toBe(400);
  });

  it('returns 404 from merge when target_id does not refer to a real category', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${category.id}/merge`,
      payload: { target_id: 999999 },
    });
    expect(merge.statusCode).toBe(404);
  });

  it('returns 400 from merge when source and target ids are the same', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${category.id}/merge`,
      payload: { target_id: category.id },
    });
    expect(merge.statusCode).toBe(400);
  });

  it('regenerates index.json to reflect a category rename', async () => {
    const config = makeConfig();
    const db = createDb(':memory:');
    const app = buildApp({ db, config, webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    // Insert an item directly (bypassing enrichment, which needs a live
    // Ollama/Gemini backend) so we can assert the index reflects its category.
    db.prepare(
      `INSERT INTO items (type, name, source_type, source_value, local_path, category_id, tags, created_at, updated_at)
       VALUES ('mcp', 'renamed-category-item', 'manual', 'x', '/tmp/x', ?, '[]', '2026-01-01', '2026-01-01')`
    ).run(category.id);

    await app.inject({
      method: 'PATCH',
      url: `/api/categories/${category.id}`,
      payload: { name: 'ferramentas-dev' },
    });

    const indexJson = JSON.parse(fs.readFileSync(config.indexJsonPath, 'utf-8'));
    const entry = indexJson.find((e: { name: string }) => e.name === 'renamed-category-item');
    expect(entry?.category).toBe('ferramentas-dev');

    const indexMd = fs.readFileSync(config.indexMdPath, 'utf-8');
    expect(indexMd).toContain('ferramentas-dev');
    expect(indexMd).not.toContain('## dev-tools');
  });

  it('regenerates index.json to reflect a category merge', async () => {
    const config = makeConfig();
    const db = createDb(':memory:');
    const app = buildApp({ db, config, webDistPath: noDistPath });

    const createA = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'a-mesclar' },
    });
    const categoryA = createA.json();

    const createB = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'categoria-final' },
    });
    const categoryB = createB.json();

    db.prepare(
      `INSERT INTO items (type, name, source_type, source_value, local_path, category_id, tags, created_at, updated_at)
       VALUES ('mcp', 'merged-category-item', 'manual', 'x', '/tmp/x', ?, '[]', '2026-01-01', '2026-01-01')`
    ).run(categoryA.id);

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${categoryA.id}/merge`,
      payload: { target_id: categoryB.id },
    });
    expect(merge.statusCode).toBe(204);

    const indexJson = JSON.parse(fs.readFileSync(config.indexJsonPath, 'utf-8'));
    const entry = indexJson.find((e: { name: string }) => e.name === 'merged-category-item');
    expect(entry?.category).toBe('categoria-final');

    const indexMd = fs.readFileSync(config.indexMdPath, 'utf-8');
    expect(indexMd).not.toContain('## a-mesclar');
  });
});
