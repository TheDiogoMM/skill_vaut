# Catalog & Item Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SkillVault frontend (`apps/web`): a desktop-first React catalog UI where the user can browse/search/filter items grouped by category, view an item's rendered content (README/SKILL.md/MCP config), edit its category/tags inline, add new skills/repos/MCPs, and rename/merge categories — all against the already-shipped backend REST API.

**Architecture:** Vite + React + TypeScript SPA in `apps/web`, using `react-router-dom` for client-side routing and the Fastify backend's REST API via a small typed `fetch` wrapper (no state-management library — component-local state is sufficient at this scope). Dark-mode-by-default theming via CSS custom properties, desktop-first layout (fixed sidebar, collapses at a narrow-viewport breakpoint rather than being built mobile-first). One small backend addition is needed first: the item detail endpoint doesn't yet return file content, which the detail page requires.

**Tech Stack:** React 18, TypeScript, Vite 6, react-router-dom 6, react-markdown 9, Vitest + React Testing Library + jsdom for tests. Backend: Fastify (existing).

**Related docs:** `docs/superpowers/specs/2026-07-16-skillvault-design.md` (§6 Frontend), `docs/superpowers/plans/2026-07-16-backend-ingestion.md` (already implemented, on `main`).

**Scope note:** This plan covers the Catálogo, Detalhe, Adicionar, and Categorias sections of §6 of the spec. The Recomendar page (and its `/api/recommend` backend endpoint) and the PWA manifest/service-worker are separate follow-up plans. One deliberate interpretation of §6: the spec asks the Add flow to "show an enrichment preview before confirming, with the option to edit before saving." Splitting ingestion into a preview-then-confirm two-phase backend flow is a large redesign of the already-shipped ingestion pipeline (it currently clones/copies + enriches + persists atomically in one request). Instead, this plan lands the user on the new item's detail page immediately after creation (Task 9/10), where the LLM-generated summary/category/tags are visible and editable inline (Task 8) before the user navigates away — satisfying the spirit of "see and adjust the enrichment result before treating it as final" without a backend redesign.

---

## Task 1 (Backend): shared content helper + `content` field on item detail

**Files:**
- Create: `apps/server/src/content.ts`
- Test: `apps/server/src/content.test.ts`
- Modify: `apps/server/src/ingestion/repo.ts`
- Modify: `apps/server/src/ingestion/skill.ts`
- Modify: `apps/server/src/routes/items.ts`
- Test: `apps/server/src/routes/items.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

`apps/server/src/content.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFirstExisting, readItemContent } from './content.js';
import type { Item } from './types.js';

describe('readFirstExisting', () => {
  const dir = path.join(os.tmpdir(), `skillvault-content-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the first candidate file that exists', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# Hello');
    expect(readFirstExisting(dir, ['SKILL.md', 'README.md'])).toBe('# Hello');
  });

  it('returns an empty string when none exist', () => {
    fs.mkdirSync(dir, { recursive: true });
    expect(readFirstExisting(dir, ['SKILL.md', 'README.md'])).toBe('');
  });
});

function baseItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'x',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/tmp/does-not-exist',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('readItemContent', () => {
  const dir = path.join(os.tmpdir(), `skillvault-content-item-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads README.md for a repo item', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# Repo content');
    expect(readItemContent(baseItem({ type: 'repo', localPath: dir }))).toBe('# Repo content');
  });

  it('reads SKILL.md for a skill item', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Skill content');
    expect(readItemContent(baseItem({ type: 'skill', localPath: dir }))).toBe('# Skill content');
  });

  it('reads the raw file for an mcp item', () => {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, '{"mcpServers":{}}');
    expect(readItemContent(baseItem({ type: 'mcp', localPath: filePath }))).toBe('{"mcpServers":{}}');
  });

  it('returns an empty string when the path does not exist', () => {
    expect(readItemContent(baseItem({ type: 'repo', localPath: dir }))).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `content.ts` does not exist.

- [ ] **Step 3: Implement `apps/server/src/content.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Item } from './types.js';

export const REPO_CONTENT_CANDIDATES = ['README.md', 'readme.md', 'README'];
export const SKILL_CONTENT_CANDIDATES = ['SKILL.md', 'README.md', 'readme.md'];

export function readFirstExisting(dir: string, candidates: string[]): string {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

export function readItemContent(item: Item): string {
  try {
    if (item.type === 'mcp') {
      return fs.existsSync(item.localPath) ? fs.readFileSync(item.localPath, 'utf-8') : '';
    }
    const candidates = item.type === 'skill' ? SKILL_CONTENT_CANDIDATES : REPO_CONTENT_CANDIDATES;
    return readFirstExisting(item.localPath, candidates);
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server`
Expected: PASS

- [ ] **Step 5: Refactor `apps/server/src/ingestion/repo.ts` to use the shared helper**

Replace the entire file content with:

```ts
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import { readFirstExisting, REPO_CONTENT_CANDIDATES } from '../content.js';
import type { Item } from '../types.js';

export interface IngestRepoInput {
  name: string;
  url: string;
}

export function assertSafeRepoUrl(url: string): void {
  if (url.startsWith('-')) {
    throw new Error('invalid repository url');
  }
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  assertSafeRepoUrl(input.url);

  const { fullPath } = resolveUniqueDir(config.reposDir, input.name);

  await simpleGit().clone(input.url, fullPath);

  const readme = readFirstExisting(fullPath, REPO_CONTENT_CANDIDATES);
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

(This deletes the file's local `README_CANDIDATES`/`readFirstExisting` duplicate and the now-unused `fs`/`path` imports, replacing them with the shared module. Nothing else about `ingestRepo`'s behavior changes.)

- [ ] **Step 6: Refactor `apps/server/src/ingestion/skill.ts` to use the shared helper**

Replace the entire file content with:

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
import { assertSafeRepoUrl } from './repo.js';
import { readFirstExisting, SKILL_CONTENT_CANDIDATES } from '../content.js';
import type { Item, GlobalInstallStatus } from '../types.js';

const execFileAsync = promisify(execFile);

export type SkillSource =
  | { kind: 'local_path'; path: string }
  | { kind: 'upload'; tempFilePath: string; isZip: boolean; originalFilename?: string }
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
      const destName = input.source.originalFilename
        ? path.basename(input.source.originalFilename)
        : path.basename(input.source.tempFilePath);
      fs.copyFileSync(input.source.tempFilePath, path.join(fullPath, destName));
    }
  } else {
    sourceType = 'url';
    sourceValue = input.source.url;
    assertSafeRepoUrl(input.source.url);
    await simpleGit().clone(input.source.url, fullPath);
    globalInstallStatus = await globalInstall(input.source.url);
  }

  const content = readFirstExisting(fullPath, SKILL_CONTENT_CANDIDATES);
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

(Same refactor: deletes the local `SKILL_FILE_CANDIDATES`/`readFirstExisting` duplicate, imports the shared one. `fs`/`path` are still needed here for `cpSync`/`mkdirSync`/`copyFileSync`/`basename`, so those imports stay.)

- [ ] **Step 7: Run full test suite to verify the refactor didn't break anything**

Run: `npm run test -w apps/server`
Expected: PASS (all 59 pre-existing tests, unchanged behavior)

- [ ] **Step 8: Write the failing test for the `content` field on item detail**

Add this `describe` block to the end of `apps/server/src/routes/items.test.ts`:

```ts
describe('GET /api/items/:id content field', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-content-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('includes the raw config content for an mcp item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config });

    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'mcp',
        name: 'MCP com conteudo',
        config: { mcpServers: { x: { command: 'npx' } } },
      },
    });
    const item = created.json();

    const response = await app.inject({ method: 'GET', url: `/api/items/${item.id}` });
    const body = response.json();
    expect(body.content).toContain('"command": "npx"');
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npm run test -w apps/server`
Expected: FAIL — `content` is `undefined` on the response body.

- [ ] **Step 10: Add the `content` field to the detail route in `apps/server/src/routes/items.ts`**

Add this import near the top of the file, alongside the existing imports (after the `regenerateIndex` import):

```ts
import { readItemContent } from '../content.js';
```

Then replace the `GET /api/items/:id` handler:

```ts
    app.get('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      return item;
    });
