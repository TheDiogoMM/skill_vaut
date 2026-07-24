# Ingestão preguiçosa de repositórios + redação de segredos em MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repositórios deixam de ser clonados automaticamente ao cadastrar — repos locais (próprios) são só referenciados, repos remotos por URL são sondados com um clone raso temporário (descartado logo depois) e ficam marcados como "não baixado" até o usuário pedir o download sob demanda. Além disso, configs de MCP têm segredos redigidos automaticamente antes de persistir no catálogo.

**Architecture:** Um novo campo `download_status` em `items` (`'local' | 'not_downloaded' | 'downloaded' | null`) guarda o estado de cada repo. `ingestRepo` ganha dois modos (`local_path` vs `url`) via um novo parâmetro `source`. Um novo endpoint `POST /api/items/:id/download` materializa o clone real quando pedido. `ingestMcp` passa por uma função `redactSecrets` antes de persistir. No frontend, um componente `RepoDownloadAction` mostra o status e o botão de baixar nos três lugares que hoje exibem `localPath` (catálogo, recomendador, detalhe do item).

**Tech Stack:** TypeScript, Fastify, better-sqlite3, simple-git, Vitest, React, React Testing Library — sem novas dependências.

---

## Backend

### Task 1: Schema — coluna `download_status` + migração

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/db/connection.ts`
- Test: `apps/server/src/db/connection.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/server/src/db/connection.test.ts`:

```ts
  it('adds a download_status column to items (for pre-existing databases without it)', () => {
    const db = createDb(':memory:');
    const columns = db
      .prepare('PRAGMA table_info(items)')
      .all()
      .map((row) => (row as { name: string }).name);

    expect(columns).toContain('download_status');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/db/connection.test.ts`
Expected: FAIL — `columns` does not contain `'download_status'` (column doesn't exist yet).

- [ ] **Step 3: Add the column to the schema and add a migration for existing databases**

In `apps/server/src/db/schema.ts`, modify the `items` table definition (add the line after `global_install_status`):

```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
  source_value TEXT NOT NULL,
  local_path TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  summary TEXT,
  utility TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
  global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
  download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ideia TEXT NOT NULL,
  resposta_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
```

`CREATE TABLE IF NOT EXISTS` does nothing on a database that already has the `items` table (e.g. the user's real `~/skillvault/skillvault.db`), so the column must also be added via migration. Replace `apps/server/src/db/connection.ts` with:

```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((col) => col.name === column);
}

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  if (!hasColumn(db, 'items', 'download_status')) {
    db.exec(
      "ALTER TABLE items ADD COLUMN download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded'))"
    );
  }

  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/db/connection.test.ts`
Expected: PASS (both the existing "creates categories, items, and consultas tables" test and the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/connection.ts apps/server/src/db/connection.test.ts
git commit -m "feat: add download_status column to items with migration for existing dbs"
```

---

### Task 2: Types + `ItemsRepository` — carregar/gravar `downloadStatus`

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/db/repositories/items.ts`
- Modify: `apps/server/src/db/repositories/items.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/server/src/db/repositories/items.test.ts`, update `sampleItem` to require the new field and add tests for it and for the new `markDownloaded` method:

```ts
function sampleItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    type: 'repo',
    name: 'my-repo',
    sourceType: 'url',
    sourceValue: 'https://example.com/my-repo.git',
    localPath: '/tmp/skillvault/repos/my-repo',
    categoryId: null,
    summary: 'Um repositório de exemplo',
    utility: 'Serve de exemplo',
    tags: ['exemplo', 'dev-tools'],
    enrichmentSource: 'ollama',
    globalInstallStatus: null,
    downloadStatus: 'not_downloaded',
    ...overrides,
  };
}
```

Add a new `describe` block at the end of the file (before the final closing of `describe('ItemsRepository', ...)`, i.e. as a sibling top-level block):

```ts
describe('ItemsRepository.markDownloaded', () => {
  it('flips download_status from not_downloaded to downloaded', () => {
    const db = createDb(':memory:');
    const repo = new ItemsRepository(db);
    const created = repo.create(sampleItem({ downloadStatus: 'not_downloaded' }));

    const updated = repo.markDownloaded(created.id);

    expect(updated.downloadStatus).toBe('downloaded');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/db/repositories/items.test.ts`
Expected: FAIL — TypeScript error (`downloadStatus` does not exist on `NewItem`) and/or `repo.markDownloaded is not a function`.

- [ ] **Step 3: Add `DownloadStatus` type and wire it through the repository**

In `apps/server/src/types.ts`, add the type and field:

```ts
export type ItemType = 'skill' | 'repo' | 'mcp';
export type SourceType = 'local_path' | 'upload' | 'url' | 'manual';
export type EnrichmentSource = 'ollama' | 'gemini' | 'manual';
export type GlobalInstallStatus = 'success' | 'failed';
export type DownloadStatus = 'local' | 'not_downloaded' | 'downloaded';

export interface Category {
  id: number;
  name: string;
  createdAt: string;
}

export interface Item {
  id: number;
  type: ItemType;
  name: string;
  sourceType: SourceType;
  sourceValue: string;
  localPath: string;
  categoryId: number | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  enrichmentSource: EnrichmentSource | null;
  globalInstallStatus: GlobalInstallStatus | null;
  downloadStatus: DownloadStatus | null;
  createdAt: string;
  updatedAt: string;
}
```

(Leave the rest of `types.ts` — `EnrichmentResult`, `Consulta`, `RecommendedItem`, `RecommendResult` — unchanged.)

In `apps/server/src/db/repositories/items.ts`:

1. Update the import and `ItemRow`:

```ts
import type Database from 'better-sqlite3';
import type { Item, ItemType, SourceType, EnrichmentSource, GlobalInstallStatus, DownloadStatus } from '../../types.js';

interface ItemRow {
  id: number;
  type: ItemType;
  name: string;
  source_type: SourceType;
  source_value: string;
  local_path: string;
  category_id: number | null;
  summary: string | null;
  utility: string | null;
  tags: string;
  enrichment_source: EnrichmentSource | null;
  global_install_status: GlobalInstallStatus | null;
  download_status: DownloadStatus | null;
  created_at: string;
  updated_at: string;
}
```

2. Update `NewItem`:

```ts
export interface NewItem {
  type: ItemType;
  name: string;
  sourceType: SourceType;
  sourceValue: string;
  localPath: string;
  categoryId: number | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  enrichmentSource: EnrichmentSource | null;
  globalInstallStatus: GlobalInstallStatus | null;
  downloadStatus: DownloadStatus | null;
}
```

3. Update `toItem`:

```ts
function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    sourceType: row.source_type,
    sourceValue: row.source_value,
    localPath: row.local_path,
    categoryId: row.category_id,
    summary: row.summary,
    utility: row.utility,
    tags: JSON.parse(row.tags) as string[],
    enrichmentSource: row.enrichment_source,
    globalInstallStatus: row.global_install_status,
    downloadStatus: row.download_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

4. Update `create()`:

```ts
  create(input: NewItem): Item {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO items (
          type, name, source_type, source_value, local_path, category_id,
          summary, utility, tags, enrichment_source, global_install_status, download_status,
          created_at, updated_at
        ) VALUES (@type, @name, @sourceType, @sourceValue, @localPath, @categoryId,
          @summary, @utility, @tags, @enrichmentSource, @globalInstallStatus, @downloadStatus,
          @createdAt, @updatedAt)`
      )
      .run({
        type: input.type,
        name: input.name,
        sourceType: input.sourceType,
        sourceValue: input.sourceValue,
        localPath: input.localPath,
        categoryId: input.categoryId,
        summary: input.summary,
        utility: input.utility,
        tags: JSON.stringify(input.tags),
        enrichmentSource: input.enrichmentSource,
        globalInstallStatus: input.globalInstallStatus,
        downloadStatus: input.downloadStatus,
        createdAt: now,
        updatedAt: now,
      });
    return this.getById(Number(result.lastInsertRowid))!;
  }
```

5. Add a new `markDownloaded` method (right after `update()`, before `delete()`):

```ts
  markDownloaded(id: number): Item {
    this.db
      .prepare(`UPDATE items SET download_status = 'downloaded', updated_at = @updatedAt WHERE id = @id`)
      .run({ id, updatedAt: new Date().toISOString() });
    return this.getById(id)!;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/db/repositories/items.test.ts`
Expected: PASS (all existing tests plus the new `markDownloaded` test).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/db/repositories/items.ts apps/server/src/db/repositories/items.test.ts
git commit -m "feat: add downloadStatus to Item and ItemsRepository.markDownloaded"
```

---

### Task 3: `ingestRepo` — modos `local_path` e `url` (com sonda temporária)

**Files:**
- Modify: `apps/server/src/ingestion/repo.ts`
- Modify: `apps/server/src/ingestion/repo.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the body of `apps/server/src/ingestion/repo.test.ts` (keep the `createFixtureRepo` helper, replace the `describe('ingestRepo', ...)` block and its two tests with the following four):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/ingestion/repo.test.ts`
Expected: FAIL — `ingestRepo` still takes `{ name, url }`, not `{ name, source }`; TypeScript errors on the test file.

- [ ] **Step 3: Rewrite `ingestRepo`**

Replace `apps/server/src/ingestion/repo.ts` entirely with:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import { readFirstExisting, REPO_CONTENT_CANDIDATES } from '../content.js';
import type { Item } from '../types.js';

export type RepoSource = { kind: 'local_path'; path: string } | { kind: 'url'; url: string };

export interface IngestRepoInput {
  name: string;
  source: RepoSource;
}

export function assertSafeRepoUrl(url: string): void {
  if (url.startsWith('-')) {
    throw new Error('invalid repository url');
  }
}

async function resolveRemoteUrl(localRepoPath: string): Promise<string | null> {
  try {
    const url = await simpleGit(localRepoPath).remote(['get-url', 'origin']);
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

async function probeRemoteReadme(url: string): Promise<string> {
  const tmpDir = path.join(
    os.tmpdir(),
    `skillvault-repo-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  try {
    await simpleGit().clone(url, tmpDir, ['--depth', '1']);
    return readFirstExisting(tmpDir, REPO_CONTENT_CANDIDATES);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  let localPath: string;
  let sourceValue: string;
  let downloadStatus: NewItem['downloadStatus'];
  let readme: string;

  if (input.source.kind === 'local_path') {
    localPath = input.source.path;
    readme = readFirstExisting(localPath, REPO_CONTENT_CANDIDATES);
    sourceValue = (await resolveRemoteUrl(localPath)) ?? localPath;
    downloadStatus = 'local';
  } else {
    assertSafeRepoUrl(input.source.url);
    readme = await probeRemoteReadme(input.source.url);
    localPath = resolveUniqueDir(config.reposDir, input.name).fullPath;
    sourceValue = input.source.url;
    downloadStatus = 'not_downloaded';
  }

  const enrichment = await enrich(config, 'repo', readme || sourceValue);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'repo',
    name: input.name,
    sourceType: input.source.kind,
    sourceValue,
    localPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
    downloadStatus,
  };

  return itemsRepo.create(newItem);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/ingestion/repo.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ingestion/repo.ts apps/server/src/ingestion/repo.test.ts
git commit -m "feat: make repo ingestion lazy (local_path reference or temporary probe clone)"
```

---

### Task 4: `ingestSkill` — passar `downloadStatus: null` explicitamente

**Files:**
- Modify: `apps/server/src/ingestion/skill.ts`

`NewItem.downloadStatus` agora é obrigatório (não opcional). `ingestSkill` nunca lida com download preguiçoso — sempre `null`.

- [ ] **Step 1: Run the existing skill tests to confirm the type error**

Run: `cd apps/server && npx vitest run src/ingestion/skill.test.ts`
Expected: FAIL to compile — `Property 'downloadStatus' is missing in type ... NewItem`.

- [ ] **Step 2: Add the field**

In `apps/server/src/ingestion/skill.ts`, inside `ingestSkill`, update the `newItem` object (only one line added, `downloadStatus: null,` right after `globalInstallStatus`):

```ts
  const newItem: NewItem = {
    type: 'skill',
    name: input.name,
    sourceType,
    sourceValue,
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus,
    downloadStatus: null,
  };
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/ingestion/skill.test.ts`
Expected: PASS (no behavior changed, just the new required field).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ingestion/skill.ts
git commit -m "chore: set downloadStatus null for skill ingestion (field now required on NewItem)"
```

---

### Task 5: MCP — redação automática de segredos

**Files:**
- Modify: `apps/server/src/ingestion/mcp.ts`
- Modify: `apps/server/src/ingestion/mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/src/ingestion/mcp.test.ts` (new `describe` blocks, after the existing one):

```ts
describe('redactSecrets', () => {
  it('redacts keys whose name looks sensitive, including nested objects', async () => {
    const { redactSecrets } = await import('./mcp.js');
    const result = redactSecrets({
      command: 'npx',
      env: {
        STRIPE_SECRET_KEY: 'sk_test_abc123',
        PLAIN_VALUE: 'keep-me',
      },
      headers: {
        Authorization: 'Bearer abc123',
      },
      args: ['-y', '@stripe/mcp'],
    });

    expect(result).toEqual({
      command: 'npx',
      env: {
        STRIPE_SECRET_KEY: '<REDACTED>',
        PLAIN_VALUE: 'keep-me',
      },
      headers: {
        Authorization: '<REDACTED>',
      },
      args: ['-y', '@stripe/mcp'],
    });
  });

  it('does not touch keys with no sensitive-looking name', () => {
    const result = redactSecrets({ type: 'http', url: 'https://mcp.supabase.com/mcp?project_ref=abc' });
    expect(result).toEqual({ type: 'http', url: 'https://mcp.supabase.com/mcp?project_ref=abc' });
  });
});

describe('ingestMcp secret redaction', () => {
  const home = path.join(os.tmpdir(), `skillvault-mcp-redact-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('never writes the real secret to disk or to sourceValue', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const item = await ingestMcp(
      config,
      itemsRepo,
      categoriesRepo,
      {
        name: 'Stripe',
        config: { command: 'npx', env: { STRIPE_SECRET_KEY: 'sk_test_verysecret' } },
      },
      stubEnrich
    );

    const savedConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));
    expect(savedConfig.env.STRIPE_SECRET_KEY).toBe('<REDACTED>');
    expect(item.sourceValue).not.toContain('verysecret');
  });
});
```

Add the needed imports at the top of the file if not already present (`redactSecrets` is imported dynamically above via `await import('./mcp.js')` for the first block, but the second block calls `ingestMcp` directly like the existing test — no new imports needed there since `ingestMcp`, `fs`, `path`, `os`, `createDb`, `ItemsRepository`, `CategoriesRepository`, `loadConfig`, `ensureSkillVaultDirs` are already imported at the top of the existing file).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/ingestion/mcp.test.ts`
Expected: FAIL — `redactSecrets` is not exported from `./mcp.js`; the redaction test's assertions fail against the current (unredacted) behavior.

- [ ] **Step 3: Implement `redactSecrets` and use it in `ingestMcp`**

Replace `apps/server/src/ingestion/mcp.ts` entirely with:

```ts
import fs from 'node:fs';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueFile } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization|bearer/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '<REDACTED>' : redactSecrets(val);
    }
    return result;
  }
  return value;
}

export interface IngestMcpInput {
  name: string;
  config: Record<string, unknown>;
  description?: string;
}

export async function ingestMcp(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestMcpInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  const redactedConfig = redactSecrets(input.config) as Record<string, unknown>;
  const { fullPath } = resolveUniqueFile(config.mcpsDir, input.name, '.json');
  fs.writeFileSync(fullPath, JSON.stringify(redactedConfig, null, 2), 'utf-8');

  const content = `${input.description ?? ''}\n${JSON.stringify(redactedConfig, null, 2)}`;
  const enrichment = await enrich(config, 'mcp', content);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'mcp',
    name: input.name,
    sourceType: 'manual',
    sourceValue: JSON.stringify(redactedConfig),
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
    downloadStatus: null,
  };

  return itemsRepo.create(newItem);
}
```

Note the original raw secret is never read again after this point — the LLM enrichment prompt, the file on disk, and `sourceValue` all use `redactedConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/ingestion/mcp.test.ts`
Expected: PASS (all tests, including the pre-existing "writes the config JSON and saves the item" one, which uses no sensitive-looking keys and is unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ingestion/mcp.ts apps/server/src/ingestion/mcp.test.ts
git commit -m "feat: redact secret-looking values from MCP configs before persisting"
```

---

### Task 6: Rotas — `POST /api/items` (repo com `source_type`) + `POST /api/items/:id/download`

**Files:**
- Modify: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/routes/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/src/routes/items.test.ts`, inside (or right after) the existing `describe('POST /api/items (type=repo)', ...)` block, two new tests using the existing `home`/`config`/`app` setup pattern from that block:

```ts
  it('ingests a repo by local_path without cloning, and captures the git remote', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();
    execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/own/fixture.git'], { cwd: fixtureRepo });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Local', source_type: 'local_path', path: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.downloadStatus).toBe('local');
    expect(body.localPath).toBe(fixtureRepo);
    expect(body.sourceValue).toBe('https://example.com/own/fixture.git');
  });

  it('ingests a repo by url as not_downloaded (no permanent clone yet)', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Remoto', url: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.downloadStatus).toBe('not_downloaded');
    expect(fs.existsSync(body.localPath)).toBe(false);
  });
```

Add a new top-level `describe` block at the end of the file for the download endpoint:

```ts
describe('POST /api/items/:id/download', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-download-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('clones a not_downloaded repo item and flips it to downloaded', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Para Baixar', url: fixtureRepo },
    });
    const created = createResponse.json();
    expect(created.downloadStatus).toBe('not_downloaded');

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${created.id}/download`,
    });

    expect(downloadResponse.statusCode).toBe(200);
    const downloaded = downloadResponse.json();
    expect(downloaded.downloadStatus).toBe('downloaded');
    expect(fs.existsSync(path.join(downloaded.localPath, 'README.md'))).toBe(true);
  });

  it('returns 409 when the item is not pending download', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Local', source_type: 'local_path', path: fixtureRepo },
    });
    const created = createResponse.json();
    expect(created.downloadStatus).toBe('local');

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${created.id}/download`,
    });

    expect(downloadResponse.statusCode).toBe(409);
  });

  it('returns 404 for a nonexistent item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'POST', url: '/api/items/999/download' });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: FAIL — `local_path` repo payload is rejected (route still expects `url` unconditionally for `type=repo`), and `/api/items/:id/download` returns 404 from Fastify's default not-found handler (route doesn't exist yet).

- [ ] **Step 3: Update the route**

In `apps/server/src/routes/items.ts`:

1. Update imports:

```ts
import { ingestRepo, type RepoSource } from '../ingestion/repo.js';
import { downloadRepo } from '../ingestion/download.js';
```

(keep the other existing imports as-is: `ingestSkill`/`SkillSource`, `ingestMcp`, etc.)

2. Replace the `if (type === 'repo') { ... }` block inside `app.post('/api/items', ...)` with:

```ts
        if (type === 'repo') {
          const sourceType = fieldValue(body.source_type);
          let source: RepoSource;

          if (sourceType === 'local_path') {
            const localPath = fieldValue(body.path);
            if (!localPath) return reply.status(400).send({ error: 'path is required for source_type=local_path' });
            source = { kind: 'local_path', path: localPath };
          } else {
            const url = fieldValue(body.url);
            if (!url) return reply.status(400).send({ error: 'url is required for type=repo' });
            source = { kind: 'url', url };
          }

          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { name, source });
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(item);
        }
```

3. Add the new route. Place it right after the `app.delete('/api/items/:id', ...)` handler, before the closing `};` of the exported function:

```ts
    app.post('/api/items/:id/download', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      if (item.type !== 'repo' || item.downloadStatus !== 'not_downloaded') {
        return reply.status(409).send({ error: 'item is not pending download' });
      }

      try {
        const updated = await downloadRepo(itemsRepo, item);
        try {
          regenerate();
        } catch (err) {
          app.log.error(err, 'failed to regenerate index after item download');
        }
        return updated;
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });
```

4. Create `apps/server/src/ingestion/download.ts`:

```ts
import { simpleGit } from 'simple-git';
import type { ItemsRepository } from '../db/repositories/items.js';
import type { Item } from '../types.js';
import { assertSafeRepoUrl } from './repo.js';

export async function downloadRepo(itemsRepo: ItemsRepository, item: Item): Promise<Item> {
  assertSafeRepoUrl(item.sourceValue);
  await simpleGit().clone(item.sourceValue, item.localPath);
  return itemsRepo.markDownloaded(item.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full server test suite to check nothing else broke**

Run: `cd apps/server && npx vitest run`
Expected: PASS — all suites green (this also exercises `app.test.ts` and `content.test.ts`, which touch `Item` shape indirectly).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/items.ts apps/server/src/routes/items.test.ts apps/server/src/ingestion/download.ts
git commit -m "feat: support local_path repo ingestion and POST /api/items/:id/download"
```

---

### Task 7: Índice (`index.json`/`INDEX.md`) — incluir `downloadStatus`

**Files:**
- Modify: `apps/server/src/index/generate.ts`
- Modify: `apps/server/src/index/generate.test.ts`

O índice é o que o Claude Code consome — sem `downloadStatus`, um repo `not_downloaded` apareceria como se já estivesse disponível em `localPath`, o que é enganoso.

- [ ] **Step 1: Write the failing test**

In `apps/server/src/index/generate.test.ts`, add `downloadStatus: null,` to the `item` fixture (right after `globalInstallStatus: null,`):

```ts
const item: Item = {
  id: 1,
  type: 'repo',
  name: 'my-repo',
  sourceType: 'url',
  sourceValue: 'https://example.com/my-repo.git',
  localPath: '/tmp/skillvault/repos/my-repo',
  categoryId: 1,
  summary: 'Resumo',
  utility: 'Utilidade',
  tags: ['tag1'],
  enrichmentSource: 'ollama',
  globalInstallStatus: null,
  downloadStatus: 'not_downloaded',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
```

Update the `toEqual` expectation in `describe('buildIndexEntries', ...)`:

```ts
    expect(entries).toEqual([
      {
        id: 1,
        type: 'repo',
        name: 'my-repo',
        category: 'dev-tools',
        summary: 'Resumo',
        utility: 'Utilidade',
        tags: ['tag1'],
        localPath: '/tmp/skillvault/repos/my-repo',
        downloadStatus: 'not_downloaded',
      },
    ]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/index/generate.test.ts`
Expected: FAIL — `entries` doesn't include `downloadStatus`.

- [ ] **Step 3: Add the field to `IndexEntry` and `buildIndexEntries`**

In `apps/server/src/index/generate.ts`:

```ts
import fs from 'node:fs';
import type { Item, Category } from '../types.js';

export interface IndexEntry {
  id: number;
  type: string;
  name: string;
  category: string | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  localPath: string;
  downloadStatus: string | null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*_`[\]]/g, '\\$&');
}

