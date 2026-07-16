# SkillVault Backend & Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SkillVault monorepo and backend: SQLite-backed catalog of skills/repos/MCPs, ingestion pipelines for all three types (clone/copy/upload + LLM enrichment with Ollama→Gemini→manual fallback), CRUD REST API, and `index.json`/`INDEX.md` generation — no frontend yet.

**Architecture:** npm-workspaces monorepo (`apps/server` only for now; `apps/web` added in a later plan). Fastify + TypeScript (ESM/NodeNext) backend, better-sqlite3 for storage, `simple-git` for cloning, `adm-zip` for skill zip uploads, `@fastify/multipart` for file uploads. All catalog data (DB, cloned repos, skills, MCP configs, generated index) lives outside the code repo at `~/skillvault` (env override: `SKILLVAULT_HOME`).

**Tech Stack:** TypeScript, Node.js, Fastify 5, better-sqlite3, simple-git, adm-zip, @fastify/multipart, dotenv, Vitest.

**Related spec:** `docs/superpowers/specs/2026-07-16-skillvault-design.md`

**Scope note:** This plan covers entregáveis 1–3 and 6 of the original request (setup, ingestion pipelines, LLM enrichment, index generation) for the backend only. Catalog/Add/Recommend UI, `/api/recommend`, and PWA are separate follow-up plans (each produces working, testable software on its own).

---

## Task 1: Monorepo scaffold + Fastify health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/server.ts`
- Test: `apps/server/src/app.test.ts`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "skillvault",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "npm run dev -w apps/server",
    "test": "npm run test -w apps/server"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Create `apps/server/package.json`**

```json
{
  "name": "@skillvault/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `apps/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 6: Install dependencies**

Run (from repo root `C:\Users\Diogo\Projetos\SkillVault`): `npm install`
Expected: installs Fastify + devDependencies for `apps/server`, creates root `node_modules` and `package-lock.json`.

- [ ] **Step 7: Write the failing test**

`apps/server/src/app.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `app.ts` does not exist / `buildApp` not found.

- [ ] **Step 9: Implement `apps/server/src/app.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 10: Implement `apps/server/src/server.ts`**

```ts
import { buildApp } from './app.js';

const app = buildApp();

app.listen({ port: 3001, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`SkillVault server listening at ${address}`);
});
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.base.json apps/server
git commit -m "feat: scaffold monorepo with Fastify health check"
```

---

## Task 2: Config module (env vars, data directories)

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/src/config.ts`
- Test: `apps/server/src/config.test.ts`

- [ ] **Step 1: Add `dotenv` dependency**

In `apps/server/package.json`, add to `dependencies`:

```json
"dotenv": "^16.4.7"
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`apps/server/src/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, ensureSkillVaultDirs } from './config.js';

describe('loadConfig', () => {
  it('falls back to ~/skillvault when SKILLVAULT_HOME is not set', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.skillvaultHome).toBe(path.join(os.homedir(), 'skillvault'));
    expect(config.dbPath).toBe(path.join(config.skillvaultHome, 'skillvault.db'));
    expect(config.reposDir).toBe(path.join(config.skillvaultHome, 'repos'));
    expect(config.port).toBe(3001);
  });

  it('honors overrides', () => {
    const config = loadConfig({
      SKILLVAULT_HOME: '/tmp/custom-home',
      OLLAMA_MODEL: 'qwen2.5',
      GEMINI_API_KEY: 'abc123',
      PORT: '4000',
    } as NodeJS.ProcessEnv);
    expect(config.skillvaultHome).toBe('/tmp/custom-home');
    expect(config.ollamaModel).toBe('qwen2.5');
    expect(config.geminiApiKey).toBe('abc123');
    expect(config.port).toBe(4000);
  });
});

describe('ensureSkillVaultDirs', () => {
  const tempHome = path.join(os.tmpdir(), `skillvault-config-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('creates the home, repos, skills, and mcps directories', () => {
    const config = loadConfig({ SKILLVAULT_HOME: tempHome } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    expect(fs.existsSync(config.reposDir)).toBe(true);
    expect(fs.existsSync(config.skillsDir)).toBe(true);
    expect(fs.existsSync(config.mcpsDir)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `config.ts` does not exist.

- [ ] **Step 4: Implement `apps/server/src/config.ts`**

```ts
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface SkillVaultConfig {
  skillvaultHome: string;
  dbPath: string;
  reposDir: string;
  skillsDir: string;
  mcpsDir: string;
  indexJsonPath: string;
  indexMdPath: string;
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SkillVaultConfig {
  const skillvaultHome = env.SKILLVAULT_HOME || path.join(os.homedir(), 'skillvault');

  return {
    skillvaultHome,
    dbPath: path.join(skillvaultHome, 'skillvault.db'),
    reposDir: path.join(skillvaultHome, 'repos'),
    skillsDir: path.join(skillvaultHome, 'skills'),
    mcpsDir: path.join(skillvaultHome, 'mcps'),
    indexJsonPath: path.join(skillvaultHome, 'index.json'),
    indexMdPath: path.join(skillvaultHome, 'INDEX.md'),
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: env.OLLAMA_MODEL || 'llama3.2',
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiModel: env.GEMINI_MODEL || 'gemini-2.0-flash',
    port: Number(env.PORT) || 3001,
  };
}

export function ensureSkillVaultDirs(config: SkillVaultConfig): void {
  for (const dir of [config.skillvaultHome, config.reposDir, config.skillsDir, config.mcpsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/src/config.ts apps/server/src/config.test.ts package-lock.json
git commit -m "feat: add SkillVault config module"
```

---

## Task 3: Types + SQLite schema + connection; wire DB into the app

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/src/types.ts`
- Create: `apps/server/src/types/fastify.d.ts`
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/connection.ts`
- Test: `apps/server/src/db/connection.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Add `better-sqlite3` dependency**

In `apps/server/package.json`, add to `dependencies`:

```json
"better-sqlite3": "^11.7.0"
```

Add to `devDependencies`:

```json
"@types/better-sqlite3": "^7.6.12"
```

Run: `npm install`

- [ ] **Step 2: Create `apps/server/src/types.ts`**

```ts
export type ItemType = 'skill' | 'repo' | 'mcp';
export type SourceType = 'local_path' | 'upload' | 'url' | 'manual';
export type EnrichmentSource = 'ollama' | 'gemini' | 'manual';
export type GlobalInstallStatus = 'success' | 'failed';

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
  createdAt: string;
  updatedAt: string;
}

export interface EnrichmentResult {
  summary: string;
  utility: string;
  category: string;
  tags: string[];
  source: EnrichmentSource;
}
```

- [ ] **Step 3: Create `apps/server/src/types/fastify.d.ts`**

```ts
import 'fastify';
import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
  }
}
```

- [ ] **Step 4: Create `apps/server/src/db/schema.ts`**

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

- [ ] **Step 5: Write the failing test for the connection module**

`apps/server/src/db/connection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDb } from './connection.js';