```

with:

```ts
    app.get('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      return { ...item, content: readItemContent(item) };
    });
```

(Every other route in this file — list, patch, delete — is unchanged. Only the single-item GET handler gains the `content` field.)

- [ ] **Step 11: Run full test suite to verify everything passes**

Run: `npm run test -w apps/server`
Expected: PASS (60 tests — the 59 pre-existing plus the new content-field test)

- [ ] **Step 12: Commit**

```bash
git add apps/server/src/content.ts apps/server/src/content.test.ts apps/server/src/ingestion/repo.ts apps/server/src/ingestion/skill.ts apps/server/src/routes/items.ts apps/server/src/routes/items.test.ts
git commit -m "feat: add shared content helper and content field on item detail"
```

---

## Task 2: `apps/web` scaffold (Vite + React + TS) + test tooling + dev proxy

**Files:**
- Modify: `package.json` (root)
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/test/setup.ts`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Update the root `package.json` to run both apps and add `concurrently`**

Replace `package.json` (root) with:

```json
{
  "name": "skillvault",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm run dev -w apps/server\" \"npm run dev -w apps/web\"",
    "test": "npm run test -w apps/server && npm run test -w apps/web"
  },
  "devDependencies": {
    "concurrently": "^9.1.2"
  }
}
```

- [ ] **Step 2: Create `apps/web/package.json`**

```json
{
  "name": "@skillvault/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.1",
    "react-markdown": "^9.0.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Create `apps/web/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 4: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `apps/web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SkillVault</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `apps/web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Install dependencies**

Run (from repo root `C:\Users\Diogo\Projetos\SkillVault`): `npm install`
Expected: installs React/Vite/Vitest/RTL for `apps/web` plus `concurrently` at the root, updates `package-lock.json`.

- [ ] **Step 9: Write the failing test**

`apps/web/src/App.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.tsx';

describe('App', () => {
  it('renders the SkillVault heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'SkillVault' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `App.tsx` does not exist.

- [ ] **Step 11: Implement `apps/web/src/App.tsx`**

```tsx
function App() {
  return (
    <div>
      <h1>SkillVault</h1>
    </div>
  );
}

export default App;
```

- [ ] **Step 12: Implement `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add package.json apps/web package-lock.json
git commit -m "feat: scaffold apps/web with Vite, React, and Vitest"
```

---

## Task 3: API client

**Files:**
- Create: `apps/web/src/types.ts`
- Create: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Create `apps/web/src/types.ts`**

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

export interface ItemDetail extends Item {
  content: string;
}

export interface ItemFilters {
  q?: string;
  type?: ItemType;
  category?: number;
  tag?: string;
}

export interface ItemUpdate {
  categoryId?: number | null;
  summary?: string | null;
  utility?: string | null;
  tags?: string[];
}
```

- [ ] **Step 2: Write the failing test**