export function buildIndexEntries(items: Item[], categories: Category[]): IndexEntry[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    category: item.categoryId !== null ? categoryNameById.get(item.categoryId) ?? null : null,
    summary: item.summary,
    utility: item.utility,
    tags: item.tags,
    localPath: item.localPath,
    downloadStatus: item.downloadStatus,
  }));
}
```

Also update `renderIndexMarkdown` so the Markdown index tells Claude Code when a repo still needs downloading — add one line right after the "Caminho" line:

```ts
      lines.push(`- **${escapedName}** (${entry.type}) — ${escapedSummary}`);
      lines.push(`  - Utilidade: ${escapedUtility}`);
      lines.push(`  - Caminho: \`${entry.localPath}\``);
      if (entry.downloadStatus === 'not_downloaded') {
        lines.push(`  - Status: ainda não baixado (pendente de download)`);
      }
      lines.push(`  - Tags: ${entry.tags.join(', ') || 'nenhuma'}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/index/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/index/generate.ts apps/server/src/index/generate.test.ts
git commit -m "feat: expose downloadStatus in index.json/INDEX.md"
```

---

## Frontend

### Task 8: Types + API client — `downloadStatus` e `downloadItem`

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api/client.ts`

- [ ] **Step 1: Add the type and field**

In `apps/web/src/types.ts`, mirror the server:

```ts
export type ItemType = 'skill' | 'repo' | 'mcp';
export type SourceType = 'local_path' | 'upload' | 'url' | 'manual';
export type EnrichmentSource = 'ollama' | 'gemini' | 'manual';
export type GlobalInstallStatus = 'success' | 'failed';
export type DownloadStatus = 'local' | 'not_downloaded' | 'downloaded';

export interface Category {
  id: number;
  name: string;
  createdAt: string;
}

export interface Item {
  id: number;
  type: ItemType;
  name: string;
  sourceType: SourceType;
  sourceValue: string;
  localPath: string;
  categoryId: number | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  enrichmentSource: EnrichmentSource | null;
  globalInstallStatus: GlobalInstallStatus | null;
  downloadStatus: DownloadStatus | null;
  createdAt: string;
  updatedAt: string;
}
```

(Leave `ItemDetail`, `ItemFilters`, `ItemUpdate`, `RecommendedItem`, `RecommendResult`, `Consulta` unchanged.)

- [ ] **Step 2: Add `downloadItem` to the API client**

In `apps/web/src/api/client.ts`, add (right after `deleteItem`):

```ts
export function downloadItem(id: number): Promise<Item> {
  return request<Item>(`/api/items/${id}/download`, { method: 'POST' });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL at this point — `ItemCard.test.tsx`'s `sampleItem()` (and other Item literals in tests) are now missing `downloadStatus`. This is expected; fixed in the next tasks as each file is touched.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/api/client.ts
git commit -m "feat: add downloadStatus to Item and downloadItem to the API client"
```

---

### Task 9: `RepoDownloadAction` component

**Files:**
- Create: `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx`
- Create: `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RepoDownloadAction } from './RepoDownloadAction.js';
import * as client from '../../../../api/client.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'https://example.com/repo-a.git',
    localPath: '/skillvault/repos/repo-a',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: 'not_downloaded',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('RepoDownloadAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing for non-repo items', () => {
    const { container } = render(<RepoDownloadAction item={sampleItem({ type: 'skill', downloadStatus: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a "Local" label when downloadStatus is local', () => {
    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'local' })} />);
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a "Baixado" label when downloadStatus is downloaded', () => {
    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'downloaded' })} />);
    expect(screen.getByText('Baixado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('downloads the item and calls onUpdated when downloadStatus is not_downloaded', async () => {
    const updatedItem = sampleItem({ downloadStatus: 'downloaded' });
    vi.spyOn(client, 'downloadItem').mockResolvedValue(updatedItem);
    const onUpdated = vi.fn();

    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'not_downloaded' })} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedItem));
    expect(client.downloadItem).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`
Expected: FAIL — module `./RepoDownloadAction.js` does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx`:

```tsx
import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { downloadItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';

export interface RepoDownloadActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function RepoDownloadAction({ item, onUpdated }: RepoDownloadActionProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  if (item.type !== 'repo' || !item.downloadStatus) return null;

  if (item.downloadStatus === 'local') {
    return <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Local</span>;
  }

  if (item.downloadStatus === 'downloaded') {
    return <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Baixado</span>;
  }

  async function handleDownload() {
    setStatus('downloading');
    try {
      const updated = await downloadItem(item.id);
      setStatus('idle');
      onUpdated?.(updated);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleDownload} disabled={status === 'downloading'}>
        {status === 'downloading' ? 'Baixando...' : 'Baixar'}
      </Button>
      {status === 'error' && <StatusMessage kind="error">Erro ao baixar.</StatusMessage>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/RepoDownloadAction
git commit -m "feat: add RepoDownloadAction component"
```

---

### Task 10: Fixar `Item` fixtures existentes (typecheck)

**Files:**
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`
- Modify: `apps/web/src/pages/AddPage.test.tsx` (se construir `Item` literais)

- [ ] **Step 1: Confirm the compile errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL — a list of files with `Item`/`RecommendedItem` object literals missing `downloadStatus`.

- [ ] **Step 2: Add `downloadStatus: null` to every `Item`/`RecommendedItem` fixture reported by tsc**

For each file tsc reports, add `downloadStatus: null,` next to the existing `globalInstallStatus: null,` line in every sample item builder (e.g. in `ItemCard.test.tsx`'s `sampleItem()` shown earlier in this session — add the field there the same way). Apply the identical one-line addition to every other fixture function tsc flags (`CatalogPage.test.tsx`, `ItemDetailPage.test.tsx`, `RecommendPage.test.tsx`, and `AddPage.test.tsx` if it constructs a full `Item`). Do not change any other field.

- [ ] **Step 3: Run typecheck again**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS — zero errors.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — all suites green (behavior unchanged, only fixtures gained a field).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "chore: add downloadStatus to existing Item test fixtures"
```