describe('createDb', () => {
  it('creates categories, items, and consultas tables', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('categories');
    expect(tables).toContain('items');
    expect(tables).toContain('consultas');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `connection.ts` does not exist.

- [ ] **Step 7: Implement `apps/server/src/db/connection.ts`**

```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 9: Wire the DB into `buildApp` — update `apps/server/src/app.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

export interface BuildAppOptions {
  db: Database.Database;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 10: Update `apps/server/src/app.test.ts` for the new signature**

```ts
import { describe, it, expect } from 'vitest';
import { createDb } from './db/connection.js';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp({ db: createDb(':memory:') });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 11: Update `apps/server/src/server.ts`**

```ts
import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig, ensureSkillVaultDirs } from './config.js';
import { createDb } from './db/connection.js';

const config = loadConfig();
ensureSkillVaultDirs(config);
const db = createDb(config.dbPath);
const app = buildApp({ db });

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`SkillVault server listening at ${address}`);
});
```

- [ ] **Step 12: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS (both `app.test.ts` and `db/connection.test.ts`)

- [ ] **Step 13: Commit**

```bash
git add apps/server package-lock.json
git commit -m "feat: add SQLite schema/connection and wire db into app"
```

---

## Task 4: Slug utility (unique local names)

**Files:**
- Create: `apps/server/src/slug.ts`
- Test: `apps/server/src/slug.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/slug.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugify, resolveUniqueDir, resolveUniqueFile } from './slug.js';