`apps/web/src/api/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
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

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = ok ? 200 : 400 } = init;
  const mock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('listItems builds a query string from filters', async () => {
    const mock = mockFetchOnce([]);
    await listItems({ q: 'foo', type: 'repo', category: 2, tag: 'bar' });
    expect(mock).toHaveBeenCalledWith('/api/items?q=foo&type=repo&category=2&tag=bar', expect.anything());
  });

  it('listItems omits the query string when there are no filters', async () => {
    const mock = mockFetchOnce([]);
    await listItems();
    expect(mock).toHaveBeenCalledWith('/api/items', expect.anything());
  });

  it('getItem fetches a single item by id', async () => {
    mockFetchOnce({ id: 1, name: 'x', content: '# hi' });
    const item = await getItem(1);
    expect(item.content).toBe('# hi');
  });

  it('createItem sends a JSON body with a Content-Type header for repo type', async () => {
    const mock = mockFetchOnce({ id: 1 });
    await createItem({ type: 'repo', name: 'x', url: 'https://example.com/x.git' });
    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ type: 'repo', name: 'x', url: 'https://example.com/x.git' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('createItem sends FormData for skill upload without a JSON content-type header', async () => {
    const mock = mockFetchOnce({ id: 1 });
    const file = new File(['# Skill'], 'SKILL.md', { type: 'text/markdown' });
    await createItem({ type: 'skill', name: 'x', source_type: 'upload', file });
    const [, init] = mock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });

  it('updateItem sends a PATCH request to the item URL', async () => {
    const mock = mockFetchOnce({ id: 1, summary: 'novo' });
    await updateItem(1, { summary: 'novo' });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/items/1');
    expect(init.method).toBe('PATCH');
  });

  it('deleteItem sends a DELETE request and resolves on a 204 response', async () => {
    mockFetchOnce({}, { status: 204 });
    await expect(deleteItem(1)).resolves.toBeUndefined();
  });

  it('throws with the server error message on a failed request', async () => {
    mockFetchOnce({ error: 'item not found' }, { ok: false, status: 404 });
    await expect(getItem(999)).rejects.toThrow('item not found');
  });

  it('listCategories and createCategory hit the categories endpoint', async () => {
    mockFetchOnce([{ id: 1, name: 'dev-tools', createdAt: '' }]);
    const categories = await listCategories();
    expect(categories).toHaveLength(1);

    const mock = mockFetchOnce({ id: 2, name: 'automacao', createdAt: '' });
    await createCategory('automacao');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories');
    expect(JSON.parse(init.body)).toEqual({ name: 'automacao' });
  });

  it('renameCategory sends a PATCH with the new name', async () => {
    const mock = mockFetchOnce({ id: 1, name: 'novo-nome', createdAt: '' });
    await renameCategory(1, 'novo-nome');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories/1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'novo-nome' });
  });

  it('mergeCategory posts source and target ids', async () => {
    const mock = mockFetchOnce({}, { status: 204 });
    await mergeCategory(1, 2);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories/1/merge');
    expect(JSON.parse(init.body)).toEqual({ target_id: 2 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `client.ts` does not exist.

- [ ] **Step 4: Implement `apps/web/src/api/client.ts`**

```ts
import type { Category, Item, ItemDetail, ItemFilters, ItemUpdate } from '../types.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isJsonBody = typeof init?.body === 'string';
  const response = await fetch(path, {
    ...init,
    headers: isJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorBody.error ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQuery(filters: ItemFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.category !== undefined) params.set('category', String(filters.category));
  if (filters.tag) params.set('tag', filters.tag);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listItems(filters?: ItemFilters): Promise<Item[]> {
  return request<Item[]>(`/api/items${buildQuery(filters)}`);
}

export function getItem(id: number): Promise<ItemDetail> {
  return request<ItemDetail>(`/api/items/${id}`);
}

export function updateItem(id: number, patch: ItemUpdate): Promise<Item> {
  return request<Item>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteItem(id: number): Promise<void> {
  return request<void>(`/api/items/${id}`, { method: 'DELETE' });
}

export interface CreateRepoInput {
  type: 'repo';
  name: string;
  url: string;
}

export interface CreateMcpInput {
  type: 'mcp';
  name: string;
  config: Record<string, unknown>;
  description?: string;
}

export type CreateSkillInput =
  | { type: 'skill'; name: string; source_type: 'local_path'; path: string }
  | { type: 'skill'; name: string; source_type: 'url'; url: string }
  | { type: 'skill'; name: string; source_type: 'upload'; file: File };

export type CreateItemInput = CreateRepoInput | CreateMcpInput | CreateSkillInput;

export function createItem(input: CreateItemInput): Promise<Item> {
  if (input.type === 'skill' && input.source_type === 'upload') {
    const formData = new FormData();
    formData.set('type', input.type);
    formData.set('name', input.name);
    formData.set('source_type', input.source_type);
    formData.set('file', input.file);
    return request<Item>('/api/items', { method: 'POST', body: formData });
  }
  return request<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) });
}

export function listCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories');
}

export function createCategory(name: string): Promise<Category> {
  return request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
}