---

### Task 11: Ligar `RepoDownloadAction` ao `ItemCard` (catálogo + recomendador)

**Files:**
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.tsx`
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`:

```tsx
  it('shows the download action for a repo pending download', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ downloadStatus: 'not_downloaded' })} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });
```

(This requires `sampleItem`'s default `downloadStatus` — set it to `'not_downloaded'` in the default object built by `sampleItem()`, from Task 10, or pass it explicitly as shown above; either is fine as long as this test passes.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
Expected: FAIL — no "Baixar" button rendered yet.

- [ ] **Step 3: Wire `RepoDownloadAction` into `ItemCard`**

In `apps/web/src/components/ui/data-display/ItemCard/ItemCard.tsx`, add the import and prop, and render the action below the `localPath` `<code>` block:

```tsx
import { Link } from 'react-router-dom';
import type { Item } from '../../../../types.js';
import { TypeBadge } from '../TypeBadge/TypeBadge.js';
import { Tag } from '../Tag/Tag.js';
import { RepoDownloadAction } from '../RepoDownloadAction/RepoDownloadAction.js';

export interface ItemCardProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function ItemCard({ item, onUpdated }: ItemCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-4)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        fontFamily: 'var(--font-sans)',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <Link
          to={`/items/${item.id}`}
          style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}
        >
          {item.name}
        </Link>
        <TypeBadge type={item.type} size="sm" />
      </div>
      {item.summary && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.summary}</p>
      )}
      {item.utility && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{item.utility}</p>}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {item.localPath && (
        <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {item.localPath}
        </code>
      )}
      <RepoDownloadAction item={item} onUpdated={onUpdated} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `onUpdated` through `CatalogPage`**

In `apps/web/src/pages/CatalogPage.tsx`, add a handler and pass it down:

```tsx
  const refetchCategories = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const handleItemUpdated = useCallback((updated: Item) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }, []);