describe('slugify', () => {
  it('lowercases, strips accents, and hyphenates', () => {
    expect(slugify('Meu Repositório Incrível!')).toBe('meu-repositorio-incrivel');
  });

  it('falls back to "item" for empty input', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('resolveUniqueDir', () => {
  const parent = path.join(os.tmpdir(), `skillvault-slug-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('returns the base slug when free', () => {
    fs.mkdirSync(parent, { recursive: true });
    const { slug } = resolveUniqueDir(parent, 'My Skill');
    expect(slug).toBe('my-skill');
  });

  it('appends a numeric suffix on collision', () => {
    fs.mkdirSync(path.join(parent, 'my-skill'), { recursive: true });
    const { slug } = resolveUniqueDir(parent, 'My Skill');
    expect(slug).toBe('my-skill-2');
  });
});

describe('resolveUniqueFile', () => {
  const parent = path.join(os.tmpdir(), `skillvault-slug-file-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('appends a numeric suffix when the file already exists', () => {
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(path.join(parent, 'my-mcp.json'), '{}');
    const { slug, fullPath } = resolveUniqueFile(parent, 'My MCP', '.json');
    expect(slug).toBe('my-mcp-2');
    expect(fullPath).toBe(path.join(parent, 'my-mcp-2.json'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `slug.ts` does not exist.

- [ ] **Step 3: Implement `apps/server/src/slug.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

export function resolveUniqueDir(parentDir: string, name: string): { slug: string; fullPath: string } {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return { slug: candidate, fullPath: path.join(parentDir, candidate) };
}

export function resolveUniqueFile(
  parentDir: string,
  name: string,
  extension: string
): { slug: string; fullPath: string } {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(path.join(parentDir, `${candidate}${extension}`))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return { slug: candidate, fullPath: path.join(parentDir, `${candidate}${extension}`) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/slug.ts apps/server/src/slug.test.ts
git commit -m "feat: add slug utility for unique local names"
```

---

## Task 5: Categories repository + API routes

**Files:**
- Create: `apps/server/src/db/repositories/categories.ts`
- Test: `apps/server/src/db/repositories/categories.test.ts`
- Create: `apps/server/src/routes/categories.ts`
- Test: `apps/server/src/routes/categories.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing repository test**

`apps/server/src/db/repositories/categories.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { CategoriesRepository } from './categories.js';

describe('CategoriesRepository', () => {
  let db: Database.Database;
  let repo: CategoriesRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new CategoriesRepository(db);
  });

  it('creates and lists categories', () => {
    repo.create('dev-tools');
    repo.create('automação');
    expect(repo.list().map((c) => c.name)).toEqual(['automação', 'dev-tools']);
  });

  it('findOrCreate reuses an existing category by name', () => {
    const first = repo.findOrCreate('dev-tools');
    const second = repo.findOrCreate('dev-tools');
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('renames a category', () => {
    const category = repo.create('dev-tools');
    const renamed = repo.rename(category.id, 'ferramentas-dev');
    expect(renamed?.name).toBe('ferramentas-dev');
  });

  it('merges one category into another and reassigns items', () => {
    const source = repo.create('a-mesclar');
    const target = repo.create('categoria-final');
    db.prepare(
      `INSERT INTO items (type, name, source_type, source_value, local_path, category_id, tags, created_at, updated_at)
       VALUES ('skill', 'x', 'manual', 'x', '/tmp/x', ?, '[]', '2026-01-01', '2026-01-01')`
    ).run(source.id);

    repo.merge(source.id, target.id);

    const item = db.prepare('SELECT category_id FROM items WHERE name = ?').get('x') as {
      category_id: number;
    };
    expect(item.category_id).toBe(target.id);
    expect(repo.list().map((c) => c.id)).not.toContain(source.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `categories.ts` repository does not exist.

- [ ] **Step 3: Implement `apps/server/src/db/repositories/categories.ts`**

```ts
import type Database from 'better-sqlite3';
import type { Category } from '../../types.js';

interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
}

function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export class CategoriesRepository {
  constructor(private db: Database.Database) {}

  list(): Category[] {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY name').all() as CategoryRow[];
    return rows.map(toCategory);
  }

  create(name: string): Category {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO categories (name, created_at) VALUES (?, ?)')
      .run(name, createdAt);
    return { id: Number(result.lastInsertRowid), name, createdAt };
  }

  findByName(name: string): Category | undefined {
    const row = this.db.prepare('SELECT * FROM categories WHERE name = ?').get(name) as
      | CategoryRow
      | undefined;
    return row ? toCategory(row) : undefined;
  }

  findOrCreate(name: string): Category {
    return this.findByName(name) ?? this.create(name);
  }

  rename(id: number, name: string): Category | undefined {
    this.db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | CategoryRow
      | undefined;
    return row ? toCategory(row) : undefined;
  }

  merge(sourceId: number, targetId: number): void {
    this.db.prepare('UPDATE items SET category_id = ? WHERE category_id = ?').run(targetId, sourceId);
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(sourceId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Write the failing route test**

`apps/server/src/routes/categories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../db/connection.js';
import { buildApp } from '../app.js';

describe('categories routes', () => {
  it('creates, lists, renames, and merges categories', async () => {
    const app = buildApp({ db: createDb(':memory:') });

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
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `/api/categories` route not registered.

- [ ] **Step 7: Implement `apps/server/src/routes/categories.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { CategoriesRepository } from '../db/repositories/categories.js';

export async function categoriesRoutes(app: FastifyInstance) {
  const repo = new CategoriesRepository(app.db);

  app.get('/api/categories', async () => repo.list());

  app.post<{ Body: { name: string } }>('/api/categories', async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: 'name is required' });
    return reply.status(201).send(repo.create(name));
  });

  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/categories/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const category = repo.rename(id, request.body.name.trim());
      if (!category) return reply.status(404).send({ error: 'category not found' });
      return category;
    }
  );

  app.post<{ Params: { id: string }; Body: { target_id: number } }>(
    '/api/categories/:id/merge',
    async (request, reply) => {
      const sourceId = Number(request.params.id);
      repo.merge(sourceId, request.body.target_id);
      return reply.status(204).send();
    }
  );
}
```

- [ ] **Step 8: Register the route plugin — update `apps/server/src/app.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { categoriesRoutes } from './routes/categories.js';

export interface BuildAppOptions {
  db: Database.Database;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);

  return app;
}
```

- [ ] **Step 9: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/db/repositories/categories.ts apps/server/src/db/repositories/categories.test.ts apps/server/src/routes/categories.ts apps/server/src/routes/categories.test.ts apps/server/src/app.ts
git commit -m "feat: add categories repository and CRUD/merge routes"
```

---

## Task 6: Items repository

**Files:**
- Create: `apps/server/src/db/repositories/items.ts`
- Test: `apps/server/src/db/repositories/items.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/db/repositories/items.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { ItemsRepository, type NewItem } from './items.js';

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
    ...overrides,
  };
}

describe('ItemsRepository', () => {
  let db: Database.Database;
  let repo: ItemsRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new ItemsRepository(db);
  });

  it('creates and fetches an item by id', () => {
    const created = repo.create(sampleItem());
    const fetched = repo.getById(created.id);
    expect(fetched).toEqual(created);
    expect(fetched?.tags).toEqual(['exemplo', 'dev-tools']);
  });

  it('lists items filtered by type, query, and tag', () => {
    repo.create(sampleItem({ name: 'repo-a', type: 'repo', tags: ['dados'] }));
    repo.create(sampleItem({ name: 'skill-b', type: 'skill', tags: ['automacao'] }));

    expect(repo.list({ type: 'skill' }).map((i) => i.name)).toEqual(['skill-b']);
    expect(repo.list({ q: 'repo-a' }).map((i) => i.name)).toEqual(['repo-a']);
    expect(repo.list({ tag: 'automacao' }).map((i) => i.name)).toEqual(['skill-b']);
  });

  it('updates category, summary, utility, and tags', () => {
    const created = repo.create(sampleItem());
    const updated = repo.update(created.id, { summary: 'Novo resumo', tags: ['novo'] });
    expect(updated?.summary).toBe('Novo resumo');
    expect(updated?.tags).toEqual(['novo']);
    expect(updated?.utility).toBe(created.utility);
  });

  it('deletes an item', () => {
    const created = repo.create(sampleItem());
    repo.delete(created.id);
    expect(repo.getById(created.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `items.ts` repository does not exist.

- [ ] **Step 3: Implement `apps/server/src/db/repositories/items.ts`**

```ts
import type Database from 'better-sqlite3';
import type { Item, ItemType, SourceType, EnrichmentSource, GlobalInstallStatus } from '../../types.js';

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
  created_at: string;
  updated_at: string;
}

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
}

export interface ItemUpdate {
  categoryId?: number | null;
  summary?: string | null;
  utility?: string | null;
  tags?: string[];
}

export interface ItemFilters {
  q?: string;
  type?: ItemType;
  categoryId?: number;
  tag?: string;
}

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ItemsRepository {
  constructor(private db: Database.Database) {}

  create(input: NewItem): Item {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO items (
          type, name, source_type, source_value, local_path, category_id,
          summary, utility, tags, enrichment_source, global_install_status,
          created_at, updated_at
        ) VALUES (@type, @name, @sourceType, @sourceValue, @localPath, @categoryId,
          @summary, @utility, @tags, @enrichmentSource, @globalInstallStatus,
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
        createdAt: now,
        updatedAt: now,
      });
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Item | undefined {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    return row ? toItem(row) : undefined;
  }

  list(filters: ItemFilters = {}): Item[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.type) {
      clauses.push('type = @type');
      params.type = filters.type;
    }
    if (filters.categoryId !== undefined) {
      clauses.push('category_id = @categoryId');
      params.categoryId = filters.categoryId;
    }
    if (filters.q) {
      clauses.push('(name LIKE @q OR summary LIKE @q OR utility LIKE @q)');
      params.q = `%${filters.q}%`;
    }
    if (filters.tag) {
      clauses.push('tags LIKE @tag');
      params.tag = `%"${filters.tag}"%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM items ${where} ORDER BY created_at DESC`)
      .all(params) as ItemRow[];
    return rows.map(toItem);
  }

  update(id: number, patch: ItemUpdate): Item | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const categoryId = patch.categoryId !== undefined ? patch.categoryId : existing.categoryId;
    const summary = patch.summary !== undefined ? patch.summary : existing.summary;
    const utility = patch.utility !== undefined ? patch.utility : existing.utility;
    const tags = patch.tags !== undefined ? patch.tags : existing.tags;

    this.db
      .prepare(
        `UPDATE items SET category_id = @categoryId, summary = @summary, utility = @utility,
         tags = @tags, updated_at = @updatedAt WHERE id = @id`
      )
      .run({
        id,
        categoryId,
        summary,
        utility,
        tags: JSON.stringify(tags),
        updatedAt: new Date().toISOString(),
      });
    return this.getById(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/repositories/items.ts apps/server/src/db/repositories/items.test.ts
git commit -m "feat: add items repository"
```

---

## Task 7: Index generation (`index.json` + `INDEX.md`)

**Files:**
- Create: `apps/server/src/index/generate.ts`
- Test: `apps/server/src/index/generate.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/index/generate.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Item, Category } from '../types.js';
import { buildIndexEntries, renderIndexMarkdown, writeIndexFiles } from './generate.js';

const category: Category = { id: 1, name: 'dev-tools', createdAt: '2026-01-01' };

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
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('buildIndexEntries', () => {
  it('resolves category names and preserves item fields', () => {
    const entries = buildIndexEntries([item], [category]);
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
      },
    ]);
  });
});

describe('renderIndexMarkdown', () => {
  it('groups entries by category', () => {
    const md = renderIndexMarkdown(buildIndexEntries([item], [category]));
    expect(md).toContain('## dev-tools');
    expect(md).toContain('my-repo');
  });
});

describe('writeIndexFiles', () => {
  const dir = path.join(os.tmpdir(), `skillvault-index-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes index.json and INDEX.md to disk', () => {
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, 'index.json');
    const mdPath = path.join(dir, 'INDEX.md');
    const entries = buildIndexEntries([item], [category]);

    writeIndexFiles(entries, jsonPath, mdPath);

    expect(JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))).toEqual(entries);
    expect(fs.readFileSync(mdPath, 'utf-8')).toContain('my-repo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `generate.ts` does not exist.

- [ ] **Step 3: Implement `apps/server/src/index/generate.ts`**

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
  }));
}

export function renderIndexMarkdown(entries: IndexEntry[]): string {
  const byCategory = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    const key = entry.category ?? 'Sem categoria';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(entry);
  }

  const lines: string[] = ['# SkillVault Index', ''];
  for (const [category, categoryEntries] of [...byCategory.entries()].sort()) {
    lines.push(`## ${category}`, '');
    for (const entry of categoryEntries) {
      lines.push(`- **${entry.name}** (${entry.type}) — ${entry.summary ?? 'sem resumo'}`);
      lines.push(`  - Utilidade: ${entry.utility ?? 'n/a'}`);
      lines.push(`  - Caminho: \`${entry.localPath}\``);
      lines.push(`  - Tags: ${entry.tags.join(', ') || 'nenhuma'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function writeIndexFiles(entries: IndexEntry[], jsonPath: string, mdPath: string): void {
  fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, renderIndexMarkdown(entries), 'utf-8');
}

export function regenerateIndex(
  itemsRepo: { list(): Item[] },
  categoriesRepo: { list(): Category[] },
  jsonPath: string,
  mdPath: string
): void {
  const entries = buildIndexEntries(itemsRepo.list(), categoriesRepo.list());
  writeIndexFiles(entries, jsonPath, mdPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/index
git commit -m "feat: add index.json/INDEX.md generation"
```

---

## Task 8: LLM enrichment (Ollama → Gemini → manual fallback)

**Files:**
- Create: `apps/server/src/enrichment/parse.ts`
- Test: `apps/server/src/enrichment/parse.test.ts`
- Create: `apps/server/src/enrichment/ollama.ts`
- Create: `apps/server/src/enrichment/gemini.ts`
- Create: `apps/server/src/enrichment/enrich.ts`
- Test: `apps/server/src/enrichment/enrich.test.ts`

- [ ] **Step 1: Write the failing test for JSON parsing**

`apps/server/src/enrichment/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnrichmentJson } from './parse.js';

describe('parseEnrichmentJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está o resultado:\n{"resumo": "Um resumo", "utilidade": "Serve para X", "categoria": "dev-tools", "tags": ["a", "b"]}\nFim.`;
    expect(parseEnrichmentJson(raw)).toEqual({
      summary: 'Um resumo',
      utility: 'Serve para X',
      category: 'dev-tools',
      tags: ['a', 'b'],
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseEnrichmentJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    expect(parseEnrichmentJson('{"resumo": "so isso"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `parse.ts` does not exist.

- [ ] **Step 3: Implement `apps/server/src/enrichment/parse.ts`**

```ts
export interface ParsedEnrichment {
  summary: string;
  utility: string;
  category: string;
  tags: string[];
}

export function parseEnrichmentJson(raw: string): ParsedEnrichment | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    const summary = typeof parsed.resumo === 'string' ? parsed.resumo : null;
    const utility = typeof parsed.utilidade === 'string' ? parsed.utilidade : null;
    const category = typeof parsed.categoria === 'string' ? parsed.categoria : null;
    const tags = Array.isArray(parsed.tags) ? parsed.tags : null;

    if (!summary || !utility || !category || !tags) return null;
    if (!tags.every((t) => typeof t === 'string')) return null;

    return { summary, utility, category, tags: tags as string[] };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Implement `apps/server/src/enrichment/ollama.ts`**

```ts
import type { SkillVaultConfig } from '../config.js';

export async function callOllama(
  config: SkillVaultConfig,
  prompt: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, prompt, stream: false }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Implement `apps/server/src/enrichment/gemini.ts`**

```ts
import type { SkillVaultConfig } from '../config.js';

export async function callGemini(
  config: SkillVaultConfig,
  prompt: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!config.geminiApiKey) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Write the failing test for the fallback chain**

`apps/server/src/enrichment/enrich.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { enrichContent } from './enrich.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const validJson = JSON.stringify({
  resumo: 'Resumo',
  utilidade: 'Utilidade',
  categoria: 'dev-tools',
  tags: ['a'],
});

describe('enrichContent', () => {
  it('uses the Ollama result when available', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse({ response: validJson })) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result.source).toBe('ollama');
    expect(result.category).toBe('dev-tools');
  });

  it('falls back to Gemini when Ollama fails and a Gemini key is set', async () => {
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async (url: string) => {
      if (url.includes('generativelanguage')) {
        return fakeResponse({ candidates: [{ content: { parts: [{ text: validJson }] } }] });
      }
      return fakeResponse(null, false);
    }) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result.source).toBe('gemini');
  });

  it('falls back to manual when both Ollama and Gemini fail', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result).toEqual({ summary: '', utility: '', category: '', tags: [], source: 'manual' });
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `enrich.ts` does not exist.

- [ ] **Step 9: Implement `apps/server/src/enrichment/enrich.ts`**

```ts
import type { SkillVaultConfig } from '../config.js';
import type { EnrichmentResult } from '../types.js';
import { callOllama } from './ollama.js';
import { callGemini } from './gemini.js';
import { parseEnrichmentJson } from './parse.js';

export function buildEnrichmentPrompt(itemType: string, content: string): string {
  return `Você está catalogando um item do tipo "${itemType}" para uma biblioteca pessoal de skills, repositórios e MCPs.
Analise o conteúdo abaixo e responda APENAS com um JSON no formato:
{"resumo": "1-2 frases", "utilidade": "para que serve", "categoria": "uma categoria curta (ex: dev-tools, automação, design, dados, IA/agents, docs, produtividade, integrações)", "tags": ["tag1", "tag2"]}

Conteúdo:
"""
${content.slice(0, 6000)}
"""`;
}

export async function enrichContent(
  config: SkillVaultConfig,
  itemType: string,
  content: string,
  fetchImpl: typeof fetch = fetch
): Promise<EnrichmentResult> {
  const prompt = buildEnrichmentPrompt(itemType, content);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl);
  if (ollamaRaw) {
    const parsed = parseEnrichmentJson(ollamaRaw);
    if (parsed) return { ...parsed, source: 'ollama' };
  }

  const geminiRaw = await callGemini(config, prompt, fetchImpl);
  if (geminiRaw) {
    const parsed = parseEnrichmentJson(geminiRaw);
    if (parsed) return { ...parsed, source: 'gemini' };
  }

  return { summary: '', utility: '', category: '', tags: [], source: 'manual' };
}
```

- [ ] **Step 10: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/enrichment
git commit -m "feat: add LLM enrichment with Ollama->Gemini->manual fallback"
```

---

## Task 9: Repo ingestion service + `POST /api/items` (type=repo)

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/src/ingestion/repo.ts`
- Test: `apps/server/src/ingestion/repo.test.ts`
- Create: `apps/server/src/routes/items.ts`
- Test: `apps/server/src/routes/items.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

- [ ] **Step 1: Add `simple-git` dependency**

In `apps/server/package.json`, add to `dependencies`:

```json
"simple-git": "^3.27.0"
```

Run: `npm install`

- [ ] **Step 2: Write the failing test for the ingestion service**

`apps/server/src/ingestion/repo.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `repo.ts` ingestion service does not exist.

- [ ] **Step 4: Implement `apps/server/src/ingestion/repo.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

const README_CANDIDATES = ['README.md', 'readme.md', 'README'];

function readFirstExisting(dir: string, candidates: string[]): string {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

export interface IngestRepoInput {
  name: string;
  url: string;
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  const { fullPath } = resolveUniqueDir(config.reposDir, input.name);

  await simpleGit().clone(input.url, fullPath);

  const readme = readFirstExisting(fullPath, README_CANDIDATES);
  const enrichment = await enrich(config, 'repo', readme || input.url);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'repo',
    name: input.name,
    sourceType: 'url',
    sourceValue: input.url,
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
  };

  return itemsRepo.create(newItem);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 6: Write the failing route test**

`apps/server/src/routes/items.test.ts`:

```ts
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `buildApp` does not accept `config`, and `/api/items` is not registered.

- [ ] **Step 8: Implement `apps/server/src/routes/items.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ingestRepo } from '../ingestion/repo.js';
import { regenerateIndex } from '../index/generate.js';

export function itemsRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);

    function regenerate() {
      regenerateIndex(itemsRepo, categoriesRepo, config.indexJsonPath, config.indexMdPath);
    }

    app.post('/api/items', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const type = body.type as string;
      const name = body.name as string;

      if (!type || !name) {
        return reply.status(400).send({ error: 'type and name are required' });
      }

      try {
        if (type === 'repo') {
          const url = body.url as string | undefined;
          if (!url) return reply.status(400).send({ error: 'url is required for type=repo' });
          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { name, url });
          regenerate();
          return reply.status(201).send(item);
        }

        return reply.status(400).send({ error: `unsupported type: ${type}` });
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });
  };
}
```

- [ ] **Step 9: Update `apps/server/src/app.ts` to accept config and register items routes**

```ts
import Fastify, { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);
  app.register(itemsRoutes(options.config));

  return app;
}
```

- [ ] **Step 10: Update `apps/server/src/app.test.ts` and `apps/server/src/routes/categories.test.ts` for the new `buildApp` signature**

`apps/server/src/app.test.ts`:

```ts
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
```

In `apps/server/src/routes/categories.test.ts`, update every `buildApp({ db: createDb(':memory:') })` call to `buildApp({ db: createDb(':memory:'), config: loadConfig({} as NodeJS.ProcessEnv) })` (add the `loadConfig` import from `../config.js`).

- [ ] **Step 11: Update `apps/server/src/server.ts` to pass config into `buildApp`**

```ts
import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig, ensureSkillVaultDirs } from './config.js';
import { createDb } from './db/connection.js';

const config = loadConfig();
ensureSkillVaultDirs(config);
const db = createDb(config.dbPath);
const app = buildApp({ db, config });

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`SkillVault server listening at ${address}`);
});
```

- [ ] **Step 12: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add apps/server
git commit -m "feat: add repo ingestion service and POST /api/items for repos"
```

---

## Task 10: Skill ingestion service + `POST /api/items` (type=skill)

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/src/ingestion/skill.ts`
- Test: `apps/server/src/ingestion/skill.test.ts`
- Modify: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/routes/items.test.ts` (extend)

- [ ] **Step 1: Add `adm-zip` and `@fastify/multipart` dependencies**

In `apps/server/package.json`, add to `dependencies`:

```json
"adm-zip": "^0.5.16",
"@fastify/multipart": "^9.0.1"
```

Add to `devDependencies`:

```json
"@types/adm-zip": "^0.5.6"
```

Run: `npm install`

- [ ] **Step 2: Write the failing test for the ingestion service**

`apps/server/src/ingestion/skill.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { ingestSkill } from './skill.js';
import type { EnrichmentResult } from '../types.js';

const stubEnrich = async (): Promise<EnrichmentResult> => ({
  summary: 'Resumo',
  utility: 'Utilidade',
  category: 'automacao',
  tags: ['skill'],
  source: 'ollama',
});

describe('ingestSkill', () => {
  const home = path.join(os.tmpdir(), `skillvault-skill-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('copies a skill from a local path', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Minha Skill');

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Minha Skill', source: { kind: 'local_path', path: sourceDir } },
      stubEnrich
    );

    expect(item.sourceType).toBe('local_path');
    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('extracts a skill from an uploaded zip', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('# Skill zipada'));
    const zipPath = path.join(os.tmpdir(), `skillvault-skill-upload-${Date.now()}.zip`);
    zip.writeZip(zipPath);

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Skill Zipada', source: { kind: 'upload', tempFilePath: zipPath, isZip: true } },
      stubEnrich
    );

    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
    fs.rmSync(zipPath, { force: true });
  });

  it('clones a skill from a URL and records the global install result', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const { execFileSync } = await import('node:child_process');
    const fixtureRepo = path.join(os.tmpdir(), `skillvault-skill-fixture-${Date.now()}`);
    fs.mkdirSync(fixtureRepo, { recursive: true });
    execFileSync('git', ['init'], { cwd: fixtureRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: fixtureRepo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: fixtureRepo });
    fs.writeFileSync(path.join(fixtureRepo, 'SKILL.md'), '# Skill via URL');
    execFileSync('git', ['add', '.'], { cwd: fixtureRepo });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: fixtureRepo });

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Skill via URL', source: { kind: 'url', url: fixtureRepo } },
      stubEnrich,
      async () => 'success'
    );

    expect(item.globalInstallStatus).toBe('success');
    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `skill.ts` ingestion service does not exist.

- [ ] **Step 4: Implement `apps/server/src/ingestion/skill.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item, GlobalInstallStatus } from '../types.js';

const execFileAsync = promisify(execFile);
const SKILL_FILE_CANDIDATES = ['SKILL.md', 'README.md', 'readme.md'];

function readFirstExisting(dir: string, candidates: string[]): string {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

export type SkillSource =
  | { kind: 'local_path'; path: string }
  | { kind: 'upload'; tempFilePath: string; isZip: boolean }
  | { kind: 'url'; url: string };

export interface IngestSkillInput {
  name: string;
  source: SkillSource;
}

export async function tryGlobalInstall(url: string): Promise<GlobalInstallStatus> {
  try {
    await execFileAsync('npx', ['skills', 'add', url], { timeout: 60_000 });
    return 'success';
  } catch {
    return 'failed';
  }
}

export async function ingestSkill(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestSkillInput,
  enrich: typeof enrichContent = enrichContent,
  globalInstall: typeof tryGlobalInstall = tryGlobalInstall
): Promise<Item> {
  const { fullPath } = resolveUniqueDir(config.skillsDir, input.name);
  let sourceType: 'local_path' | 'upload' | 'url';
  let sourceValue: string;
  let globalInstallStatus: GlobalInstallStatus | null = null;

  if (input.source.kind === 'local_path') {
    fs.cpSync(input.source.path, fullPath, { recursive: true });
    sourceType = 'local_path';
    sourceValue = input.source.path;
  } else if (input.source.kind === 'upload') {
    sourceType = 'upload';
    sourceValue = input.source.tempFilePath;
    if (input.source.isZip) {
      const zip = new AdmZip(input.source.tempFilePath);
      zip.extractAllTo(fullPath, true);
    } else {
      fs.mkdirSync(fullPath, { recursive: true });
      fs.copyFileSync(
        input.source.tempFilePath,
        path.join(fullPath, path.basename(input.source.tempFilePath))
      );
    }
  } else {
    sourceType = 'url';
    sourceValue = input.source.url;
    await simpleGit().clone(input.source.url, fullPath);
    globalInstallStatus = await globalInstall(input.source.url);
  }

  const content = readFirstExisting(fullPath, SKILL_FILE_CANDIDATES);
  const enrichment = await enrich(config, 'skill', content || sourceValue);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

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
  };

  return itemsRepo.create(newItem);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 6: Extend `apps/server/src/routes/items.ts` to handle `type=skill`**

Replace the file with:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ingestRepo } from '../ingestion/repo.js';
import { ingestSkill, type SkillSource } from '../ingestion/skill.js';
import { regenerateIndex } from '../index/generate.js';

export function itemsRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);

    function regenerate() {
      regenerateIndex(itemsRepo, categoriesRepo, config.indexJsonPath, config.indexMdPath);
    }

    app.post('/api/items', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const type = body.type as string;
      const name = body.name as string;

      if (!type || !name) {
        return reply.status(400).send({ error: 'type and name are required' });
      }

      try {
        if (type === 'repo') {
          const url = body.url as string | undefined;
          if (!url) return reply.status(400).send({ error: 'url is required for type=repo' });
          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { name, url });
          regenerate();
          return reply.status(201).send(item);
        }

        if (type === 'skill') {
          const sourceType = body.source_type as string;
          let source: SkillSource;

          if (sourceType === 'local_path') {
            const localPath = body.path as string;
            if (!localPath) return reply.status(400).send({ error: 'path is required' });
            source = { kind: 'local_path', path: localPath };
          } else if (sourceType === 'url') {
            const url = body.url as string;
            if (!url) return reply.status(400).send({ error: 'url is required' });
            source = { kind: 'url', url };
          } else if (sourceType === 'upload') {
            const file = body.file as MultipartFile | undefined;
            if (!file) return reply.status(400).send({ error: 'file is required for upload' });
            const buffer = await file.toBuffer();
            const tempPath = path.join(os.tmpdir(), `skillvault-upload-${Date.now()}-${file.filename}`);
            fs.writeFileSync(tempPath, buffer);
            source = {
              kind: 'upload',
              tempFilePath: tempPath,
              isZip: file.filename.toLowerCase().endsWith('.zip'),
            };
          } else {
            return reply.status(400).send({ error: `unsupported source_type: ${sourceType}` });
          }

          const item = await ingestSkill(config, itemsRepo, categoriesRepo, { name, source });
          regenerate();
          return reply.status(201).send(item);
        }

        return reply.status(400).send({ error: `unsupported type: ${type}` });
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });
  };
}
```

- [ ] **Step 7: Register the multipart plugin — update `apps/server/src/app.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);
  app.register(multipart, { attachFieldsToBody: 'keyValues' });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);
  app.register(itemsRoutes(options.config));

  return app;
}
```

- [ ] **Step 8: Add a route-level test for `type=skill` with `source_type=local_path`**

Append to `apps/server/src/routes/items.test.ts`:

```ts
describe('POST /api/items (type=skill, source_type=local_path)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-skill-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('copies the skill and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-route-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Skill de rota');

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Skill de Rota', source_type: 'local_path', path: sourceDir },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe('skill');
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });
});
```

Note: HTTP upload of `source_type=upload` (multipart file/zip) is exercised at the service level in Task 10 (`ingestSkill` tests) rather than through `app.inject`, since simulating real multipart payloads through `light-my-request` is brittle. Verify the multipart HTTP path manually (e.g. with `curl -F`) once the frontend upload form exists in a later plan.

- [ ] **Step 9: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/server
git commit -m "feat: add skill ingestion (local path, upload, url) and wire into POST /api/items"
```

---

## Task 11: MCP ingestion service + `POST /api/items` (type=mcp)

**Files:**
- Create: `apps/server/src/ingestion/mcp.ts`
- Test: `apps/server/src/ingestion/mcp.test.ts`
- Modify: `apps/server/src/routes/items.ts`
- Test: `apps/server/src/routes/items.test.ts` (extend)

- [ ] **Step 1: Write the failing test for the ingestion service**

`apps/server/src/ingestion/mcp.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { ingestMcp } from './mcp.js';
import type { EnrichmentResult } from '../types.js';

const stubEnrich = async (): Promise<EnrichmentResult> => ({
  summary: 'Resumo do MCP',
  utility: 'Conecta com X',
  category: 'integracoes',
  tags: ['mcp'],
  source: 'ollama',
});

describe('ingestMcp', () => {
  const home = path.join(os.tmpdir(), `skillvault-mcp-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('writes the config JSON and saves the item', async () => {
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
        name: 'Meu MCP',
        config: { mcpServers: { meuMcp: { command: 'npx', args: ['meu-mcp'] } } },
        description: 'Conector para X',
      },
      stubEnrich
    );

    expect(item.type).toBe('mcp');
    expect(fs.existsSync(item.localPath)).toBe(true);
    const savedConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));
    expect(savedConfig.mcpServers.meuMcp.command).toBe('npx');
    expect(item.summary).toBe('Resumo do MCP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `mcp.ts` ingestion service does not exist.

- [ ] **Step 3: Implement `apps/server/src/ingestion/mcp.ts`**

```ts
import fs from 'node:fs';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueFile } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

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
  const { fullPath } = resolveUniqueFile(config.mcpsDir, input.name, '.json');
  fs.writeFileSync(fullPath, JSON.stringify(input.config, null, 2), 'utf-8');

  const content = `${input.description ?? ''}\n${JSON.stringify(input.config, null, 2)}`;
  const enrichment = await enrich(config, 'mcp', content);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'mcp',
    name: input.name,
    sourceType: 'manual',
    sourceValue: JSON.stringify(input.config),
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
  };

  return itemsRepo.create(newItem);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Extend `apps/server/src/routes/items.ts` to handle `type=mcp`**

In `apps/server/src/routes/items.ts`, add the import:

```ts
import { ingestMcp } from '../ingestion/mcp.js';
```

And add this branch inside the `try` block, after the `type === 'skill'` block and before the final `return reply.status(400)...`:

```ts
        if (type === 'mcp') {
          const mcpConfig = body.config as Record<string, unknown> | undefined;
          if (!mcpConfig) return reply.status(400).send({ error: 'config is required for type=mcp' });
          const description = body.description as string | undefined;
          const item = await ingestMcp(config, itemsRepo, categoriesRepo, {
            name,
            config: mcpConfig,
            description,
          });
          regenerate();
          return reply.status(201).send(item);
        }
```

- [ ] **Step 6: Add a route-level test**

Append to `apps/server/src/routes/items.test.ts`:

```ts
describe('POST /api/items (type=mcp)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-mcp-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('saves the MCP config and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'mcp',
        name: 'MCP de Rota',
        config: { mcpServers: { rota: { command: 'npx', args: ['rota-mcp'] } } },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe('mcp');
  });
});
```

- [ ] **Step 7: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server
git commit -m "feat: add MCP ingestion and wire into POST /api/items"
```

---

## Task 12: Remaining items routes (list, detail, update, delete)

**Files:**
- Modify: `apps/server/src/routes/items.ts`
- Test: `apps/server/src/routes/items.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `apps/server/src/routes/items.test.ts`:

```ts
describe('items list/detail/update/delete', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-crud-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  async function createMcpItem(app: ReturnType<typeof buildApp>, name: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name, config: { mcpServers: {} } },
    });
    return response.json();
  }

  it('lists items and filters by type', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    await createMcpItem(app, 'MCP Um');
    await createMcpItem(app, 'MCP Dois');

    const list = await app.inject({ method: 'GET', url: '/api/items?type=mcp' });
    expect(list.json()).toHaveLength(2);
  });

  it('returns 404 for a missing item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({ method: 'GET', url: '/api/items/999' });
    expect(response.statusCode).toBe(404);
  });

  it('updates an item and regenerates the index', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const created = await createMcpItem(app, 'MCP a Editar');
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/items/${created.id}`,
      payload: { summary: 'Resumo editado' },
    });
    expect(update.json().summary).toBe('Resumo editado');
  });

  it('deletes an item and removes its local file', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const created = await createMcpItem(app, 'MCP a Apagar');
    expect(fs.existsSync(created.localPath)).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/api/items/${created.id}` });
    expect(del.statusCode).toBe(204);
    expect(fs.existsSync(created.localPath)).toBe(false);

    const getAfterDelete = await app.inject({ method: 'GET', url: `/api/items/${created.id}` });
    expect(getAfterDelete.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `GET/PATCH/DELETE /api/items(/:id)` not registered.

- [ ] **Step 3: Add the routes to `apps/server/src/routes/items.ts`**

Add these route registrations inside the plugin function, after the `POST /api/items` handler:

```ts
    app.get('/api/items', async (request) => {
      const { q, type, category, tag } = request.query as {
        q?: string;
        type?: string;
        category?: string;
        tag?: string;
      };
      return itemsRepo.list({
        q,
        type: type as NewItem['type'] | undefined,
        categoryId: category ? Number(category) : undefined,
        tag,
      });
    });

    app.get('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      return item;
    });

    app.patch('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.update(Number(id), request.body as ItemUpdate);
      if (!item) return reply.status(404).send({ error: 'item not found' });
      regenerate();
      return item;
    });

    app.delete('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });

      if (fs.existsSync(item.localPath)) {
        fs.rmSync(item.localPath, { recursive: true, force: true });
      }
      itemsRepo.delete(item.id);
      regenerate();
      return reply.status(204).send();
    });
```

Add `NewItem` and `ItemUpdate` to the existing import from `'../db/repositories/items.js'`:

```ts
import { ItemsRepository, type NewItem, type ItemUpdate } from '../db/repositories/items.js';
```

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: add items list/detail/update/delete routes"
```

---

## Task 13: `GET /api/index` route, final wiring, and README

**Files:**
- Create: `apps/server/src/routes/indexRoute.ts`
- Test: `apps/server/src/routes/indexRoute.test.ts`
- Modify: `apps/server/src/app.ts`
- Create: `README.md`

- [ ] **Step 1: Write the failing test**

`apps/server/src/routes/indexRoute.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { buildApp } from '../app.js';

describe('GET /api/index', () => {
  const home = path.join(os.tmpdir(), `skillvault-index-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('returns an empty array when no items have been added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({ method: 'GET', url: '/api/index' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns the generated index after an item is added', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'MCP Index', config: { mcpServers: {} } },
    });

    const response = await app.inject({ method: 'GET', url: '/api/index' });
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('MCP Index');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `/api/index` not registered.

- [ ] **Step 3: Implement `apps/server/src/routes/indexRoute.ts`**

```ts
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';

export function indexRoute(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    app.get('/api/index', async (_request, reply) => {
      if (!fs.existsSync(config.indexJsonPath)) {
        return reply.send([]);
      }
      const raw = fs.readFileSync(config.indexJsonPath, 'utf-8');
      reply.header('Content-Type', 'application/json');
      return reply.send(raw);
    });
  };
}
```

- [ ] **Step 4: Register it in `apps/server/src/app.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';
import { indexRoute } from './routes/indexRoute.js';

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);
  app.register(multipart, { attachFieldsToBody: 'keyValues' });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);
  app.register(itemsRoutes(options.config));
  app.register(indexRoute(options.config));

  return app;
}
```

- [ ] **Step 5: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS (all tasks 1–13)

- [ ] **Step 6: Create `README.md`**

```md
# SkillVault