export function renameCategory(id: number, name: string): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function mergeCategory(sourceId: number, targetId: number): Promise<void> {
  return request<void>(`/api/categories/${sourceId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId }),
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/api
git commit -m "feat: add typed API client for the backend REST API"
```

---

## Task 4: Theme + App shell/routing

**Files:**
- Create: `apps/web/src/theme.css`
- Create: `apps/web/src/hooks/useTheme.ts`
- Test: `apps/web/src/hooks/useTheme.test.ts`
- Create: `apps/web/src/components/Layout.tsx`
- Test: `apps/web/src/components/Layout.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Create `apps/web/src/theme.css`**

```css
:root {
  color-scheme: dark;
  --color-bg: #0f1115;
  --color-surface: #1a1d24;
  --color-surface-alt: #232733;
  --color-border: #2e3340;
  --color-text: #e6e8ec;
  --color-text-muted: #9aa2b1;
  --color-accent: #6d8dff;
  --color-danger: #ef4444;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --radius: 8px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 16px;
  --spacing-4: 24px;
}

:root[data-theme='light'] {
  color-scheme: light;
  --color-bg: #f5f6f8;
  --color-surface: #ffffff;
  --color-surface-alt: #eef0f4;
  --color-border: #d8dbe2;
  --color-text: #14161a;
  --color-text-muted: #5b6270;
  --color-accent: #3355dd;
  --color-danger: #d92d20;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}

a {
  color: var(--color-accent);
}

.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

.layout__nav {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--spacing-3);
}

.layout__main {
  padding: var(--spacing-4);
}

@media (max-width: 720px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .layout__nav {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
```

Note: this is desktop-first by construction — the base `.layout` rule is the fixed two-column sidebar layout, and the single `max-width: 720px` query only narrows it for small viewports. There is no mobile-first `min-width` progression.

- [ ] **Step 2: Write the failing test for the theme hook**

`apps/web/src/hooks/useTheme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme.js';

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark and sets the data-theme attribute', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles to light and persists it to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('skillvault-theme')).toBe('light');
  });

  it('reads a previously stored theme on mount', () => {
    window.localStorage.setItem('skillvault-theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `useTheme.ts` does not exist.

- [ ] **Step 4: Implement `apps/web/src/hooks/useTheme.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'skillvault-theme';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 6: Write the failing test for the Layout component**

`apps/web/src/components/Layout.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './Layout.js';

describe('Layout', () => {
  it('renders navigation links, the routed content, and toggles the theme', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Conteúdo</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adicionar' })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Modo claro' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Modo escuro' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `Layout.tsx` does not exist.

- [ ] **Step 8: Implement `apps/web/src/components/Layout.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';

export function Layout() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <nav className="layout__nav">
        <h1>SkillVault</h1>
        <NavLink to="/" end>
          Catálogo
        </NavLink>
        <NavLink to="/add">Adicionar</NavLink>
        <button type="button" onClick={toggleTheme}>
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
      </nav>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 10: Wire routing into `apps/web/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<div>Catálogo (em construção)</div>} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 11: Update `apps/web/src/main.tsx` to provide the router and load the theme CSS**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 12: Update `apps/web/src/App.test.tsx` — `App` now needs a Router ancestor**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.tsx';

describe('App', () => {
  it('renders the SkillVault heading via the layout', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'SkillVault' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 13: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/theme.css apps/web/src/hooks apps/web/src/components/Layout.tsx apps/web/src/components/Layout.test.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/main.tsx
git commit -m "feat: add dark-mode-default theme and app shell routing"
```

---

## Task 5: Catalog page (list, grouped by category)

**Files:**
- Create: `apps/web/src/pages/CatalogPage.tsx`
- Test: `apps/web/src/pages/CatalogPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/CatalogPage.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from './CatalogPage.js';
import * as api from '../api/client.js';
import type { Item } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: 'x',
    categoryId: null,
    summary: 'Resumo A',
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('CatalogPage', () => {
  it('groups items by category and renders them', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([
      sampleItem({ id: 1, name: 'Repo A', categoryId: 1 }),
      sampleItem({ id: 2, type: 'mcp', name: 'MCP B', categoryId: null }),
    ]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([{ id: 1, name: 'dev-tools', createdAt: '' }]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('dev-tools')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repo A' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MCP B' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no items', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum item cadastrado ainda.')).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.spyOn(api, 'listItems').mockRejectedValue(new Error('network error'));
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `CatalogPage.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/pages/CatalogPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems, listCategories } from '../api/client.js';
import type { Category, Item } from '../types.js';

interface GroupedItems {
  category: string;
  items: Item[];
}

function groupByCategory(items: Item[], categories: Category[]): GroupedItems[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const name = item.categoryId !== null ? nameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([listItems(), listCategories()])
      .then(([itemsResult, categoriesResult]) => {
        if (cancelled) return;
        setItems(itemsResult);
        setCategories(categoriesResult);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <p>Carregando catálogo...</p>;
  if (status === 'error') return <p role="alert">Não foi possível carregar o catálogo.</p>;
  if (items.length === 0) return <p>Nenhum item cadastrado ainda.</p>;

  const groups = groupByCategory(items, categories);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.category}>
          <h2>{group.category}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <Link to={`/items/${item.id}`}>{item.name}</Link> <span>({item.type})</span>
                <p>{item.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Wire `CatalogPage` in as the index route — update `apps/web/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 6: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/CatalogPage.tsx apps/web/src/pages/CatalogPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: add catalog page grouped by category"
```

---

## Task 6: Search + filter bar

**Files:**
- Create: `apps/web/src/components/SearchFilterBar.tsx`
- Test: `apps/web/src/components/SearchFilterBar.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`

- [ ] **Step 1: Write the failing test for the filter bar**

`apps/web/src/components/SearchFilterBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilterBar } from './SearchFilterBar.js';

const categories = [{ id: 1, name: 'dev-tools', createdAt: '' }];

describe('SearchFilterBar', () => {
  it('reports filter changes as the user types and selects', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchFilterBar categories={categories} onChange={onChange} />);

    await user.type(screen.getByLabelText('Buscar'), 'ollama');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: '', category: '', tag: '' });

    await user.selectOptions(screen.getByLabelText('Tipo'), 'repo');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '', tag: '' });

    await user.selectOptions(screen.getByLabelText('Categoria'), '1');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '1', tag: '' });

    await user.type(screen.getByLabelText('Tag'), 'dev-tools');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '1', tag: 'dev-tools' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `SearchFilterBar.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/components/SearchFilterBar.tsx`**

```tsx
import { useState } from 'react';
import type { Category, ItemType } from '../types.js';

export interface Filters {
  q: string;
  type: ItemType | '';
  category: string;
  tag: string;
}

interface SearchFilterBarProps {
  categories: Category[];
  onChange: (filters: Filters) => void;
}

export function SearchFilterBar({ categories, onChange }: SearchFilterBarProps) {
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });

  function update(partial: Partial<Filters>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    onChange(next);
  }

  return (
    <div role="search">
      <input
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar"
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
      />
      <select
        aria-label="Tipo"
        value={filters.type}
        onChange={(e) => update({ type: e.target.value as ItemType | '' })}
      >
        <option value="">Todos os tipos</option>
        <option value="skill">Skill</option>
        <option value="repo">Repo</option>
        <option value="mcp">MCP</option>
      </select>
      <select aria-label="Categoria" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Filtrar por tag"
        aria-label="Tag"
        value={filters.tag}
        onChange={(e) => update({ tag: e.target.value })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Write the failing test for filtered refetching in `CatalogPage`**

Add this test to `apps/web/src/pages/CatalogPage.test.tsx` (needs `userEvent` and `waitFor` — add these imports at the top of the file: `import userEvent from '@testing-library/user-event';` and add `waitFor` to the existing `@testing-library/react` import so it reads `import { render, screen, waitFor } from '@testing-library/react';`):

```tsx
it('refetches items when the filter changes', async () => {
  const user = userEvent.setup();
  const listItemsSpy = vi.spyOn(api, 'listItems').mockResolvedValue([]);
  vi.spyOn(api, 'listCategories').mockResolvedValue([]);

  render(
    <MemoryRouter>
      <CatalogPage />
    </MemoryRouter>
  );

  await screen.findByText('Nenhum item cadastrado ainda.');
  listItemsSpy.mockClear();

  await user.type(screen.getByLabelText('Buscar'), 'ollama');

  await waitFor(
    () => {
      expect(listItemsSpy).toHaveBeenCalledWith({ q: 'ollama' });
    },
    { timeout: 2000 }
  );
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `SearchFilterBar` is not rendered inside `CatalogPage` yet, so `getByLabelText('Buscar')` throws.

- [ ] **Step 7: Integrate the filter bar into `apps/web/src/pages/CatalogPage.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems, listCategories } from '../api/client.js';
import { SearchFilterBar, type Filters } from '../components/SearchFilterBar.js';
import type { Category, Item, ItemFilters } from '../types.js';

interface GroupedItems {
  category: string;
  items: Item[];
}

function groupByCategory(items: Item[], categories: Category[]): GroupedItems[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const name = item.categoryId !== null ? nameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

function toApiFilters(filters: Filters): ItemFilters {
  const apiFilters: ItemFilters = {};
  if (filters.q) apiFilters.q = filters.q;
  if (filters.type) apiFilters.type = filters.type;
  if (filters.category) apiFilters.category = Number(filters.category);
  if (filters.tag) apiFilters.tag = filters.tag;
  return apiFilters;
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      Promise.all([listItems(toApiFilters(filters)), listCategories()])
        .then(([itemsResult, categoriesResult]) => {
          if (cancelled) return;
          setItems(itemsResult);
          setCategories(categoriesResult);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [filters]);

  const groups = groupByCategory(items, categories);

  return (
    <div>
      <SearchFilterBar categories={categories} onChange={setFilters} />
      {status === 'loading' && <p>Carregando catálogo...</p>}
      {status === 'error' && <p role="alert">Não foi possível carregar o catálogo.</p>}
      {status === 'ready' && items.length === 0 && <p>Nenhum item cadastrado ainda.</p>}
      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.category}>
            <h2>{group.category}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link to={`/items/${item.id}`}>{item.name}</Link> <span>({item.type})</span>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
```

The 250ms `setTimeout` debounces refetches so a fast typist doesn't trigger a request per keystroke; it's short enough that Testing Library's default 1000ms `findBy`/`waitFor` timeout comfortably covers it without needing fake timers.

- [ ] **Step 8: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/SearchFilterBar.tsx apps/web/src/components/SearchFilterBar.test.tsx apps/web/src/pages/CatalogPage.tsx apps/web/src/pages/CatalogPage.test.tsx
git commit -m "feat: add search/filter bar wired into the catalog page"
```

---

## Task 7: Item detail page

**Files:**
- Create: `apps/web/src/pages/ItemDetailPage.tsx`
- Test: `apps/web/src/pages/ItemDetailPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/ItemDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemDetailPage } from './ItemDetailPage.js';
import * as api from '../api/client.js';
import type { ItemDetail } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleDetail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/tmp/repo-a',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '',
    updatedAt: '',
    content: '',
    ...overrides,
  };
}

function renderWithRoute(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/items/${id}`]}>
      <Routes>
        <Route path="/items/:id" element={<ItemDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ItemDetailPage', () => {
  it('renders markdown content for a repo item', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ summary: 'Resumo', utility: 'Utilidade', tags: ['a'], content: '# Título\n\nTexto' })
    );

    renderWithRoute('1');

    expect(await screen.findByRole('heading', { name: 'Repo A', level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Título', level: 1 })).toBeInTheDocument();
  });

  it('renders raw JSON for an mcp item', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ id: 2, type: 'mcp', name: 'MCP B', localPath: '/tmp/mcp-b.json', content: '{"mcpServers":{}}' })
    );

    renderWithRoute('2');

    expect(await screen.findByText('{"mcpServers":{}}')).toBeInTheDocument();
  });

  it('copies the local path to the clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithRoute('1');

    const button = await screen.findByRole('button', { name: 'Copiar caminho' });
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith('/tmp/repo-a');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
    });
  });

  it('shows an error state when the item cannot be loaded', async () => {
    vi.spyOn(api, 'getItem').mockRejectedValue(new Error('not found'));
    renderWithRoute('999');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `ItemDetailPage.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/pages/ItemDetailPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem } from '../api/client.js';
import type { ItemDetail } from '../types.js';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    getItem(Number(id))
      .then((result) => {
        if (cancelled) return;
        setItem(result);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy() {
    if (!item) return;
    await navigator.clipboard.writeText(item.localPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (status === 'loading') return <p>Carregando item...</p>;
  if (status === 'error' || !item) return <p role="alert">Não foi possível carregar o item.</p>;

  return (
    <article>
      <h2>{item.name}</h2>
      <p>{item.summary}</p>
      <p>{item.utility}</p>
      <p>
        <code>{item.localPath}</code>{' '}
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </button>
      </p>
      <ul>
        {item.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Add the detail route — update `apps/web/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 6: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/ItemDetailPage.tsx apps/web/src/pages/ItemDetailPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: add item detail page with rendered content and copy-path button"
```

---

## Task 8: Inline category/tag editing on the detail page

**Files:**
- Modify: `apps/web/src/pages/ItemDetailPage.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/src/pages/ItemDetailPage.test.tsx` (also update every `vi.spyOn(api, 'getItem')` call's resolved mock to keep working — no change needed there since `listCategories` is a separate spy; just add the import `vi.spyOn(api, 'listCategories')` usage inside the new test, and add `Category` handling isn't needed in existing tests since `listCategories` will be called by the component regardless — the existing tests don't mock it, so add a `beforeEach` that stubs it as an empty array by default so prior tests don't fail on wiring):

At the top of the file, add a `beforeEach` alongside the existing `afterEach`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
```

(update the existing `import { describe, it, expect, vi, afterEach } from 'vitest';` line to include `beforeEach`), and add right after the `afterEach` block:

```tsx
beforeEach(() => {
  vi.spyOn(api, 'listCategories').mockResolvedValue([]);
});
```

(Individual tests that need specific categories will override this with their own `vi.spyOn(api, 'listCategories').mockResolvedValue([...])` call, which takes precedence since it's set up later in that test.)

Then add the new test:

```tsx
it('edits category and tags and saves them', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail({ tags: ['a', 'b'] }));
  vi.spyOn(api, 'listCategories').mockResolvedValue([{ id: 5, name: 'dev-tools', createdAt: '' }]);
  const updateItemSpy = vi.spyOn(api, 'updateItem').mockResolvedValue({
    ...sampleDetail({ categoryId: 5, tags: ['novo'] }),
  });

  renderWithRoute('1');

  const categorySelect = await screen.findByLabelText('Categoria');
  await user.selectOptions(categorySelect, '5');

  const tagsInput = screen.getByLabelText('Tags (separadas por vírgula)');
  await user.clear(tagsInput);
  await user.type(tagsInput, 'novo');

  await user.click(screen.getByRole('button', { name: 'Salvar' }));

  await waitFor(() => {
    expect(updateItemSpy).toHaveBeenCalledWith(1, { categoryId: 5, tags: ['novo'] });
  });
  expect(await screen.findByText('Salvo!')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — there is no "Categoria" label / no `listCategories` call yet.

- [ ] **Step 3: Implement the editing UI — replace `apps/web/src/pages/ItemDetailPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem, listCategories, updateItem } from '../api/client.js';
import type { Category, ItemDetail } from '../types.js';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    Promise.all([getItem(Number(id)), listCategories()])
      .then(([itemResult, categoriesResult]) => {
        if (cancelled) return;
        setItem(itemResult);
        setCategories(categoriesResult);
        setCategoryId(itemResult.categoryId !== null ? String(itemResult.categoryId) : '');
        setTagsInput(itemResult.tags.join(', '));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy() {
    if (!item) return;
    await navigator.clipboard.writeText(item.localPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!item) return;
    setSaveStatus('saving');
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await updateItem(item.id, {
        categoryId: categoryId ? Number(categoryId) : null,
        tags,
      });
      setItem({ ...item, ...updated });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  if (status === 'loading') return <p>Carregando item...</p>;
  if (status === 'error' || !item) return <p role="alert">Não foi possível carregar o item.</p>;

  return (
    <article>
      <h2>{item.name}</h2>
      <p>{item.summary}</p>
      <p>{item.utility}</p>
      <p>
        <code>{item.localPath}</code>{' '}
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </button>
      </p>

      <div>
        <label htmlFor="item-category">Categoria</label>
        <select id="item-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="item-tags">Tags (separadas por vírgula)</label>
        <input id="item-tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />

        <button type="button" onClick={handleSave} disabled={saveStatus === 'saving'}>
          Salvar
        </button>
        {saveStatus === 'saved' && <span>Salvo!</span>}
        {saveStatus === 'error' && <span role="alert">Erro ao salvar.</span>}
      </div>

      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
```

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ItemDetailPage.tsx apps/web/src/pages/ItemDetailPage.test.tsx
git commit -m "feat: add inline category/tag editing to the item detail page"
```

---

## Task 9: Add page — type selector + Repo & MCP forms

**Files:**
- Create: `apps/web/src/pages/forms/RepoForm.tsx`
- Test: `apps/web/src/pages/forms/RepoForm.test.tsx`
- Create: `apps/web/src/pages/forms/McpForm.tsx`
- Test: `apps/web/src/pages/forms/McpForm.test.tsx`
- Create: `apps/web/src/pages/AddPage.tsx`
- Test: `apps/web/src/pages/AddPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing test for `RepoForm`**

`apps/web/src/pages/forms/RepoForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoForm } from './RepoForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RepoForm', () => {
  it('submits name and url and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 42, type: 'repo', name: 'Meu Repo' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<RepoForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Repo');
    await user.type(screen.getByLabelText('URL do repositório'), 'https://example.com/x.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar repositório' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'repo',
        name: 'Meu Repo',
        url: 'https://example.com/x.git',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createItem').mockRejectedValue(new Error('url is required for type=repo'));

    render(<RepoForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Repo');
    await user.type(screen.getByLabelText('URL do repositório'), 'x');
    await user.click(screen.getByRole('button', { name: 'Adicionar repositório' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('url is required for type=repo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `RepoForm.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/pages/forms/RepoForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

interface RepoFormProps {
  onCreated: (item: Item) => void;
}

export function RepoForm({ onCreated }: RepoFormProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    try {
      const item = await createItem({ type: 'repo', name, url });
      setName('');
      setUrl('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="repo-name">Nome</label>
      <input id="repo-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="repo-url">URL do repositório</label>
      <input id="repo-url" value={url} onChange={(e) => setUrl(e.target.value)} required />

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar repositório
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Write the failing test for `McpForm`**

`apps/web/src/pages/forms/McpForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpForm } from './McpForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('McpForm', () => {
  it('parses the config JSON, submits it, and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 7, type: 'mcp', name: 'Meu MCP' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<McpForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu MCP');
    await user.type(screen.getByLabelText('Config JSON (ex: bloco mcpServers)'), '{"mcpServers":{}}');
    await user.click(screen.getByRole('button', { name: 'Adicionar MCP' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'mcp',
        name: 'Meu MCP',
        config: { mcpServers: {} },
        description: undefined,
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error when the config is not valid JSON', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<McpForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu MCP');
    await user.type(screen.getByLabelText('Config JSON (ex: bloco mcpServers)'), '{invalido');
    await user.click(screen.getByRole('button', { name: 'Adicionar MCP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O config precisa ser um JSON válido.');
    expect(createItemSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `McpForm.tsx` does not exist.

- [ ] **Step 7: Implement `apps/web/src/pages/forms/McpForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

interface McpFormProps {
  onCreated: (item: Item) => void;
}

export function McpForm({ onCreated }: McpFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [configText, setConfigText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText);
    } catch {
      setError('O config precisa ser um JSON válido.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const item = await createItem({ type: 'mcp', name, config: parsedConfig, description: description || undefined });
      setName('');
      setDescription('');
      setConfigText('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="mcp-name">Nome</label>
      <input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="mcp-description">Descrição (opcional)</label>
      <input id="mcp-description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <label htmlFor="mcp-config">Config JSON (ex: bloco mcpServers)</label>
      <textarea id="mcp-config" value={configText} onChange={(e) => setConfigText(e.target.value)} required />

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar MCP
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 9: Write the failing test for `AddPage`**

`apps/web/src/pages/AddPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AddPage } from './AddPage.js';

describe('AddPage', () => {
  it('switches between repo and mcp forms based on the selected type', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('URL do repositório')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo'), 'mcp');
    expect(screen.getByLabelText('Config JSON (ex: bloco mcpServers)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `AddPage.tsx` does not exist.

- [ ] **Step 11: Implement `apps/web/src/pages/AddPage.tsx`**

Note: this version intentionally only offers `repo`/`mcp` — the `skill` option and its form are added in Task 10, right after this one, to keep every task's build green independently.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'mcp';

export function AddPage() {
  const [type, setType] = useState<ItemTypeChoice>('repo');
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div>
      <h2>Adicionar item</h2>
      <label htmlFor="item-type">Tipo</label>
      <select id="item-type" value={type} onChange={(e) => setType(e.target.value as ItemTypeChoice)}>
        <option value="repo">Repositório</option>
        <option value="mcp">MCP</option>
      </select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} />}
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 13: Add the `/add` route — update `apps/web/src/App.tsx`**

```tsx
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

- [ ] **Step 14: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/pages/forms/RepoForm.tsx apps/web/src/pages/forms/RepoForm.test.tsx apps/web/src/pages/forms/McpForm.tsx apps/web/src/pages/forms/McpForm.test.tsx apps/web/src/pages/AddPage.tsx apps/web/src/pages/AddPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: add the add-item page with repo and mcp forms"
```

---

## Task 10: Add page — Skill form (3 source tabs)

**Files:**
- Create: `apps/web/src/pages/forms/SkillForm.tsx`
- Test: `apps/web/src/pages/forms/SkillForm.test.tsx`
- Modify: `apps/web/src/pages/AddPage.tsx`
- Modify: `apps/web/src/pages/AddPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/forms/SkillForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillForm } from './SkillForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SkillForm', () => {
  it('submits a local_path skill by default and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 9, type: 'skill', name: 'Minha Skill' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<SkillForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Minha Skill');
    await user.type(screen.getByLabelText('Caminho local da pasta'), 'C:\\skills\\minha-skill');
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Minha Skill',
        source_type: 'local_path',
        path: 'C:\\skills\\minha-skill',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('submits a url skill after switching tabs', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue({} as never);

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill via URL');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    await user.type(screen.getByLabelText('URL do repositório da skill'), 'https://example.com/skill.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Skill via URL',
        source_type: 'url',
        url: 'https://example.com/skill.git',
      });
    });
  });

  it('submits an uploaded file skill after switching tabs', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue({} as never);
    const file = new File(['# Skill'], 'SKILL.md', { type: 'text/markdown' });

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill Upload');
    await user.click(screen.getByRole('tab', { name: 'Upload' }));
    await user.upload(screen.getByLabelText('Arquivo (SKILL.md ou .zip)'), file);
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Skill Upload',
        source_type: 'upload',
        file,
      });
    });
  });

  it('shows an error when submitting the upload tab without a file', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill Upload');
    await user.click(screen.getByRole('tab', { name: 'Upload' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione um arquivo para enviar.');
    expect(createItemSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `SkillForm.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/pages/forms/SkillForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

interface SkillFormProps {
  onCreated: (item: Item) => void;
}

type SourceTab = 'local_path' | 'upload' | 'url';

export function SkillForm({ onCreated }: SkillFormProps) {
  const [name, setName] = useState('');
  const [tab, setTab] = useState<SourceTab>('local_path');
  const [localPath, setLocalPath] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (tab === 'upload' && !file) {
      setError('Selecione um arquivo para enviar.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      let item: Item;
      if (tab === 'local_path') {
        item = await createItem({ type: 'skill', name, source_type: 'local_path', path: localPath });
      } else if (tab === 'url') {
        item = await createItem({ type: 'skill', name, source_type: 'url', url });
      } else {
        item = await createItem({ type: 'skill', name, source_type: 'upload', file: file! });
      }
      setName('');
      setLocalPath('');
      setUrl('');
      setFile(null);
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="skill-name">Nome</label>
      <input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <div role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'local_path'} onClick={() => setTab('local_path')}>
          Caminho local
        </button>
        <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}>
          Upload
        </button>
        <button type="button" role="tab" aria-selected={tab === 'url'} onClick={() => setTab('url')}>
          URL
        </button>
      </div>

      {tab === 'local_path' && (
        <div>
          <label htmlFor="skill-path">Caminho local da pasta</label>
          <input id="skill-path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} />
        </div>
      )}

      {tab === 'upload' && (
        <div>
          <label htmlFor="skill-file">Arquivo (SKILL.md ou .zip)</label>
          <input id="skill-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      )}

      {tab === 'url' && (
        <div>
          <label htmlFor="skill-url">URL do repositório da skill</label>
          <input id="skill-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar skill
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Write the failing test for the `skill` option in `AddPage`**

Add this test to `apps/web/src/pages/AddPage.test.tsx`:

```tsx
it('shows the skill form when skill is selected', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AddPage />
    </MemoryRouter>
  );

  await user.selectOptions(screen.getByLabelText('Tipo'), 'skill');
  expect(screen.getByLabelText('Caminho local da pasta')).toBeInTheDocument();
});
```

Add `import userEvent from '@testing-library/user-event';` to the top of the file if it isn't already there from Task 9.

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — the `skill` `<option>` doesn't exist in the select yet.

- [ ] **Step 7: Add the skill option — update `apps/web/src/pages/AddPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp';

export function AddPage() {
  const [type, setType] = useState<ItemTypeChoice>('repo');
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div>
      <h2>Adicionar item</h2>
      <label htmlFor="item-type">Tipo</label>
      <select id="item-type" value={type} onChange={(e) => setType(e.target.value as ItemTypeChoice)}>
        <option value="repo">Repositório</option>
        <option value="skill">Skill</option>
        <option value="mcp">MCP</option>
      </select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} />}
    </div>
  );
}
```

- [ ] **Step 8: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/forms/SkillForm.tsx apps/web/src/pages/forms/SkillForm.test.tsx apps/web/src/pages/AddPage.tsx apps/web/src/pages/AddPage.test.tsx
git commit -m "feat: add skill form with local path, upload, and url source tabs"
```

---

## Task 11: Categories management UI (rename/merge)

**Files:**
- Create: `apps/web/src/components/CategoryManager.tsx`
- Test: `apps/web/src/components/CategoryManager.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`
- Modify: `README.md` (root)

- [ ] **Step 1: Write the failing test for `CategoryManager`**

`apps/web/src/components/CategoryManager.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManager } from './CategoryManager.js';
import * as api from '../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const categories = [
  { id: 1, name: 'dev-tools', createdAt: '' },
  { id: 2, name: 'automacao', createdAt: '' },
];

describe('CategoryManager', () => {
  it('renames a category', async () => {
    const user = userEvent.setup();
    const renameSpy = vi
      .spyOn(api, 'renameCategory')
      .mockResolvedValue({ id: 1, name: 'ferramentas', createdAt: '' });
    const onChanged = vi.fn();

    render(<CategoryManager categories={categories} onChanged={onChanged} />);

    await user.click(screen.getAllByRole('button', { name: 'Renomear' })[0]);
    const input = screen.getByLabelText('Novo nome');
    await user.clear(input);
    await user.type(input, 'ferramentas');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith(1, 'ferramentas');
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('merges two categories', async () => {
    const user = userEvent.setup();
    const mergeSpy = vi.spyOn(api, 'mergeCategory').mockResolvedValue(undefined);
    const onChanged = vi.fn();

    render(<CategoryManager categories={categories} onChanged={onChanged} />);

    await user.selectOptions(screen.getByLabelText('Mesclar categoria'), '1');
    await user.selectOptions(screen.getByLabelText('Em'), '2');
    await user.click(screen.getByRole('button', { name: 'Mesclar' }));

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalledWith(1, 2);
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows an error message when the merge fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'mergeCategory').mockRejectedValue(new Error('category not found'));

    render(<CategoryManager categories={categories} onChanged={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Mesclar categoria'), '1');
    await user.selectOptions(screen.getByLabelText('Em'), '2');
    await user.click(screen.getByRole('button', { name: 'Mesclar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('category not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — `CategoryManager.tsx` does not exist.

- [ ] **Step 3: Implement `apps/web/src/components/CategoryManager.tsx`**

```tsx
import { useState } from 'react';
import { mergeCategory, renameCategory } from '../api/client.js';
import type { Category } from '../types.js';

interface CategoryManagerProps {
  categories: Category[];
  onChanged: () => void;
}

export function CategoryManager({ categories, onChanged }: CategoryManagerProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [error, setError] = useState('');

  function startRename(category: Category) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function submitRename(id: number) {
    setError('');
    try {
      await renameCategory(id, renameValue);
      setRenamingId(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitMerge() {
    setError('');
    if (!mergeSourceId || !mergeTargetId) return;
    try {
      await mergeCategory(Number(mergeSourceId), Number(mergeTargetId));
      setMergeSourceId('');
      setMergeTargetId('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <h3>Categorias</h3>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            {renamingId === category.id ? (
              <>
                <label htmlFor={`rename-${category.id}`}>Novo nome</label>
                <input
                  id={`rename-${category.id}`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                />
                <button type="button" onClick={() => submitRename(category.id)}>
                  Salvar
                </button>
              </>
            ) : (
              <>
                {category.name}{' '}
                <button type="button" onClick={() => startRename(category)}>
                  Renomear
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div>
        <label htmlFor="merge-source">Mesclar categoria</label>
        <select id="merge-source" value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)}>
          <option value="">Selecione a origem</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="merge-target">Em</label>
        <select id="merge-target" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
          <option value="">Selecione o destino</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <button type="button" onClick={submitMerge}>
          Mesclar
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 5: Write the failing test for wiring `CategoryManager` into `CatalogPage`**

Add this test to `apps/web/src/pages/CatalogPage.test.tsx` (needs `waitFor` and `userEvent`, already added in Task 6 — reuse those imports):

```tsx
it('refetches after a category change is reported by CategoryManager', async () => {
  const user = userEvent.setup();
  const listItemsSpy = vi.spyOn(api, 'listItems').mockResolvedValue([]);
  const listCategoriesSpy = vi
    .spyOn(api, 'listCategories')
    .mockResolvedValue([{ id: 1, name: 'dev-tools', createdAt: '' }]);
  vi.spyOn(api, 'renameCategory').mockResolvedValue({ id: 1, name: 'ferramentas', createdAt: '' });

  render(
    <MemoryRouter>
      <CatalogPage />
    </MemoryRouter>
  );

  await screen.findByText('dev-tools');
  listCategoriesSpy.mockClear();
  listItemsSpy.mockClear();

  await user.click(screen.getByRole('button', { name: 'Renomear' }));
  await user.click(screen.getByRole('button', { name: 'Salvar' }));

  await waitFor(() => {
    expect(listCategoriesSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w apps/web`
Expected: FAIL — there's no "Renomear" button rendered by `CatalogPage` yet.

- [ ] **Step 7: Wire `CategoryManager` into `apps/web/src/pages/CatalogPage.tsx`**

Replace the entire file with:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems, listCategories } from '../api/client.js';
import { SearchFilterBar, type Filters } from '../components/SearchFilterBar.js';
import { CategoryManager } from '../components/CategoryManager.js';
import type { Category, Item, ItemFilters } from '../types.js';

interface GroupedItems {
  category: string;
  items: Item[];
}

function groupByCategory(items: Item[], categories: Category[]): GroupedItems[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const name = item.categoryId !== null ? nameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

function toApiFilters(filters: Filters): ItemFilters {
  const apiFilters: ItemFilters = {};
  if (filters.q) apiFilters.q = filters.q;
  if (filters.type) apiFilters.type = filters.type;
  if (filters.category) apiFilters.category = Number(filters.category);
  if (filters.tag) apiFilters.tag = filters.tag;
  return apiFilters;
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });
  const [refreshToken, setRefreshToken] = useState(0);

  const refetchCategories = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      Promise.all([listItems(toApiFilters(filters)), listCategories()])
        .then(([itemsResult, categoriesResult]) => {
          if (cancelled) return;
          setItems(itemsResult);
          setCategories(categoriesResult);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [filters, refreshToken]);

  const groups = groupByCategory(items, categories);

  return (
    <div>
      <SearchFilterBar categories={categories} onChange={setFilters} />
      {status === 'loading' && <p>Carregando catálogo...</p>}
      {status === 'error' && <p role="alert">Não foi possível carregar o catálogo.</p>}
      {status === 'ready' && items.length === 0 && <p>Nenhum item cadastrado ainda.</p>}
      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.category}>
            <h2>{group.category}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link to={`/items/${item.id}`}>{item.name}</Link> <span>({item.type})</span>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {status === 'ready' && <CategoryManager categories={categories} onChanged={refetchCategories} />}
    </div>
  );
}
```

- [ ] **Step 8: Run full test suite to verify everything passes**

Run: `npm run test -w apps/web`
Expected: PASS

- [ ] **Step 9: Update the root `README.md` status section**

Find the `## Status` section at the end of `README.md` and replace it with:

```md
## Status

Backend de ingestão completo (skills, repos, MCPs) com enriquecimento via LLM (Ollama → Gemini free tier → manual) e catálogo via API REST. Frontend web completo: catálogo com busca/filtros, detalhe de item com conteúdo renderizado e edição inline de categoria/tags, fluxo de adicionar (repo/skill/mcp) e gestão de categorias (renomear/mesclar). Recomendador e PWA são fases seguintes — ver `docs/superpowers/specs/`.
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/CategoryManager.tsx apps/web/src/components/CategoryManager.test.tsx apps/web/src/pages/CatalogPage.tsx apps/web/src/pages/CatalogPage.test.tsx README.md
git commit -m "feat: add category rename/merge UI to the catalog page"
```

---

## Manual verification (after Task 11)

1. From the repo root, run `npm run dev` — both the backend (port 3001) and frontend (Vite dev server, typically port 5173) should start; confirm both "listening"/"ready" log lines appear.
2. Open the frontend URL in a browser. Confirm the catalog page loads (empty state if no items exist yet, or the manually-created `manual-test-mcp` item from the backend plan's smoke test if `~/skillvault` still has it).
3. Click "Adicionar", add a repo using any small public git URL, confirm it redirects back to the catalog and the new item appears, grouped under a category (or "Sem categoria" if no LLM enrichment is available).
4. Click into the item's detail page, confirm the rendered content, edit its category/tags, save, and confirm the change persists after a page refresh.
5. Use the category manager to rename or merge a category, confirm the catalog re-groups accordingly.
6. Toggle dark/light mode, confirm it persists across a page refresh.
7. Resize the browser window below ~720px width, confirm the sidebar collapses to a stacked layout (desktop-first: the wide layout is the default, not something added on top of a mobile base).
8. Stop both dev servers when done.