```

And update the render call:

```tsx
              {group.items.map((item) => (
                <ItemCard key={item.id} item={item} onUpdated={handleItemUpdated} />
              ))}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/data-display/ItemCard apps/web/src/pages/CatalogPage.tsx
git commit -m "feat: show download action on catalog item cards"
```

---

### Task 12: Ligar `RepoDownloadAction` ao `RecommendPage`

**Files:**
- Modify: `apps/web/src/pages/RecommendPage.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/pages/RecommendPage.test.tsx`, inside `describe('RecommendPage', ...)`:

```tsx
  it('shows a download action for a repo result pending download', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [
        {
          ...sampleItem({ type: 'repo', downloadStatus: 'not_downloaded' }),
          motivo: 'Já resolve o que você precisa',
        },
      ],
      mcps: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });
```

(`sampleItem` gained `downloadStatus: null` as its default in Task 10 — this test overrides it to `'not_downloaded'` and sets `type: 'repo'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: FAIL — no "Baixar" button rendered in the results column yet.

- [ ] **Step 3: Wire `RepoDownloadAction` into `ResultColumn`**

Replace `apps/web/src/pages/RecommendPage.tsx` with:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations, listConsultas } from '../api/client.js';
import type { Consulta, Item, RecommendedItem, RecommendResult } from '../types.js';
import { Textarea } from '../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';

