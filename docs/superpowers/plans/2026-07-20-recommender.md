# Project Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user type a free-text project idea and get back skills/repos/MCPs from their real catalog that fit it, with each recommendation validated against the catalog by id (never inventing an item) and a compact history of past queries.

**Architecture:** A new backend module (`apps/server/src/recommend/`) builds a prompt listing the entire catalog with ids, calls the existing Ollama→Gemini fallback chain (reusing `callOllama`/`callGemini` from `enrichment/`), and validates every id the LLM cites against the real catalog before returning it. A new `consultas` repository persists every successful query (the table already exists in the schema, unused until now). A new `POST /api/recommend` + `GET /api/consultas` route pair exposes this. The frontend gets a new `/recommend` page built from the existing design-system components (`Textarea`, `Button`, `StatusMessage`), plus a `wand-2` icon and a "Recomendar" nav entry back in `Sidebar` (removed during the design-system plan because the feature didn't exist yet).

**Tech Stack:** Fastify 5 + better-sqlite3 (existing backend), React 18 + TypeScript + Vite (existing frontend), Vitest + React Testing Library.

---

### Task 1: Backend types

**Files:**
- Modify: `apps/server/src/types.ts`

- [ ] **Step 1: Add the new types**

Append to the end of `apps/server/src/types.ts`:

```typescript
export interface Consulta {
  id: number;
  ideia: string;
  createdAt: string;
}

export interface RecommendedItem extends Item {
  motivo: string;
}

export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc -b` in `apps/server`
Expected: no errors (these are additive type declarations, nothing references them yet).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/types.ts
git commit -m "feat: add Consulta and recommendation types"
```

## Context

This is Task 1 of a 13-task plan implementing the project recommender feature (`POST /api/recommend`, `GET /api/consultas`, and a new `/recommend` frontend page). This task just adds the shared backend types that Tasks 4-6 will use — `Consulta` mirrors the existing `Category`/`Item` type style already in this file, `RecommendedItem` extends the existing `Item` interface with the LLM-generated `motivo` (reason) text, and `RecommendResult` is the exact shape `POST /api/recommend` returns.

---

### Task 2: `buildRecommendPrompt`

**Files:**
- Create: `apps/server/src/recommend/prompt.ts`
- Test: `apps/server/src/recommend/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildRecommendPrompt } from './prompt.js';