Biblioteca pessoal de skills, repositórios de código e MCPs — catálogo local, single-user.

## Rodando localmente

1. `npm install` (na raiz do monorepo)
2. Opcional: crie `apps/server/.env` com:
   - `SKILLVAULT_HOME` — pasta de dados (default: `~/skillvault`)
   - `OLLAMA_URL` — default `http://localhost:11434`
   - `OLLAMA_MODEL` — default `llama3.2`
   - `GEMINI_API_KEY` — opcional, usado como fallback quando o Ollama não responde
   - `GEMINI_MODEL` — default `gemini-2.0-flash`
   - `PORT` — default `3001`
3. `npm run dev` sobe o backend em `http://localhost:3001`
4. Testes: `npm run test`

## Endpoints disponíveis

- `POST /api/items` — adiciona skill/repo/mcp (`type: 'skill' | 'repo' | 'mcp'`)
- `GET /api/items` — lista, com filtros `?q=&type=&category=&tag=`
- `GET /api/items/:id` / `PATCH /api/items/:id` / `DELETE /api/items/:id`
- `GET /api/categories`, `POST /api/categories`, `PATCH /api/categories/:id`, `POST /api/categories/:id/merge`
- `GET /api/index` — serve o `index.json` consumível pelo Claude Code

## Integração com Claude Code