const EMPTY_MESSAGES = {
  skills: 'Nenhuma skill do catálogo cobre essa necessidade.',
  repos: 'Nenhum repositório do catálogo cobre essa necessidade.',
  mcps: 'Nenhum MCP do catálogo cobre essa necessidade.',
};

interface ResultColumnProps {
  title: string;
  items: RecommendedItem[];
  emptyMessage: string;
  onItemUpdated: (item: Item) => void;
}

function ResultColumn({ title, items, emptyMessage, onItemUpdated }: ResultColumnProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1, minWidth: 220 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--fw-title)',
          color: 'var(--color-text)',
        }}
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>{emptyMessage}</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 'var(--space-3)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Link to={`/items/${item.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              {item.name}
            </Link>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{item.motivo}</p>
            <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {item.localPath}
            </code>
            <RepoDownloadAction item={item} onUpdated={onItemUpdated} />
          </div>
        ))
      )}
    </section>
  );
}

export function RecommendPage() {
  const [ideia, setIdeia] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [consultas, setConsultas] = useState<Consulta[]>([]);

  useEffect(() => {
    listConsultas()
      .then(setConsultas)
      .catch(() => {});
  }, [result]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    setError('');
    setResult(null);
    try {
      const data = await getRecommendations(ideia);
      setResult(data);
      setStatus('idle');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  function handleItemUpdated(updated: Item) {
    setResult((prev) => {
      if (!prev) return prev;
      const patch = (list: RecommendedItem[]) =>
        list.map((it) => (it.id === updated.id ? { ...it, ...updated } : it));
      return { skills: patch(prev.skills), repos: patch(prev.repos), mcps: patch(prev.mcps) };
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          letterSpacing: 'var(--ls-display)',
          color: 'var(--color-text)',
        }}
      >
        Recomendar
      </h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
        <Textarea label="Ideia do projeto" value={ideia} onChange={(e) => setIdeia(e.target.value)} required />
        <div>
          <Button type="submit" disabled={status === 'submitting'}>
            Recomendar
          </Button>
        </div>
        {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
      </form>

      {result && (
        <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          <ResultColumn title="Skills" items={result.skills} emptyMessage={EMPTY_MESSAGES.skills} onItemUpdated={handleItemUpdated} />
          <ResultColumn title="Repos" items={result.repos} emptyMessage={EMPTY_MESSAGES.repos} onItemUpdated={handleItemUpdated} />
          <ResultColumn title="MCPs" items={result.mcps} emptyMessage={EMPTY_MESSAGES.mcps} onItemUpdated={handleItemUpdated} />
        </div>
      )}

      {consultas.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>Histórico</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {consultas.map((consulta) => (
              <li key={consulta.id} style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                {consulta.ideia} — {new Date(consulta.createdAt).toLocaleString('pt-BR')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/RecommendPage.tsx apps/web/src/pages/RecommendPage.test.tsx
git commit -m "feat: show download action on recommend page results"
```

---

### Task 13: Ligar `RepoDownloadAction` ao `ItemDetailPage`

**Files:**
- Modify: `apps/web/src/pages/ItemDetailPage.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/pages/ItemDetailPage.test.tsx`, inside `describe('ItemDetailPage', ...)`:

```tsx
  it('shows a download action for a repo pending download', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail({ downloadStatus: 'not_downloaded' }));

    renderWithRoute('1');

    expect(await screen.findByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });
```

(`sampleDetail`'s default `type` is already `'repo'`; it gained `downloadStatus: null` as its default in Task 10 — this test overrides it to `'not_downloaded'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/ItemDetailPage.test.tsx`
Expected: FAIL — no "Baixar" button rendered yet.

- [ ] **Step 3: Wire `RepoDownloadAction` into `ItemDetailPage`**

In `apps/web/src/pages/ItemDetailPage.tsx`, add the import:

```tsx
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';
```

Add it right after the existing "copiar caminho" `<div>` block (the one containing the `<code>{item.localPath}</code>` and the `Button` with `handleCopy`):

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <code
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          {item.localPath}
        </code>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name={copied ? 'check' : 'copy'} size={13} />}
          onClick={handleCopy}
        >
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </Button>
        <RepoDownloadAction item={item} onUpdated={(updated) => setItem({ ...item, ...updated })} />
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/ItemDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the entire frontend suite + typecheck one more time**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ItemDetailPage.tsx apps/web/src/pages/ItemDetailPage.test.tsx
git commit -m "feat: show download action on item detail page"
```

---

### Task 14: Rebuild do frontend servido pelo backend

**Files:** nenhum (apenas build)

O `launch.vbs`/servidor único serve `apps/web/dist`. Depois das mudanças de frontend, esse bundle precisa ser reconstruído para o app rodando localmente refletir as mudanças.

- [ ] **Step 1: Rebuild**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run build --workspace apps/web` (ou `rebuild.bat`, que faz o mesmo).
Expected: build finishes with no errors, `apps/web/dist` updated.

- [ ] **Step 2: Full workspace test run (both packages) as a final gate**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run test`
Expected: PASS — both `apps/server` and `apps/web` suites green.

No commit needed for this task (build artifact is not tracked — check `.gitignore` covers `apps/web/dist` and `node_modules`, which the repo already does per `PROJECT_CONTEXT.md`).

---

## População do catálogo (execução, não é código de produto)

### Task 15: Popular repos, skills e MCPs via API

Esta tarefa não segue TDD — é execução operacional contra o servidor já rodando (backend ajustado pelas tarefas 1–14). Nada aqui é commitado no repositório do SkillVault; o script é um utilitário de uso único.

**Files:**
- Create (fora do repo git, no scratchpad): `C:\Users\Diogo\AppData\Local\Temp\claude\...\scratchpad\populate-catalog.mjs`

- [ ] **Step 1: Start the server**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run dev` (ou, se preferir o processo único já buildado na Task 14, `launch.vbs`).
Expected: backend respondendo em `http://localhost:3001/api/health` com `{"status":"ok"}`.

- [ ] **Step 2: Stage the two skills that don't have a standalone SKILL.md-only directory**

`get-shit-done` (plugin) não tem `SKILL.md` na raiz — o conteúdo real e representativo do plugin inteiro está em `~/.claude/get-shit-done/workflows/help.md`. `skill-creator` é um arquivo solto (`~/.claude/skills/skill-creator.md`), não uma pasta. Para os dois, copiar o conteúdo real para uma pasta temporária nomeada `SKILL.md` (a ingestão de skill por `local_path` exige uma pasta contendo `SKILL.md`/`README.md`):

```powershell
$stage = "C:\Users\Diogo\AppData\Local\Temp\claude\c--Users-Diogo-Projetos-SkillVault\93ad1a25-50d1-44e9-983d-4db17051732b\scratchpad\stage"
New-Item -ItemType Directory -Force "$stage\get-shit-done" | Out-Null
Copy-Item "C:\Users\Diogo\.claude\get-shit-done\workflows\help.md" "$stage\get-shit-done\SKILL.md"
New-Item -ItemType Directory -Force "$stage\skill-creator" | Out-Null
Copy-Item "C:\Users\Diogo\.claude\skills\skill-creator.md" "$stage\skill-creator\SKILL.md"
```

- [ ] **Step 3: Write and run the population script**

Create `populate-catalog.mjs` in the scratchpad directory:

```js
const BASE = 'http://localhost:3001';
const STAGE = 'C:\\Users\\Diogo\\AppData\\Local\\Temp\\claude\\c--Users-Diogo-Projetos-SkillVault\\93ad1a25-50d1-44e9-983d-4db17051732b\\scratchpad\\stage';

async function post(payload) {
  const res = await fetch(`${BASE}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`FAILED ${payload.type} "${payload.name}":`, body.error);
  } else {
    console.log(`OK ${payload.type} "${payload.name}" -> id ${body.id}, downloadStatus=${body.downloadStatus}`);
  }
}

const repos = [
  ['Sketchain', 'C:\\Users\\Diogo\\Projetos\\Sketchain'],
  ['Gifittome', 'C:\\Users\\Diogo\\Projetos\\Gifittome'],
  ['GuideLife', 'C:\\Users\\Diogo\\Projetos\\GuideLife'],
  ['Quiron', 'C:\\Users\\Diogo\\Projetos\\Quiron'],
  ['DeltaBrain', 'C:\\Users\\Diogo\\Projetos\\DeltaBrain'],
  ['co-writer', 'C:\\Users\\Diogo\\Projetos\\co-writer'],
  ['Stack Learning', 'C:\\Users\\Diogo\\Projetos\\Stack Learning'],
  ['LeadChain', 'C:\\Users\\Diogo\\Projetos\\LeadChain'],
  ['SocIA Selling', 'C:\\Users\\Diogo\\Projetos\\SocIA Selling'],
  ['Relax Place', 'C:\\Users\\Diogo\\Projetos\\Relax Place'],
];

const skills = [
  ['get-shit-done', `${STAGE}\\get-shit-done`],
  ['superpowers', 'C:\\Users\\Diogo\\.claude\\plugins\\cache\\superpowers-marketplace\\superpowers\\5.1.0\\skills\\using-superpowers'],
  ['firecrawl', 'C:\\Users\\Diogo\\.agents\\skills\\firecrawl'],
  ['frontend-design', 'C:\\Users\\Diogo\\.agents\\skills\\frontend-design'],
  ['napkin', 'C:\\Users\\Diogo\\.claude\\skills\\napkin'],
  ['playwright-cli', 'C:\\Users\\Diogo\\.claude\\skills\\playwright-cli'],
  ['image-prompt', 'C:\\Users\\Diogo\\.claude\\skills\\image-prompt'],
  ['interface-design', 'C:\\Users\\Diogo\\.claude\\skills\\interface-design'],
  ['skill-creator', `${STAGE}\\skill-creator`],
  ['docx', 'C:\\Users\\Diogo\\.agents\\skills\\docx'],
  ['pdf', 'C:\\Users\\Diogo\\.agents\\skills\\pdf'],
  ['pptx', 'C:\\Users\\Diogo\\.agents\\skills\\pptx'],
  ['xlsx', 'C:\\Users\\Diogo\\.agents\\skills\\xlsx'],
  ['find-skills', 'C:\\Users\\Diogo\\.agents\\skills\\find-skills'],
];

async function loadMcps() {
  const fs = await import('node:fs');
  const claudeJson = JSON.parse(fs.readFileSync('C:\\Users\\Diogo\\.claude.json', 'utf-8'));
  const entries = [];
  for (const [name, cfg] of Object.entries(claudeJson.mcpServers ?? {})) {
    entries.push([name, cfg]);
  }
  const quiron = claudeJson.projects?.['C:/Users/Diogo/Projetos/Quirom'] ?? claudeJson.projects?.['C:\\Users\\Diogo\\Projetos\\Quirom'];
  for (const [name, cfg] of Object.entries(quiron?.mcpServers ?? {})) {
    entries.push([name, cfg]);
  }
  return entries;
}

async function main() {
  for (const [name, path] of repos) {
    await post({ type: 'repo', name, source_type: 'local_path', path });
  }
  for (const [name, path] of skills) {
    await post({ type: 'skill', name, source_type: 'local_path', path });
  }
  for (const [name, config] of await loadMcps()) {
    await post({ type: 'mcp', name, config });
  }
}

main();
```

Run: `node "C:\Users\Diogo\AppData\Local\Temp\claude\c--Users-Diogo-Projetos-SkillVault\93ad1a25-50d1-44e9-983d-4db17051732b\scratchpad\populate-catalog.mjs"`

Expected: 10 lines `OK repo "..." -> id N, downloadStatus=local`, 14 lines `OK skill "..." -> id N, downloadStatus=`, 5 lines `OK mcp "..." -> id N, downloadStatus=` (repos/skills têm `downloadStatus` visível; MCPs mostram `downloadStatus=null`, o que é esperado). Nenhuma linha `FAILED`.

- [ ] **Step 4: Verify no secrets leaked into the vault**

Run: `Select-String -Path "C:\Users\Diogo\skillvault\mcps\*.json" -Pattern "sk_test_|sbp_"`
Expected: no matches (both real secrets were redacted to `<REDACTED>` by `ingestMcp`).

- [ ] **Step 5: Spot-check the generated index**

Run: `Get-Content "C:\Users\Diogo\skillvault\INDEX.md" | Select-String "Sketchain|get-shit-done|stripe"`
Expected: all three appear, grouped under whatever categories the LLM enrichment assigned.

No commit for this task (data lives outside the git repo, in `~/skillvault/`, per the project's existing convention).