describe('buildRecommendPrompt', () => {
  it('includes the idea and each catalog item with its id', () => {
    const prompt = buildRecommendPrompt('app de leitura de PDFs', [
      {
        id: 3,
        type: 'skill',
        name: 'PDF Parser',
        summary: 'Extrai texto',
        utility: 'Leitura',
        category: 'dev-tools',
        tags: ['pdf'],
      },
    ]);

    expect(prompt).toContain('app de leitura de PDFs');
    expect(prompt).toContain('id=3');
    expect(prompt).toContain('PDF Parser');
  });

  it('marks the catalog as empty when there are no items', () => {
    const prompt = buildRecommendPrompt('ideia', []);
    expect(prompt).toContain('(catálogo vazio)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/server -- recommend/prompt.test.ts`
Expected: FAIL — `./prompt.js` does not exist yet.

- [ ] **Step 3: Implement the module**

```typescript
import type { Item } from '../types.js';

export interface CatalogItemForPrompt {
  id: number;
  type: Item['type'];
  name: string;
  summary: string | null;
  utility: string | null;
  category: string | null;
  tags: string[];
}

export function buildRecommendPrompt(ideia: string, catalog: CatalogItemForPrompt[]): string {
  const catalogLines = catalog
    .map(
      (item) =>
        `- id=${item.id} tipo=${item.type} nome="${item.name}" categoria="${item.category ?? 'sem categoria'}" resumo="${item.summary ?? ''}" utilidade="${item.utility ?? ''}" tags=[${item.tags.join(', ')}]`
    )
    .join('\n');

  return `Você é um assistente que recomenda itens de um catálogo pessoal de skills, repositórios de código e MCPs (Model Context Protocol servers) para uma ideia de projeto.

Ideia do usuário: "${ideia}"

Catálogo disponível (só pode recomendar itens desta lista, citando o id exato):
${catalogLines || '(catálogo vazio)'}

Responda APENAS com um JSON no formato:
{"skills": [{"id": N, "motivo": "por que esse item ajuda nessa ideia"}], "repos": [...], "mcps": [...]}

Cite apenas ids que aparecem na lista acima. Se nada do catálogo servir para um tipo, retorne um array vazio para esse tipo.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/server -- recommend/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/prompt.ts apps/server/src/recommend/prompt.test.ts
git commit -m "feat: add buildRecommendPrompt"
```

## Context

This is Task 2 of the plan. `apps/server/src/recommend/` is a new module, parallel to the existing `apps/server/src/enrichment/` (which has `enrich.ts`/`ollama.ts`/`gemini.ts`/`parse.ts`). This task builds the prompt text sent to the LLM — every catalog item is listed with its `id` so the LLM can cite it back, and the anti-hallucination validation (Task 5) checks those ids against the real catalog. `CatalogItemForPrompt` is a module-local shape (not added to the shared `types.ts` from Task 1) since it only exists to feed this one function.

---

### Task 3: `parseRecommendJson`

**Files:**
- Create: `apps/server/src/recommend/parse.ts`
- Test: `apps/server/src/recommend/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { parseRecommendJson } from './parse.js';

describe('parseRecommendJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está:\n{"skills":[{"id":1,"motivo":"Serve para X"}],"repos":[],"mcps":[{"id":5,"motivo":"Y"}]}\nFim.`;
    expect(parseRecommendJson(raw)).toEqual({
      skills: [{ id: 1, motivo: 'Serve para X' }],
      repos: [],
      mcps: [{ id: 5, motivo: 'Y' }],
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseRecommendJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a list entry is missing motivo', () => {
    expect(parseRecommendJson('{"skills":[{"id":1}],"repos":[],"mcps":[]}')).toBeNull();
  });

  it('returns null when a required array is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[]}')).toBeNull();
  });

  it('returns null when id is not a number', () => {
    expect(parseRecommendJson('{"skills":[{"id":"1","motivo":"x"}],"repos":[],"mcps":[]}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/server -- recommend/parse.test.ts`
Expected: FAIL — `./parse.js` does not exist yet.

- [ ] **Step 3: Implement the module**

```typescript
export interface ParsedRecommendation {
  id: number;
  motivo: string;
}

export interface ParsedRecommendResult {
  skills: ParsedRecommendation[];
  repos: ParsedRecommendation[];
  mcps: ParsedRecommendation[];
}

function parseList(value: unknown): ParsedRecommendation[] | null {
  if (!Array.isArray(value)) return null;
  const result: ParsedRecommendation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const id = (entry as Record<string, unknown>).id;
    const motivo = (entry as Record<string, unknown>).motivo;
    if (typeof id !== 'number' || typeof motivo !== 'string') return null;
    result.push({ id, motivo });
  }
  return result;
}

export function parseRecommendJson(raw: string): ParsedRecommendResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const skills = parseList(parsed.skills);
    const repos = parseList(parsed.repos);
    const mcps = parseList(parsed.mcps);
    if (!skills || !repos || !mcps) return null;
    return { skills, repos, mcps };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/server -- recommend/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/parse.ts apps/server/src/recommend/parse.test.ts
git commit -m "feat: add parseRecommendJson"
```

## Context

This is Task 3, mirroring the existing `apps/server/src/enrichment/parse.ts` pattern exactly (extract the first `{...}` block from the raw LLM text, `JSON.parse`, validate structure, return `null` on any failure instead of throwing). This is what lets the orchestrator (Task 5) treat "LLM responded but the JSON was garbage" the same as "LLM didn't respond" — both fall through to the next provider in the chain.

---

### Task 4: `ConsultasRepository`

**Files:**
- Create: `apps/server/src/db/repositories/consultas.ts`
- Test: `apps/server/src/db/repositories/consultas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { ConsultasRepository } from './consultas.js';

describe('ConsultasRepository', () => {
  let db: Database.Database;
  let repo: ConsultasRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new ConsultasRepository(db);
  });

  it('creates a consulta and returns it without the response payload', () => {
    const consulta = repo.create('app de leitura de PDFs', '{"skills":[],"repos":[],"mcps":[]}');
    expect(consulta.ideia).toBe('app de leitura de PDFs');
    expect(consulta.id).toBeGreaterThan(0);
    expect(consulta.createdAt).toBeTruthy();
  });

  it('persists the response JSON in the database even though create() does not return it', () => {
    repo.create('ideia', '{"skills":[],"repos":[],"mcps":[]}');
    const row = db.prepare('SELECT resposta_json FROM consultas').get() as { resposta_json: string };
    expect(row.resposta_json).toBe('{"skills":[],"repos":[],"mcps":[]}');
  });

  it('lists the most recent consultas first, respecting the limit', () => {
    for (let i = 0; i < 15; i++) {
      repo.create(`ideia ${i}`, '{}');
    }
    const recent = repo.listRecent(10);
    expect(recent).toHaveLength(10);
    expect(recent[0].ideia).toBe('ideia 14');
    expect(recent[9].ideia).toBe('ideia 5');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/server -- db/repositories/consultas.test.ts`
Expected: FAIL — `./consultas.js` does not exist yet.

- [ ] **Step 3: Implement the repository**

```typescript
import type Database from 'better-sqlite3';
import type { Consulta } from '../../types.js';

interface ConsultaRow {
  id: number;
  ideia: string;
  created_at: string;
}

function toConsulta(row: ConsultaRow): Consulta {
  return { id: row.id, ideia: row.ideia, createdAt: row.created_at };
}

export class ConsultasRepository {
  constructor(private db: Database.Database) {}

  create(ideia: string, respostaJson: string): Consulta {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO consultas (ideia, resposta_json, created_at) VALUES (?, ?, ?)')
      .run(ideia, respostaJson, createdAt);
    return { id: Number(result.lastInsertRowid), ideia, createdAt };
  }

  listRecent(limit: number): Consulta[] {
    const rows = this.db
      .prepare('SELECT id, ideia, created_at FROM consultas ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as ConsultaRow[];
    return rows.map(toConsulta);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/server -- db/repositories/consultas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/repositories/consultas.ts apps/server/src/db/repositories/consultas.test.ts
git commit -m "feat: add ConsultasRepository"
```

## Context

This is Task 4. `apps/server/src/db/schema.ts` already has a `consultas` table (`id`, `ideia`, `resposta_json`, `created_at`) — it's been in the schema since the original project design but never used until now. This repository follows the exact class-based pattern already used by `CategoriesRepository`/`ItemsRepository` (constructor takes the `better-sqlite3` `Database` instance, a private `toX` row-mapper function, prepared statements per method). `listRecent` only selects `id`/`ideia`/`created_at` (not `resposta_json`) because the history UI (Task 11) only shows the idea text and date — `resposta_json` stays queryable directly from the database for a possible future expansion, per the approved design spec.

---

### Task 5: `getRecommendations` orchestrator

**Files:**
- Create: `apps/server/src/recommend/recommend.ts`
- Test: `apps/server/src/recommend/recommend.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { loadConfig } from '../config.js';
import { ItemsRepository, type NewItem } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { getRecommendations } from './recommend.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function baseNewItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    type: 'skill',
    name: 'PDF Parser',
    sourceType: 'manual',
    sourceValue: 'x',
    localPath: '/skillvault/skills/pdf-parser',
    categoryId: null,
    summary: 'Extrai texto de PDFs',
    utility: 'Útil para leitura de documentos',
    tags: ['pdf'],
    enrichmentSource: null,
    globalInstallStatus: null,
    ...overrides,
  };
}

describe('getRecommendations', () => {
  let db: Database.Database;
  let itemsRepo: ItemsRepository;
  let categoriesRepo: CategoriesRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    itemsRepo = new ItemsRepository(db);
    categoriesRepo = new CategoriesRepository(db);
  });

  it('returns empty blocks without calling the LLM when the catalog is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toEqual({ skills: [], repos: [], mcps: [] });
  });

  it('resolves ids from the Ollama response into full items, discarding unknown ids and wrong-type ids', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));
    const repoItem = itemsRepo.create(baseNewItem({ type: 'repo', name: 'fastify-starter' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [
        { id: skill.id, motivo: 'Ajuda a extrair texto de PDFs' },
        { id: 999999, motivo: 'id inexistente' },
        { id: repoItem.id, motivo: 'tipo errado, deveria ser descartado' },
      ],
      repos: [{ id: repoItem.id, motivo: 'Bom ponto de partida' }],
      mcps: [],
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([{ ...skill, motivo: 'Ajuda a extrair texto de PDFs' }]);
    expect(result?.repos).toEqual([{ ...repoItem, motivo: 'Bom ponto de partida' }]);
    expect(result?.mcps).toEqual([]);
  });

  it('falls back to Gemini when Ollama fails', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const raw = JSON.stringify({ skills: [{ id: skill.id, motivo: 'via gemini' }], repos: [], mcps: [] });
    const fetchImpl = (async (url: string) => {
      if (url.includes('generativelanguage')) {
        return fakeResponse({ candidates: [{ content: { parts: [{ text: raw }] } }] });
      }
      return fakeResponse(null, false);
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result?.skills[0]?.motivo).toBe('via gemini');
  });

  it('returns null when both Ollama and Gemini fail', async () => {
    itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/server -- recommend/recommend.test.ts`
Expected: FAIL — `./recommend.js` does not exist yet.

- [ ] **Step 3: Implement the module**

```typescript
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import type { Item, RecommendedItem, RecommendResult } from '../types.js';
import { callOllama } from '../enrichment/ollama.js';
import { callGemini } from '../enrichment/gemini.js';
import { buildRecommendPrompt, type CatalogItemForPrompt } from './prompt.js';
import { parseRecommendJson, type ParsedRecommendation } from './parse.js';

function toCatalogEntry(item: Item, categoryNameById: Map<number, string>): CatalogItemForPrompt {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    summary: item.summary,
    utility: item.utility,
    category: item.categoryId !== null ? categoryNameById.get(item.categoryId) ?? null : null,
    tags: item.tags,
  };
}

function resolveList(
  entries: ParsedRecommendation[],
  expectedType: Item['type'],
  itemsRepo: ItemsRepository
): RecommendedItem[] {
  const resolved: RecommendedItem[] = [];
  for (const entry of entries) {
    const item = itemsRepo.getById(entry.id);
    if (!item || item.type !== expectedType) continue;
    resolved.push({ ...item, motivo: entry.motivo });
  }
  return resolved;
}

export async function getRecommendations(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  ideia: string,
  fetchImpl: typeof fetch = fetch
): Promise<RecommendResult | null> {
  const allItems = itemsRepo.list();
  if (allItems.length === 0) {
    return { skills: [], repos: [], mcps: [] };
  }

  const categoryNameById = new Map(categoriesRepo.list().map((c) => [c.id, c.name]));
  const catalog = allItems.map((item) => toCatalogEntry(item, categoryNameById));
  const prompt = buildRecommendPrompt(ideia, catalog);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl);
  let parsed = ollamaRaw ? parseRecommendJson(ollamaRaw) : null;

  if (!parsed) {
    const geminiRaw = await callGemini(config, prompt, fetchImpl);
    parsed = geminiRaw ? parseRecommendJson(geminiRaw) : null;
  }

  if (!parsed) return null;

  return {
    skills: resolveList(parsed.skills, 'skill', itemsRepo),
    repos: resolveList(parsed.repos, 'repo', itemsRepo),
    mcps: resolveList(parsed.mcps, 'mcp', itemsRepo),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/server -- recommend/recommend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/recommend.ts apps/server/src/recommend/recommend.test.ts
git commit -m "feat: add getRecommendations orchestrator with id-based anti-hallucination validation"
```

## Context

This is Task 5, the core of the feature. It follows the exact same Ollama→Gemini fallback shape as `enrichContent` in `apps/server/src/enrichment/enrich.ts` (try Ollama, parse; if that fails, try Gemini, parse; the `fetchImpl` parameter defaulting to the real `fetch` is the same dependency-injection pattern used there for testability). The anti-hallucination validation happens in `resolveList`: every id the LLM cites is looked up via `itemsRepo.getById`, and discarded if it doesn't exist **or** doesn't match the expected type for that block (an id cited under `"skills"` that's actually a `repo` in the real catalog gets silently dropped, per the approved design spec's "por id" decision — more robust than the original spec's literal "by name" wording, since names can collide).

Returning `null` (rather than throwing) signals "LLM fully unavailable" to the caller (Task 6's route), which is what the route uses to decide between a `200` and a `503`.

---

### Task 6: `POST /api/recommend` + `GET /api/consultas` routes

**Files:**
- Create: `apps/server/src/routes/recommend.ts`
- Test: `apps/server/src/routes/recommend.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/server -- routes/recommend.test.ts`
Expected: FAIL — `./recommend.js` (the route module) does not exist yet.

- [ ] **Step 3: Implement the route module**

```typescript
import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ConsultasRepository } from '../db/repositories/consultas.js';
import { getRecommendations } from '../recommend/recommend.js';

const HISTORY_LIMIT = 10;

export function recommendRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);
    const consultasRepo = new ConsultasRepository(app.db);

    app.post<{ Body: { ideia: string } }>('/api/recommend', async (request, reply) => {
      const ideia = request.body?.ideia?.trim();
      if (!ideia) return reply.status(400).send({ error: 'ideia is required' });

      const result = await getRecommendations(config, itemsRepo, categoriesRepo, ideia);
      if (!result) {
        return reply
          .status(503)
          .send({ error: 'Não foi possível gerar recomendações no momento. Tente novamente.' });
      }

      consultasRepo.create(ideia, JSON.stringify(result));
      return result;
    });

    app.get('/api/consultas', async () => consultasRepo.listRecent(HISTORY_LIMIT));
  };
}
```

- [ ] **Step 4: Register the route in `app.ts`**

In `apps/server/src/app.ts`, add the import alongside the existing route imports:

```typescript
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';
import { indexRoute } from './routes/indexRoute.js';
import { recommendRoutes } from './routes/recommend.js';
```

And register it alongside the existing registrations:

```typescript
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes(options.config));
  app.register(itemsRoutes(options.config));
  app.register(indexRoute(options.config));
  app.register(recommendRoutes(options.config));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -w apps/server -- routes/recommend.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite to confirm nothing else broke**

Run: `npm run test -w apps/server`
Expected: PASS — all existing tests plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/recommend.ts apps/server/src/routes/recommend.test.ts apps/server/src/app.ts
git commit -m "feat: add POST /api/recommend and GET /api/consultas routes"
```

## Context

This is Task 6, wiring `getRecommendations` (Task 5) and `ConsultasRepository` (Task 4) into the HTTP layer, following the exact `routes/categories.ts` pattern (a factory function taking `config`, returning an `async function(app)` that registers routes using repositories built from `app.db`). The route test mocks `getRecommendations` entirely (the same `vi.mock(...)` pattern `routes/items.test.ts` already uses for `enrichContent`) so the route's own logic — validation, the 503 path, and consulta persistence — is tested without needing a live Ollama/Gemini backend. A consulta is only ever saved on a `200` response, never on `503`, matching the approved design.

---

### Task 7: Frontend types

**Files:**
- Modify: `apps/web/src/types.ts`

- [ ] **Step 1: Add the new types**

Append to the end of `apps/web/src/types.ts`:

```typescript
export interface RecommendedItem extends Item {
  motivo: string;
}

export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
}

export interface Consulta {
  id: number;
  ideia: string;
  createdAt: string;
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc -b` in `apps/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/types.ts
git commit -m "feat: add RecommendResult and Consulta frontend types"
```

## Context

This is Task 7 — the frontend mirror of Task 1's backend types. These shapes are identical to what the backend actually sends over the wire (Fastify serializes the backend's camelCase `Item`/`RecommendedItem`/`RecommendResult` objects as-is, and the frontend's existing `Item` type already matches the backend's `Item` field-for-field, so no transformation layer is needed).

---

### Task 8: `api/client.ts` additions

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/api/client.test.ts`, change the import block at the top from:

```typescript
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  listCategories,
  createCategory,
  renameCategory,
  mergeCategory,
} from './client.js';
```

to:

```typescript
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  listCategories,
  createCategory,
  renameCategory,
  mergeCategory,
  getRecommendations,
  listConsultas,
} from './client.js';
```

Then append these two tests inside the existing `describe('api client', ...)` block, right before its closing `});`:

```typescript
  it('getRecommendations posts the idea and returns the parsed result', async () => {
    const mock = mockFetchOnce({ skills: [], repos: [], mcps: [] });
    const result = await getRecommendations('app de leitura de PDFs');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/recommend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ideia: 'app de leitura de PDFs' });
    expect(result).toEqual({ skills: [], repos: [], mcps: [] });
  });

  it('listConsultas fetches the recent query history', async () => {
    mockFetchOnce([{ id: 1, ideia: 'x', createdAt: '' }]);
    const consultas = await listConsultas();
    expect(consultas).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w apps/web -- api/client.test.ts`
Expected: FAIL — `getRecommendations`/`listConsultas` are not exported from `./client.js` yet.

- [ ] **Step 3: Implement the client functions**

In `apps/web/src/api/client.ts`, change the top import from:

```typescript
import type { Category, Item, ItemDetail, ItemFilters, ItemUpdate } from '../types.js';
```

to:

```typescript
import type { Category, Item, ItemDetail, ItemFilters, ItemUpdate, RecommendResult, Consulta } from '../types.js';
```

Then append these two functions at the end of the file:

```typescript
export function getRecommendations(ideia: string): Promise<RecommendResult> {
  return request<RecommendResult>('/api/recommend', {
    method: 'POST',
    body: JSON.stringify({ ideia }),
  });
}

export function listConsultas(): Promise<Consulta[]> {
  return request<Consulta[]>('/api/consultas');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w apps/web -- api/client.test.ts`
Expected: PASS — all 14 tests (12 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/api/client.test.ts
git commit -m "feat: add getRecommendations and listConsultas to the api client"
```

## Context

This is Task 8, following the exact `request<T>()` wrapper pattern every other function in this file already uses, and the exact `mockFetchOnce` test pattern already established in `client.test.ts` for the other 12 functions.

---

### Task 9: `wand-2` icon

**Files:**
- Modify: `apps/web/src/components/ui/core/Icon/Icon.tsx`
- Modify: `apps/web/src/components/ui/core/Icon/Icon.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe('Icon', ...)` block in `apps/web/src/components/ui/core/Icon/Icon.test.tsx`:

```typescript
  it('renders the wand-2 icon', () => {
    const { container } = render(<Icon name="wand-2" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Icon.test.tsx`
Expected: FAIL — TypeScript error / runtime failure, `'wand-2'` is not a valid `IconName` yet.

- [ ] **Step 3: Add the icon**

In `apps/web/src/components/ui/core/Icon/Icon.tsx`, change the import line from:

```typescript
import { Sparkles, GitBranch, Plug, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon } from 'lucide-react';
```

to:

```typescript
import { Sparkles, GitBranch, Plug, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon, Wand2 } from 'lucide-react';
```

And add one entry to the `ICONS` map:

```typescript
const ICONS = {
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  'check-circle-2': CheckCircle2,
  'alert-circle': AlertCircle,
  info: Info,
  copy: Copy,
  check: Check,
  library: Library,
  'plus-circle': PlusCircle,
  sun: Sun,
  moon: Moon,
  'wand-2': Wand2,
} as const;
```

Nothing else in the file changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Icon.test.tsx`
Expected: PASS — all 4 tests (3 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/core/Icon/Icon.tsx apps/web/src/components/ui/core/Icon/Icon.test.tsx
git commit -m "feat: add wand-2 icon for the recommend nav item"
```

## Context

This is Task 9. `apps/web/src/components/ui/core/Icon/Icon.tsx` only registers the specific Lucide icons this app actually uses (12 so far, from the design-system plan). `wand-2` (component name `Wand2` in `lucide-react`) is needed for the "Recomendar" nav item (Task 10) — it wasn't registered before because the recommend feature didn't exist yet.

---

### Task 10: "Recomendar" nav item in `Sidebar`

**Files:**
- Modify: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`
- Modify: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe('Sidebar', ...)` block in `apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx`:

```typescript
  it('renders a navigation link to the recommend route', () => {
    render(
      <MemoryRouter>
        <Sidebar theme="dark" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Recomendar' })).toHaveAttribute('href', '/recommend');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- navigation/Sidebar/Sidebar.test.tsx`
Expected: FAIL — no link named "Recomendar" exists yet.

- [ ] **Step 3: Add the nav item**

In `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`, change:

```typescript
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Catálogo', icon: 'library', end: true },
  { to: '/add', label: 'Adicionar', icon: 'plus-circle' },
];
```

to:

```typescript
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Catálogo', icon: 'library', end: true },
  { to: '/add', label: 'Adicionar', icon: 'plus-circle' },
  { to: '/recommend', label: 'Recomendar', icon: 'wand-2' },
];
```

Nothing else in the file changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- navigation/Sidebar/Sidebar.test.tsx`
Expected: PASS — all 4 tests (3 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx
git commit -m "feat: bring back the Recomendar nav item now that the feature exists"
```

## Context

This is Task 10. `Sidebar`'s `NAV_ITEMS` array drives the rendered nav links directly (see `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`'s `.map()` over it) — adding a third entry is a pure additive change. The design-system plan (already shipped) deliberately dropped this exact nav item because the route didn't exist yet; this task is what makes it exist.

---

### Task 11: `RecommendPage`

**Files:**
- Create: `apps/web/src/pages/RecommendPage.tsx`
- Test: `apps/web/src/pages/RecommendPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecommendPage } from './RecommendPage.js';
import * as api from '../api/client.js';
import type { Item } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'PDF Parser',
    sourceType: 'local_path',
    sourceValue: 'x',
    localPath: '/skillvault/skills/pdf-parser',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('RecommendPage', () => {
  it('submits an idea and renders the recommended items', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem(), motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('link', { name: 'PDF Parser' })).toHaveAttribute('href', '/items/1');
    expect(screen.getByText('Ajuda a extrair texto de PDFs')).toBeInTheDocument();
    expect(screen.getByText('Nenhum repositório do catálogo cobre essa necessidade.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum MCP do catálogo cobre essa necessidade.')).toBeInTheDocument();
  });

  it('shows an error message when the API call fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockRejectedValue(
      new Error('Não foi possível gerar recomendações no momento. Tente novamente.')
    );

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar recomendações no momento. Tente novamente.'
    );
  });

  it('renders the query history', async () => {
    vi.spyOn(api, 'listConsultas').mockResolvedValue([
      { id: 1, ideia: 'app de leitura de PDFs', createdAt: '2026-07-20T10:00:00.000Z' },
    ]);

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/app de leitura de PDFs/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- pages/RecommendPage.test.tsx`
Expected: FAIL — `./RecommendPage.js` does not exist yet.

- [ ] **Step 3: Implement the page**

```typescript
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations, listConsultas } from '../api/client.js';
import type { Consulta, RecommendedItem, RecommendResult } from '../types.js';
import { Textarea } from '../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';

const EMPTY_MESSAGES = {
  skills: 'Nenhuma skill do catálogo cobre essa necessidade.',
  repos: 'Nenhum repositório do catálogo cobre essa necessidade.',
  mcps: 'Nenhum MCP do catálogo cobre essa necessidade.',
};

interface ResultColumnProps {
  title: string;
  items: RecommendedItem[];
  emptyMessage: string;
}

function ResultColumn({ title, items, emptyMessage }: ResultColumnProps) {
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
    try {
      const data = await getRecommendations(ideia);
      setResult(data);
      setStatus('idle');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
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
          <ResultColumn title="Skills" items={result.skills} emptyMessage={EMPTY_MESSAGES.skills} />
          <ResultColumn title="Repos" items={result.repos} emptyMessage={EMPTY_MESSAGES.repos} />
          <ResultColumn title="MCPs" items={result.mcps} emptyMessage={EMPTY_MESSAGES.mcps} />
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

- [ ] **Step 4: Wire the route in `App.tsx`**

In `apps/web/src/App.tsx`, change:

```typescript
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';
import { AddPage } from './pages/AddPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="add" element={<AddPage />} />
      </Route>
    </Routes>
  );
}

export default App;
```

to:

```typescript
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';
import { AddPage } from './pages/AddPage.js';
import { RecommendPage } from './pages/RecommendPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="add" element={<AddPage />} />
        <Route path="recommend" element={<RecommendPage />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -w apps/web -- pages/RecommendPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite to confirm nothing else broke**

Run: `npm run test -w apps/web`
Expected: PASS — all existing tests plus the new ones (App.tsx's route addition doesn't change what `App.test.tsx` checks — it only asserts the Sidebar heading — so it stays green unmodified).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/RecommendPage.tsx apps/web/src/pages/RecommendPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: add the RecommendPage and wire the /recommend route"
```

## Context

This is Task 11, the frontend page tying everything together. It follows the exact page-level patterns already established across the app: `Textarea`/`Button`/`StatusMessage` from the design system (built in the earlier design-system plan), a `status: 'idle' | 'submitting' | 'error'` state machine identical in shape to every form in `apps/web/src/pages/forms/`, and a `Link` to `/items/:id` matching `ItemCard`'s exact navigation pattern. The three empty-block messages (`EMPTY_MESSAGES`) are fixed frontend strings — the API only returns empty arrays, not messages (see Task 6) — matching how `CatalogPage.tsx` already hardcodes "Nenhum item cadastrado ainda." for its own empty state rather than sourcing it from the API.

The history `useEffect` depends on `[result]` so the list refreshes right after a successful new query, showing the just-submitted idea without a page reload.

---

### Task 12: Manual end-to-end verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run dev` from the repo root.
Expected: backend on port 3001, frontend on port 5173.

- [ ] **Step 2: Verify the nav and empty-catalog path**

Open `http://localhost:5173`, click "Recomendar" in the sidebar, confirm it navigates to `/recommend` and shows the idea textarea. If the catalog is empty on this machine, submit any idea and confirm all three columns show their "Nenhum ... cobre essa necessidade." messages instantly (no LLM call needed for an empty catalog, per Task 5).

- [ ] **Step 3: Verify a real recommendation (requires Ollama running locally, or a `GEMINI_API_KEY` set)**

With at least one item in the catalog (add one via `/add` if needed) and Ollama running (`ollama serve`, with the model from `OLLAMA_MODEL`/default `llama3.2` pulled) or `GEMINI_API_KEY` set in the environment, submit an idea related to that item. Confirm a recommendation appears with a `motivo`, links to the item's detail page, and that the history list below now shows this query.

- [ ] **Step 4: Verify the LLM-unavailable path**

Stop Ollama (or ensure no `GEMINI_API_KEY` is set and Ollama isn't running) and submit another idea. Confirm the error message "Não foi possível gerar recomendações no momento. Tente novamente." appears, and that reloading the page does NOT show this failed query in the history (only successful queries are persisted, per Task 6).

- [ ] **Step 5: Run the full monorepo test suite and production build**

Run: `npm run test`
Expected: PASS — both `apps/server` and `apps/web` suites green.

Run: `npm run build -w apps/web`
Expected: succeeds with no errors.

---

### Task 13: Update project continuity doc

**Files:**
- Modify: `PROJECT_CONTEXT.md`

- [ ] **Step 1: Move the recommender from "O que falta" to "O que já foi construído"**

In `PROJECT_CONTEXT.md`, remove item 1 from the `## O que falta (próximos passos)` list (the "Recomendador de projeto" bullet) and renumber the PWA bullet to `1.`, updating the closing sentence to reflect that only one piece remains:

Replace:

```markdown
## O que falta (próximos passos)

Do escopo original, ainda **não implementado**:

1. **Recomendador de projeto** (`/recommend` + `POST /api/recommend`): campo de texto livre → LLM cruza com o catálogo → retorna skills/repos/MCPs recomendados em 3 blocos, com anti-alucinação (nunca inventa item que não existe no catálogo) e histórico de consultas (tabela `consultas`, já existe no schema mas não é usada ainda).
2. **PWA**: `vite-plugin-pwa`, manifest (ícones, nome, theme_color), service worker para cache do app shell + última resposta de `GET /api/items` (visualização offline do catálogo).
3. Nada além disso do escopo original ficou pendente — essas são as duas únicas peças que faltam para o app estar 100% conforme o pedido inicial.
```

with:

```markdown
## O que falta (próximos passos)

Do escopo original, ainda **não implementado**:

1. **PWA**: `vite-plugin-pwa`, manifest (ícones, nome, theme_color), service worker para cache do app shell + última resposta de `GET /api/items` (visualização offline do catálogo).
2. Nada além disso do escopo original ficou pendente — essa é a única peça que falta para o app estar 100% conforme o pedido inicial.
```

Then, in the `### Backend (\`apps/server\`)` bullet list (right after the existing bullets, before the "X testes passando." line), add:

```markdown
- **Recomendador**: `POST /api/recommend` (anti-alucinação por id, fallback Ollama → Gemini, sem fallback manual) e `GET /api/consultas` (últimas 10) — ver `docs/superpowers/specs/2026-07-20-recommender-design.md`.
```

And in the `### Frontend (\`apps/web\`)` heading, remove the `— completo (exceto recomendador e PWA)` qualifier and its bullet list gets one new line right after "Identidade visual":

```markdown
- **Recomendar** (`/recommend`): textarea de ideia → 3 colunas (Skills/Repos/MCPs) com nome, motivo, caminho, e histórico das últimas 10 consultas abaixo.
```

Update both test-count lines (`X testes passando.`) in the Backend and Frontend sections to the actual counts after running `npm run test` in Task 12 (read the real numbers from that output — don't guess).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_CONTEXT.md
git commit -m "docs: mark the recommender as implemented in PROJECT_CONTEXT.md"
```

## Spec Coverage Check

- §1 (prompt/API, anti-alucinação por id, catálogo vazio, falha total da LLM, endpoints, persistência de consultas) → Tasks 1-6.
- §2 (RecommendPage, colunas, histórico, Sidebar, ícone, api client) → Tasks 7-11.
- §3 (testes backend e frontend) → covered per-task above (each task's own test file) + Task 12's manual verification and full-suite run.
- §4 (fora de escopo: expandir histórico, paginação, deletar consultas, editar item da tela de recomendar, PWA) → nothing in this plan builds any of those — confirmed out of scope.