Aponte o Claude Code para `~/skillvault/index.json` (ou `INDEX.md`) como referência de contexto — o arquivo é regenerado automaticamente a cada item adicionado, editado ou removido.

## Status

Backend de ingestão completo (skills, repos, MCPs) com enriquecimento via LLM (Ollama → Gemini free tier → manual) e catálogo via API REST. Interface web, recomendador e PWA são fases seguintes — ver `docs/superpowers/specs/`.
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/indexRoute.ts apps/server/src/routes/indexRoute.test.ts apps/server/src/app.ts README.md
git commit -m "feat: add GET /api/index route and project README"
```

---

## Manual verification (after Task 13)

1. `npm run dev` — server starts on `http://localhost:3001`.
2. `curl -X POST http://localhost:3001/api/items -H "Content-Type: application/json" -d '{"type":"repo","name":"test-repo","url":"<any public git URL>"}'` — confirm a `201` with a populated item (fields will be empty/manual if Ollama isn't running locally — that's the expected fallback).
3. `curl http://localhost:3001/api/index` and check `~/skillvault/index.json` / `INDEX.md` were created.
4. If Ollama is installed and running (`ollama serve`, with the configured model pulled), repeat step 2 and confirm `enrichmentSource` is `"ollama"` with real generated summary/category/tags.
