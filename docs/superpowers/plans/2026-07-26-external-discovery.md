# Busca externa de skills, MCPs e plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma nova aba "Descobrir" no SkillVault busca skills, MCPs e plugins bem avaliados no GitHub, no registro oficial de MCP e na Smithery, e permite sugerir a inclusão de um resultado no vault (pré-preenchendo o formulário de Adicionar). Isso exige um novo tipo de item `plugin` no vault, já que hoje só existem `skill`/`repo`/`mcp`.

**Architecture:** Backend ganha um diretório `discover/` com um módulo por fonte (`github.ts`, `mcpRegistry.ts`, `smithery.ts`) mais um `aggregate.ts` que dispara as fontes aplicáveis em paralelo, exposto via `GET /api/discover`. Frontend ganha uma `DiscoverPage` + `DiscoverResultCard`, e o fluxo de "Adicionar ao vault" navega para `/add` com os dados pré-preenchidos via query params. O novo tipo `plugin` reaproveita o pipeline de ingestão de `repo` (clone git), exigindo uma migração leve do `CHECK` constraint da coluna `type` no SQLite.

**Tech Stack:** Fastify + better-sqlite3 (backend), React + TypeScript + Vite (frontend), sem dependências novas (usa `fetch` nativo para GitHub/registro MCP/Smithery).

---

## Grupo A — Novo tipo de item `plugin`

### Task 1: Migração do banco + `ItemType` ganha `plugin`

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/db/connection.ts`
- Test: `apps/server/src/db/connection.test.ts`
- Modify: `apps/server/src/types.ts`
- Modify: `apps/web/src/types.ts`

A coluna `type` da tabela `items` tem hoje um `CHECK (type IN ('skill','repo','mcp'))` — inserir um item `plugin` falharia com uma violação de constraint. SQLite não suporta alterar um `CHECK` existente via `ALTER TABLE`, então a migração recria a tabela preservando os dados (mesmo padrão de evolução de schema já usado neste arquivo para a coluna `download_status`, só que aqui via recriação de tabela em vez de `ADD COLUMN`, porque é o `CHECK` que muda, não uma coluna nova).

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('createDb', ...)` em `apps/server/src/db/connection.test.ts`:

```ts
  it('migrates a pre-existing items table whose type CHECK does not allow plugin yet', () => {
    const dbPath = path.join(os.tmpdir(), `skillvault-migration-plugin-${Date.now()}.db`);
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
        name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
        source_value TEXT NOT NULL,
        local_path TEXT NOT NULL,
        category_id INTEGER,
        summary TEXT,
        utility TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
        global_install_status TEXT CHECK (global_install_status IN ('success','failed')),
        download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
         VALUES ('repo', 'Old Repo', 'url', 'https://example.com/old.git', '/vault/old-repo', '[]', '2026-01-01', '2026-01-01')`
      )
      .run();
    legacy.close();

    const migrated = createDb(dbPath);

    expect(() =>
      migrated
        .prepare(
          `INSERT INTO items (type, name, source_type, source_value, local_path, tags, created_at, updated_at)
           VALUES ('plugin', 'New Plugin', 'url', 'https://example.com/plugin.git', '/vault/new-plugin', '[]', '2026-01-01', '2026-01-01')`
        )
        .run()
    ).not.toThrow();

    const rows = migrated.prepare('SELECT type, name FROM items ORDER BY id').all();
    expect(rows).toEqual([
      { type: 'repo', name: 'Old Repo' },
      { type: 'plugin', name: 'New Plugin' },
    ]);

    migrated.close();
    fs.rmSync(dbPath, { force: true });
  });
```

E adicione o import do construtor `Database` no topo do arquivo (ele hoje só importa `createDb`):

```ts
import Database from 'better-sqlite3';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/db/connection.test.ts`
Expected: FAIL — o `INSERT` de `type='plugin'` lança `SqliteError: CHECK constraint failed: type`.

- [ ] **Step 3: Implement the migration**

Em `apps/server/src/db/schema.ts`, altere a linha do `CHECK` de `type`:

```ts
  type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp','plugin')),
```

Em `apps/server/src/db/connection.ts`, adicione a função de migração e chame-a em `createDb`:

```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((col) => col.name === column);
}

function itemsTypeCheckAllowsPlugin(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
    .get() as { sql: string } | undefined;
  return !!row && row.sql.includes("'plugin'");
}

function migrateItemsTypeCheck(db: Database.Database): void {
  if (itemsTypeCheckAllowsPlugin(db)) return;

  db.exec(`
    ALTER TABLE items RENAME TO items_old_type_check;
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp','plugin')),
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
    INSERT INTO items (
      id, type, name, source_type, source_value, local_path, category_id,
      summary, utility, tags, enrichment_source, global_install_status, download_status,
      created_at, updated_at
    )
    SELECT
      id, type, name, source_type, source_value, local_path, category_id,
      summary, utility, tags, enrichment_source, global_install_status, download_status,
      created_at, updated_at
    FROM items_old_type_check;
    DROP TABLE items_old_type_check;
  `);
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

  migrateItemsTypeCheck(db);

  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/db/connection.test.ts`
Expected: PASS (all tests, incluindo o novo).

- [ ] **Step 5: Widen `ItemType` in both `types.ts` files**

Em `apps/server/src/types.ts`, linha 1:

```ts
export type ItemType = 'skill' | 'repo' | 'mcp' | 'plugin';
```

Em `apps/web/src/types.ts`, linha 1, o mesmo:

```ts
export type ItemType = 'skill' | 'repo' | 'mcp' | 'plugin';
```

- [ ] **Step 6: Run full suites and typecheck**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS em ambos, zero erros (a mudança de `ItemType` sozinha não quebra nada ainda, já que nenhum código força um `switch` exaustivo sobre os 3 valores antigos).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/connection.ts apps/server/src/db/connection.test.ts apps/server/src/types.ts apps/web/src/types.ts
git commit -m "feat: add plugin item type and migrate the items table's type CHECK"
```

---

### Task 2: `ingestRepo` aceita `type: 'repo' | 'plugin'`

**Files:**
- Modify: `apps/server/src/ingestion/repo.ts`
- Modify: `apps/server/src/ingestion/repo.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('ingestRepo', ...)` em `apps/server/src/ingestion/repo.test.ts`:

```ts
  it('accepts type=plugin and creates the item with that type, passing it through to enrichment', async () => {
    const fixtureRepo = createFixtureRepo();
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    fs.mkdirSync(config.reposDir, { recursive: true });

    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    let capturedItemType = '';
    const spyEnrich = async (_config: unknown, itemType: string): Promise<EnrichmentResult> => {
      capturedItemType = itemType;
      return stubEnrich();
    };

    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { type: 'plugin', name: 'Fixture Plugin', source: { kind: 'url', url: fixtureRepo } },
      spyEnrich
    );

    expect(item.type).toBe('plugin');
    expect(capturedItemType).toBe('plugin');
  });
```

E ajuste as 4 chamadas existentes de `ingestRepo(...)` nesse mesmo arquivo (as dos testes `local_path: references...`, `local_path: falls back...`, `url: probes...`, `rejects a url...`) adicionando `type: 'repo'` ao objeto de input. Exemplo (repita a mesma adição de campo nas outras três chamadas):

```ts
    const item = await ingestRepo(
      config,
      itemsRepo,
      categoriesRepo,
      { type: 'repo', name: 'Fixture Repo', source: { kind: 'local_path', path: fixtureRepo } },
      stubEnrich
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/ingestion/repo.test.ts`
Expected: FAIL — erro de tipo do TypeScript (`type` é obrigatório em `IngestRepoInput` mas ainda não existe) ou, se o teste rodar sem checagem estrita, o item criado terá `type: 'repo'` fixo em vez de `'plugin'`.

- [ ] **Step 3: Implement**

Em `apps/server/src/ingestion/repo.ts`:

```ts
export interface IngestRepoInput {
  type: 'repo' | 'plugin';
  name: string;
  source: RepoSource;
}
```

E dentro de `ingestRepo`, troque as duas ocorrências do literal `'repo'` por `input.type`:

```ts
  const enrichment = await enrich(config, input.type, readme || sourceValue);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: input.type,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/ingestion/repo.test.ts`
Expected: PASS (todos os testes, incluindo o novo).

- [ ] **Step 5: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS — nenhum outro chamador de `ingestRepo` existe ainda além da rota que será ajustada na Task 3, então isso não deve quebrar nada além do próprio `repo.test.ts` (já corrigido acima).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ingestion/repo.ts apps/server/src/ingestion/repo.test.ts
git commit -m "feat: let ingestRepo create plugin items, not just repos"
```

---

### Task 3: `routes/items.ts` — criar, baixar e bloquear instalação global de `plugin`

**Files:**
- Modify: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/routes/items.test.ts`

Três mudanças na mesma rota: (1) `POST /api/items` ganha um branch `type === 'plugin'`, praticamente igual ao de `repo` mas só com `url` (sem `local_path`, já que o `PluginForm` do frontend só vai enviar URL); (2) `POST /:id/download` passa a aceitar `plugin` além de `repo`; (3) `POST /:id/install` passa a rejeitar `plugin` explicitamente com 409 (hoje ele cairia incorretamente no branch de `installMcpGlobally`, porque só `repo` é excluído).

- [ ] **Step 1: Write the failing tests**

Adicione ao final do `describe('POST /api/items (type=repo)', ...)` — na verdade, crie um novo `describe` logo depois dele, antes de `describe('POST /api/items (type=skill, source_type=local_path)', ...)`:

```ts
describe('POST /api/items (type=plugin)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-plugin-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('ingests a plugin by url as not_downloaded, same as a repo', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'plugin', name: 'Fixture Plugin', url: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe('plugin');
    expect(body.downloadStatus).toBe('not_downloaded');
    expect(body.installedGlobally).toBeNull();
  });

  it('rejects a plugin without a url', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'plugin', name: 'Sem URL' },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

Adicione ao final do `describe('POST /api/items/:id/download', ...)`:

```ts
  it('clones a not_downloaded plugin item and flips it to downloaded', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'plugin', name: 'Plugin Para Baixar', url: fixtureRepo },
    });
    const created = createResponse.json();

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${created.id}/download`,
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.json().downloadStatus).toBe('downloaded');
  });
```

Adicione ao final do `describe('POST /api/items/:id/install', ...)`, logo depois do teste `'returns 409 for repo items (use /download instead)'`:

```ts
  it('returns 409 for plugin items (global install is not supported for plugins yet)', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'plugin', name: 'Plugin Nao Instala', url: fixtureRepo },
    });
    const created = create.json();

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(409);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: FAIL — `unsupported type: plugin` (400 em vez de 201) na criação; download rejeitado com 409 (`item is not pending download` — na verdade a checagem de tipo bloqueia antes mesmo do download_status); install cai no branch errado (`installMcpGlobally`) em vez de retornar 409 direto.

- [ ] **Step 3: Implement**

Em `apps/server/src/routes/items.ts`, adicione um novo branch logo depois do branch `if (type === 'repo') { ... }` (antes do `if (type === 'skill')`):

```ts
        if (type === 'plugin') {
          const url = fieldValue(body.url);
          if (!url) return reply.status(400).send({ error: 'url is required for type=plugin' });

          const item = await ingestRepo(config, itemsRepo, categoriesRepo, {
            type: 'plugin',
            name,
            source: { kind: 'url', url },
          });
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(withGlobalStatus(item));
        }
```

E troque `ingestRepo(config, itemsRepo, categoriesRepo, { name, source })` no branch `type === 'repo'` existente para incluir `type: 'repo'`:

```ts
          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { type: 'repo', name, source });
```

Na rota `/api/items/:id/download`, troque a condição de guarda:

```ts
      if (!(item.type === 'repo' || item.type === 'plugin') || item.downloadStatus !== 'not_downloaded') {
        return reply.status(409).send({ error: 'item is not pending download' });
      }
```

Na rota `/api/items/:id/install`, troque a condição de guarda inicial:

```ts
      if (item.type === 'repo' || item.type === 'plugin') {
        return reply.status(409).send({ error: 'use /download for repo/plugin items' });
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: PASS (todos os testes, incluindo os 3 novos e os já existentes que testam `repo`).

- [ ] **Step 5: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/items.ts apps/server/src/routes/items.test.ts
git commit -m "feat: support creating, downloading, and gating global install for plugin items"
```

---

### Task 4: Frontend — `CreatePluginInput` no `api/client.ts`

**Files:**
- Modify: `apps/web/src/api/client.ts`

Sem teste dedicado (é só uma extensão de tipo/união usada pelos testes de `PluginForm` na Task 6) — validado por `tsc --noEmit` e pelos testes das tasks seguintes que efetivamente chamam `createItem` com `type: 'plugin'`.

- [ ] **Step 1: Add `CreatePluginInput` and widen `CreateItemInput`**

Em `apps/web/src/api/client.ts`, logo depois de `CreateRepoInput`:

```ts
export interface CreateRepoInput {
  type: 'repo';
  name: string;
  url: string;
}

export interface CreatePluginInput {
  type: 'plugin';
  name: string;
  url: string;
}
```

E troque a união:

```ts
export type CreateItemInput = CreateRepoInput | CreateMcpInput | CreateSkillInput | CreatePluginInput;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/client.ts
git commit -m "feat: add CreatePluginInput to the API client's create-item union"
```

---

### Task 5: `RepoForm.tsx` ganha `initialName`/`initialUrl` opcionais

**Files:**
- Modify: `apps/web/src/pages/forms/RepoForm.tsx`
- Modify: `apps/web/src/pages/forms/RepoForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('RepoForm', ...)` em `apps/web/src/pages/forms/RepoForm.test.tsx`:

```ts
  it('pre-fills name and url from initialName/initialUrl props', () => {
    render(<RepoForm onCreated={vi.fn()} initialName="Repo Pronto" initialUrl="https://example.com/pronto.git" />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Repo Pronto');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/pronto.git');
  });
```

Ajuste também os dois testes existentes: eles renderizam `<RepoForm onCreated={onCreated} />`/`<RepoForm onCreated={vi.fn()} />` sem os novos props — devem continuar exatamente iguais (props opcionais, sem quebra).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/forms/RepoForm.test.tsx`
Expected: FAIL — os campos continuam vazios (`toHaveValue('')`), já que os props ainda não existem.

- [ ] **Step 3: Implement**

Em `apps/web/src/pages/forms/RepoForm.tsx`:

```tsx
interface RepoFormProps {
  onCreated: (item: Item) => void;
  initialName?: string;
  initialUrl?: string;
}

export function RepoForm({ onCreated, initialName = '', initialUrl = '' }: RepoFormProps) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
```

(o restante do componente não muda).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/forms/RepoForm.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/forms/RepoForm.tsx apps/web/src/pages/forms/RepoForm.test.tsx
git commit -m "feat: let RepoForm accept initial name/url values"
```

---

### Task 6: Novo componente `PluginForm.tsx`

**Files:**
- Create: `apps/web/src/pages/forms/PluginForm.tsx`
- Test: `apps/web/src/pages/forms/PluginForm.test.tsx`

Estruturalmente idêntico ao `RepoForm.tsx` (nome + URL), postando `type: 'plugin'`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/forms/PluginForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginForm } from './PluginForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginForm', () => {
  it('submits name and url and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 42, type: 'plugin', name: 'Meu Plugin' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<PluginForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Plugin');
    await user.type(screen.getByLabelText('URL do repositório'), 'https://example.com/plugin.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar plugin' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'plugin',
        name: 'Meu Plugin',
        url: 'https://example.com/plugin.git',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createItem').mockRejectedValue(new Error('url is required for type=plugin'));

    render(<PluginForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Plugin');
    await user.type(screen.getByLabelText('URL do repositório'), 'x');
    await user.click(screen.getByRole('button', { name: 'Adicionar plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('url is required for type=plugin');
  });

  it('pre-fills name and url from initialName/initialUrl props', () => {
    render(<PluginForm onCreated={vi.fn()} initialName="Plugin Pronto" initialUrl="https://example.com/pronto.git" />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Plugin Pronto');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/pronto.git');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/forms/PluginForm.test.tsx`
Expected: FAIL — módulo `./PluginForm.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/web/src/pages/forms/PluginForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface PluginFormProps {
  onCreated: (item: Item) => void;
  initialName?: string;
  initialUrl?: string;
}

export function PluginForm({ onCreated, initialName = '', initialUrl = '' }: PluginFormProps) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    try {
      const item = await createItem({ type: 'plugin', name, url });
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
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="plugin-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="plugin-url"
        label="URL do repositório"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar plugin
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/forms/PluginForm.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/forms/PluginForm.tsx apps/web/src/pages/forms/PluginForm.test.tsx
git commit -m "feat: add PluginForm component"
```

---

### Task 7: `AddPage.tsx` — opção plugin + pré-preenchimento via query params

**Files:**
- Modify: `apps/web/src/pages/AddPage.tsx`
- Modify: `apps/web/src/pages/AddPage.test.tsx`
- Modify: `apps/web/src/pages/forms/McpForm.tsx`

`AddPage` passa a ler `type`/`name`/`url` da URL (`useSearchParams`) para pré-selecionar o tipo e pré-preencher os formulários — é assim que o botão "Adicionar ao vault" da busca externa (Grupo C) vai entregar os dados. `McpForm` ganha um `initialName` opcional (sem `initialUrl`/config pré-preenchido — não há como inferir um config JSON executável a partir dos dados de busca).

- [ ] **Step 1: Write the failing tests**

Adicione ao final do `describe('AddPage', ...)` em `apps/web/src/pages/AddPage.test.tsx`:

```tsx
  it('pre-selects the type and pre-fills the repo form from query params', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=repo&name=Achado&url=https%3A%2F%2Fexample.com%2Fachado.git']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Achado');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/achado.git');
  });

  it('shows the plugin form when type=plugin is in the query params, pre-filled', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=plugin&name=Plugin+Achado&url=https%3A%2F%2Fexample.com%2Fplugin.git']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Plugin Achado');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/plugin.git');
  });

  it('pre-fills only the name for the mcp form (no config can be inferred from search results)', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=mcp&name=MCP+Achado']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('MCP Achado');
    expect(screen.getByLabelText('Config JSON (ex: bloco mcpServers)')).toHaveValue('');
  });

  it('falls back to type=repo when no query params are present', () => {
    render(
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('URL do repositório')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/pages/AddPage.test.tsx`
Expected: FAIL — `AddPage` ainda não lê query params, sempre inicia em `type='repo'` com campos vazios, e não existe opção `plugin` no `Select`.

- [ ] **Step 3: Implement**

Em `apps/web/src/pages/forms/McpForm.tsx`, adicione o prop opcional `initialName`:

```tsx
interface McpFormProps {
  onCreated: (item: Item) => void;
  initialName?: string;
}

export function McpForm({ onCreated, initialName = '' }: McpFormProps) {
  const [name, setName] = useState(initialName);
```

(o restante do `McpForm` não muda).

Em `apps/web/src/pages/AddPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import { PluginForm } from './forms/PluginForm.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp' | 'plugin';
const VALID_TYPES: ItemTypeChoice[] = ['repo', 'skill', 'mcp', 'plugin'];

export function AddPage() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const initialType: ItemTypeChoice = VALID_TYPES.includes(typeParam as ItemTypeChoice)
    ? (typeParam as ItemTypeChoice)
    : 'repo';
  const initialName = searchParams.get('name') ?? '';
  const initialUrl = searchParams.get('url') ?? '';

  const [type, setType] = useState<ItemTypeChoice>(initialType);
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 520 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          color: 'var(--color-text)',
        }}
      >
        Adicionar item
      </h2>
      <Select
        label="Tipo"
        id="item-type"
        value={type}
        onChange={(e) => setType(e.target.value as ItemTypeChoice)}
        style={{ width: 220 }}
      >
        <option value="repo">Repositório</option>
        <option value="skill">Skill</option>
        <option value="mcp">MCP</option>
        <option value="plugin">Plugin</option>
      </Select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} initialName={initialName} initialUrl={initialUrl} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} initialName={initialName} />}
      {type === 'plugin' && <PluginForm onCreated={handleCreated} initialName={initialName} initialUrl={initialUrl} />}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/pages/AddPage.test.tsx`
Expected: PASS (todos os testes, incluindo os 2 já existentes e os 4 novos).

- [ ] **Step 5: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/AddPage.tsx apps/web/src/pages/AddPage.test.tsx apps/web/src/pages/forms/McpForm.tsx
git commit -m "feat: add plugin option to AddPage and pre-fill forms from query params"
```

---

### Task 8: `TypeBadge`, tema e `SearchFilterBar` — plugin

**Files:**
- Modify: `apps/web/src/theme.css`
- Modify: `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.tsx`
- Modify: `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`
- Modify: `apps/web/src/components/SearchFilterBar.tsx`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('TypeBadge', ...)` em `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`:

```ts
  it('renders the Plugin label', () => {
    render(<TypeBadge type="plugin" />);
    expect(screen.getByText('Plugin')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`
Expected: FAIL — `TypeBadge`'s `CONFIG` não tem uma entrada `plugin` ainda (erro de tipo `Record<ItemType, TypeBadgeConfig>` incompleto, ou undefined em runtime).

- [ ] **Step 3: Implement**

Em `apps/web/src/theme.css`, adicione uma nova cor de tipo. No bloco `:root` (dark, padrão), logo depois de `--color-type-mcp-bg`:

```css
  --pink-500: #ec4899;
  --color-type-plugin: var(--pink-500);
  --color-type-plugin-bg: color-mix(in oklch, var(--pink-500) 18%, var(--color-surface));
```

(mova `--pink-500` para perto das outras cores base no topo do bloco, junto de `--violet-500`/`--green-500`/`--amber-500`, seguindo a organização já existente do arquivo.)

No bloco `:root[data-theme='light']`, logo depois de `--color-type-mcp-bg`:

```css
  --color-type-plugin-bg: color-mix(in oklch, var(--pink-500) 14%, white);
```

Em `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.tsx`, adicione a entrada no `CONFIG`:

```ts
const CONFIG: Record<ItemType, TypeBadgeConfig> = {
  skill: { label: 'Skill', color: 'var(--color-type-skill)', bg: 'var(--color-type-skill-bg)', icon: 'sparkles' },
  repo: { label: 'Repo', color: 'var(--color-type-repo)', bg: 'var(--color-type-repo-bg)', icon: 'git-branch' },
  mcp: { label: 'MCP', color: 'var(--color-type-mcp)', bg: 'var(--color-type-mcp-bg)', icon: 'plug' },
  plugin: { label: 'Plugin', color: 'var(--color-type-plugin)', bg: 'var(--color-type-plugin-bg)', icon: 'puzzle' },
};
```

Isso usa um ícone `puzzle` que ainda não existe em `Icon.tsx` — a Task 18 (mais adiante, quando `Icon.tsx` for editado para adicionar `compass`) também adiciona `puzzle` na mesma leva, já que os dois são pequenas adições ao mesmo arquivo. Por ora, para não travar esta task numa dependência cruzada desnecessária, adicione `puzzle` já aqui:

```ts
import { Sparkles, GitBranch, Plug, Puzzle, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon, Wand2 } from 'lucide-react';

const ICONS = {
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  puzzle: Puzzle,
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

(arquivo: `apps/web/src/components/ui/core/Icon/Icon.tsx`)

Em `apps/web/src/components/SearchFilterBar.tsx`, adicione a opção no `Select` de tipo:

```tsx
        <option value="">Todos os tipos</option>
        <option value="skill">Skill</option>
        <option value="repo">Repo</option>
        <option value="mcp">MCP</option>
        <option value="plugin">Plugin</option>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS (o `SearchFilterBar.test.tsx` existente não enumera as opções do `Select`, então não deveria quebrar).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/theme.css apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.tsx apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx apps/web/src/components/SearchFilterBar.tsx apps/web/src/components/ui/core/Icon/Icon.tsx
git commit -m "feat: add plugin type badge, color, filter option, and icon"
```

---

### Task 9: Recomendação — balde `plugins`

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/recommend/parse.ts`
- Modify: `apps/server/src/recommend/parse.test.ts`
- Modify: `apps/server/src/recommend/prompt.ts`
- Modify: `apps/server/src/recommend/recommend.ts`
- Modify: `apps/server/src/recommend/recommend.test.ts`

- [ ] **Step 1: Write the failing tests**

Em `apps/server/src/recommend/parse.test.ts`, substitua o conteúdo inteiro por (adiciona `plugins` em cada JSON literal e um novo caso de "campo obrigatório faltando"):

```ts
import { describe, it, expect } from 'vitest';
import { parseRecommendJson } from './parse.js';

describe('parseRecommendJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está:\n{"skills":[{"id":1,"motivo":"Serve para X"}],"repos":[],"mcps":[{"id":5,"motivo":"Y"}],"plugins":[]}\nFim.`;
    expect(parseRecommendJson(raw)).toEqual({
      skills: [{ id: 1, motivo: 'Serve para X' }],
      repos: [],
      mcps: [{ id: 5, motivo: 'Y' }],
      plugins: [],
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseRecommendJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a list entry is missing motivo', () => {
    expect(parseRecommendJson('{"skills":[{"id":1}],"repos":[],"mcps":[],"plugins":[]}')).toBeNull();
  });

  it('returns null when a required array is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"plugins":[]}')).toBeNull();
  });

  it('returns null when plugins is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"mcps":[]}')).toBeNull();
  });

  it('returns null when id is not a number', () => {
    expect(parseRecommendJson('{"skills":[{"id":"1","motivo":"x"}],"repos":[],"mcps":[],"plugins":[]}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/recommend/parse.test.ts`
Expected: FAIL — `parseRecommendJson` ainda não conhece `plugins`, então o primeiro caso perde o campo no resultado e o novo caso ("returns null when plugins is missing") passa incorretamente (já que hoje `plugins` nem é checado).

- [ ] **Step 3: Implement `parse.ts`**

```ts
export interface ParsedRecommendation {
  id: number;
  motivo: string;
}

export interface ParsedRecommendResult {
  skills: ParsedRecommendation[];
  repos: ParsedRecommendation[];
  mcps: ParsedRecommendation[];
  plugins: ParsedRecommendation[];
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
    const plugins = parseList(parsed.plugins);
    if (!skills || !repos || !mcps || !plugins) return null;
    return { skills, repos, mcps, plugins };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/recommend/parse.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Write the failing recommend.ts tests**

Em `apps/server/src/recommend/recommend.test.ts`, ajuste TODOS os JSON literais existentes (`raw = JSON.stringify({...})`) para incluir `plugins: []`, e ajuste as duas asserções `toEqual({ skills: [], repos: [], mcps: [] })` para `toEqual({ skills: [], repos: [], mcps: [], plugins: [] })`. Depois adicione um novo teste ao final do `describe('getRecommendations', ...)`:

```ts
  it('resolves plugin ids into full items, same as the other three buckets', async () => {
    const plugin = itemsRepo.create(baseNewItem({ type: 'plugin', name: 'My Plugin' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [{ id: plugin.id, motivo: 'Resolve isso' }],
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);

    expect(result?.plugins).toEqual([
      { ...plugin, installedGlobally: null, hasRedactedSecret: null, motivo: 'Resolve isso' },
    ]);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/recommend/recommend.test.ts`
Expected: FAIL — `getRecommendations` ainda não retorna `plugins`.

- [ ] **Step 7: Implement `types.ts`, `prompt.ts`, `recommend.ts`**

Em `apps/server/src/types.ts`, troque `RecommendResult`:

```ts
export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
  plugins: RecommendedItem[];
}
```

Em `apps/server/src/recommend/prompt.ts`, ajuste o texto do prompt e o schema JSON:

```ts
export function buildRecommendPrompt(ideia: string, catalog: CatalogItemForPrompt[]): string {
  const catalogLines = catalog
    .map(
      (item) =>
        `- id=${item.id} tipo=${item.type} nome="${item.name}" categoria="${item.category ?? 'sem categoria'}" resumo="${item.summary ?? ''}" utilidade="${item.utility ?? ''}" tags=[${item.tags.join(', ')}]`
    )
    .join('\n');

  return `Você é um assistente que recomenda itens de um catálogo pessoal de skills, repositórios de código, MCPs (Model Context Protocol servers) e plugins do Claude Code para uma ideia de projeto.

Ideia do usuário: "${ideia}"

Catálogo disponível (só pode recomendar itens desta lista, citando o id exato):
${catalogLines || '(catálogo vazio)'}

Responda APENAS com um JSON no formato:
{"skills": [{"id": N, "motivo": "por que esse item ajuda nessa ideia"}], "repos": [...], "mcps": [...], "plugins": [...]}

Cite apenas ids que aparecem na lista acima. Se nada do catálogo servir para um tipo, retorne um array vazio para esse tipo.`;
}

const RECOMMENDATION_LIST_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { id: { type: 'integer' }, motivo: { type: 'string' } },
    required: ['id', 'motivo'],
  },
};

export const RECOMMEND_JSON_SCHEMA = {
  type: 'object',
  properties: {
    skills: RECOMMENDATION_LIST_SCHEMA,
    repos: RECOMMENDATION_LIST_SCHEMA,
    mcps: RECOMMENDATION_LIST_SCHEMA,
    plugins: RECOMMENDATION_LIST_SCHEMA,
  },
  required: ['skills', 'repos', 'mcps', 'plugins'],
};
```

Em `apps/server/src/recommend/recommend.ts`, ajuste o retorno antecipado de catálogo vazio e o retorno final:

```ts
  const allItems = itemsRepo.list();
  if (allItems.length === 0) {
    return { skills: [], repos: [], mcps: [], plugins: [] };
  }
```

```ts
  return {
    skills: resolveList(parsed.skills, 'skill', itemsRepo, config),
    repos: resolveList(parsed.repos, 'repo', itemsRepo, config),
    mcps: resolveList(parsed.mcps, 'mcp', itemsRepo, config),
    plugins: resolveList(parsed.plugins, 'plugin', itemsRepo, config),
  };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/`
Expected: PASS (todos os arquivos de teste do diretório).

- [ ] **Step 9: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS (verifique também `apps/server/src/routes/recommend.test.ts`, que hoje faz `toEqual({ skills: [], repos: [], mcps: [] })` — ajuste as 3 ocorrências desse literal nesse arquivo para incluir `plugins: []` também, senão esse arquivo passa a falhar).

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/recommend/parse.ts apps/server/src/recommend/parse.test.ts apps/server/src/recommend/prompt.ts apps/server/src/recommend/recommend.ts apps/server/src/recommend/recommend.test.ts apps/server/src/routes/recommend.test.ts
git commit -m "feat: add a plugins bucket to recommendations"
```

---

### Task 10: `RecommendPage.tsx` — coluna Plugins

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/pages/RecommendPage.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Leia primeiro `apps/web/src/pages/RecommendPage.test.tsx` para ver como os testes existentes mockam `getRecommendations` (provavelmente retornando `{ skills: [...], repos: [...], mcps: [...] }` sem `plugins`) — ajuste todos esses mocks para incluir `plugins: []`. Depois adicione ao final do `describe('RecommendPage', ...)`:

```tsx
  it('renders a Plugins column with recommended plugin items', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [
        {
          id: 9,
          type: 'plugin',
          name: 'Meu Plugin',
          sourceType: 'url',
          sourceValue: 'https://example.com/plugin.git',
          localPath: '/skillvault/repos/meu-plugin',
          categoryId: null,
          summary: null,
          utility: null,
          tags: [],
          enrichmentSource: null,
          globalInstallStatus: null,
          downloadStatus: 'not_downloaded',
          installedGlobally: null,
          hasRedactedSecret: null,
          createdAt: '',
          updatedAt: '',
          motivo: 'Ajuda nisso',
        },
      ],
    });
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu Plugin' })).toBeInTheDocument();
  });
```

(ajuste o nome exato do import `getRecommendations`/`api` e do texto do label conforme o que já está no arquivo — siga o padrão dos testes existentes nesse mesmo arquivo em vez de adivinhar.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: FAIL — não existe seção "Plugins" na página ainda.

- [ ] **Step 3: Implement**

Em `apps/web/src/types.ts`, troque `RecommendResult`:

```ts
export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
  plugins: RecommendedItem[];
}
```

Em `apps/web/src/pages/RecommendPage.tsx`, ajuste `EMPTY_MESSAGES`:

```ts
const EMPTY_MESSAGES = {
  skills: 'Nenhuma skill do catálogo cobre essa necessidade.',
  repos: 'Nenhum repositório do catálogo cobre essa necessidade.',
  mcps: 'Nenhum MCP do catálogo cobre essa necessidade.',
  plugins: 'Nenhum plugin do catálogo cobre essa necessidade.',
};
```

Ajuste `handleItemUpdated`:

```tsx
  function handleItemUpdated(updated: Item) {
    setResult((prev) => {
      if (!prev) return prev;
      const patch = (list: RecommendedItem[]) =>
        list.map((it) => (it.id === updated.id ? { ...it, ...updated } : it));
      return {
        skills: patch(prev.skills),
        repos: patch(prev.repos),
        mcps: patch(prev.mcps),
        plugins: patch(prev.plugins),
      };
    });
  }
```

E adicione a quarta `<ResultColumn>` logo depois da de MCPs:

```tsx
          <ResultColumn
            title="MCPs"
            items={result.mcps}
            emptyMessage={EMPTY_MESSAGES.mcps}
            onItemUpdated={handleItemUpdated}
          />
          <ResultColumn
            title="Plugins"
            items={result.plugins}
            emptyMessage={EMPTY_MESSAGES.plugins}
            onItemUpdated={handleItemUpdated}
          />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: PASS (todos os testes, incluindo os já existentes com `plugins: []` adicionado e o novo).

- [ ] **Step 5: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/pages/RecommendPage.tsx apps/web/src/pages/RecommendPage.test.tsx
git commit -m "feat: show a Plugins column on the recommend page"
```

---

## Grupo B — Backend de busca externa

### Task 11: `config.ts` — `githubToken` e `smitheryApiKey`

**Files:**
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('loadConfig', ...)` em `apps/server/src/config.test.ts`:

```ts
  it('defaults githubToken and smitheryApiKey to null, and honors overrides', () => {
    const empty = loadConfig({} as NodeJS.ProcessEnv);
    expect(empty.githubToken).toBeNull();
    expect(empty.smitheryApiKey).toBeNull();

    const configured = loadConfig({
      GITHUB_TOKEN: 'ghp_test',
      SMITHERY_API_KEY: 'smithery_test',
    } as NodeJS.ProcessEnv);
    expect(configured.githubToken).toBe('ghp_test');
    expect(configured.smitheryApiKey).toBe('smithery_test');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: FAIL — `githubToken`/`smitheryApiKey` não existem em `SkillVaultConfig`.

- [ ] **Step 3: Implement**

Em `apps/server/src/config.ts`:

```ts
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
  claudeSkillsDir: string;
  claudeConfigPath: string;
  githubToken: string | null;
  smitheryApiKey: string | null;
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
    claudeSkillsDir: env.CLAUDE_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills'),
    claudeConfigPath: env.CLAUDE_CONFIG_PATH || path.join(os.homedir(), '.claude.json'),
    githubToken: env.GITHUB_TOKEN || null,
    smitheryApiKey: env.SMITHERY_API_KEY || null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts
git commit -m "feat: add optional githubToken and smitheryApiKey config"
```

---

### Task 12: `discover/types.ts` + `discover/github.ts`

**Files:**
- Create: `apps/server/src/discover/types.ts`
- Create: `apps/server/src/discover/github.ts`
- Test: `apps/server/src/discover/github.test.ts`

- [ ] **Step 1: Write `discover/types.ts` (sem teste — só tipos)**

Create `apps/server/src/discover/types.ts`:

```ts
export type DiscoverItemType = 'skill' | 'mcp' | 'plugin';
export type DiscoverSource = 'github' | 'mcp_registry' | 'smithery';

export interface DiscoverResult {
  source: DiscoverSource;
  itemType: DiscoverItemType;
  name: string;
  description: string | null;
  url: string;
  rating: { kind: 'stars' | 'use_count' | 'official'; value: number | null };
  verified: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/server/src/discover/github.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { searchGitHub } from './github.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchGitHub', () => {
  it('maps GitHub search results into the common DiscoverResult shape', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({
        items: [
          {
            full_name: 'someone/awesome-mcp-server',
            description: 'An awesome MCP server',
            html_url: 'https://github.com/someone/awesome-mcp-server',
            stargazers_count: 1234,
          },
        ],
      })) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'someone/awesome-mcp-server',
        description: 'An awesome MCP server',
        url: 'https://github.com/someone/awesome-mcp-server',
        rating: { kind: 'stars', value: 1234 },
        verified: false,
      },
    ]);
  });

  it('combines the query with type-specific topic filters', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(capturedUrl).toContain(encodeURIComponent('pdf topic:mcp-server topic:model-context-protocol'));
  });

  it('uses only topic filters (no free-text term) when the query is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedUrl).toContain(encodeURIComponent('topic:claude-skill topic:claude-skills'));
    expect(capturedUrl).not.toContain('%20topic'.slice(0, 0));
  });

  it('sends an Authorization header when a GitHub token is configured', async () => {
    const config = loadConfig({ GITHUB_TOKEN: 'ghp_test' } as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders).toMatchObject({ Authorization: 'Bearer ghp_test' });
  });

  it('omits the Authorization header when no token is configured', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ items: [] });
    }) as typeof fetch;

    await searchGitHub('', 'skill', config, fetchImpl);

    expect(capturedHeaders).not.toHaveProperty('Authorization');
  });

  it('returns an empty array when the GitHub API responds with an error', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const results = await searchGitHub('pdf', 'mcp', config, fetchImpl);

    expect(results).toEqual([]);
  });
});
```

(o terceiro teste tem uma asserção redundante de sanity check `not.toContain('%20topic'.slice(0, 0))` que sempre passa contra string vazia — remova essa segunda linha, ela não agrega nada; mantenha só o `expect(capturedUrl).toContain(...)`.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/discover/github.test.ts`
Expected: FAIL — `./github.js` não existe.

- [ ] **Step 4: Implement**

Create `apps/server/src/discover/github.ts`:

```ts
import type { SkillVaultConfig } from '../config.js';
import type { DiscoverItemType, DiscoverResult } from './types.js';

const TOPICS: Record<DiscoverItemType, string[]> = {
  skill: ['claude-skill', 'claude-skills'],
  mcp: ['mcp-server', 'model-context-protocol'],
  plugin: ['claude-code-plugin', 'claude-plugin'],
};

interface GitHubRepoItem {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
}

interface GitHubSearchResponse {
  items?: GitHubRepoItem[];
}

export async function searchGitHub(
  query: string,
  itemType: DiscoverItemType,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const topicFilters = TOPICS[itemType].map((topic) => `topic:${topic}`).join(' ');
  const q = query.trim() ? `${query.trim()} ${topicFilters}` : topicFilters;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}),
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as GitHubSearchResponse;
    return (data.items ?? []).map((repo) => ({
      source: 'github' as const,
      itemType,
      name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      rating: { kind: 'stars' as const, value: repo.stargazers_count },
      verified: false,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/discover/github.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/discover/types.ts apps/server/src/discover/github.ts apps/server/src/discover/github.test.ts
git commit -m "feat: add GitHub search as a discovery source"
```

---

### Task 13: `discover/mcpRegistry.ts`

**Files:**
- Create: `apps/server/src/discover/mcpRegistry.ts`
- Test: `apps/server/src/discover/mcpRegistry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/discover/mcpRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { searchMcpRegistry } from './mcpRegistry.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchMcpRegistry', () => {
  it('maps registry servers into the common DiscoverResult shape, marked as official', async () => {
    const fetchImpl = (async () =>
      fakeResponse({
        servers: [
          {
            name: 'io.example/pdf-tools',
            description: 'PDF tools MCP server',
            repository: { url: 'https://github.com/example/pdf-tools' },
          },
        ],
      })) as typeof fetch;

    const results = await searchMcpRegistry('pdf', fetchImpl);

    expect(results).toEqual([
      {
        source: 'mcp_registry',
        itemType: 'mcp',
        name: 'io.example/pdf-tools',
        description: 'PDF tools MCP server',
        url: 'https://github.com/example/pdf-tools',
        rating: { kind: 'official', value: null },
        verified: true,
      },
    ]);
  });

  it('falls back to the registry page URL when no repository url is present', async () => {
    const fetchImpl = (async () =>
      fakeResponse({ servers: [{ name: 'io.example/no-repo' }] })) as typeof fetch;

    const results = await searchMcpRegistry('', fetchImpl);

    expect(results[0].url).toBe('https://registry.modelcontextprotocol.io/servers/io.example%2Fno-repo');
  });

  it('includes the search term as a query param when provided', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchMcpRegistry('pdf', fetchImpl);

    expect(capturedUrl).toContain('search=pdf');
  });

  it('omits the search param entirely when the query is empty', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchMcpRegistry('', fetchImpl);

    expect(capturedUrl).not.toContain('search=');
  });

  it('returns an empty array when the API responds with an error', async () => {
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;
    expect(await searchMcpRegistry('pdf', fetchImpl)).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await searchMcpRegistry('pdf', fetchImpl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/discover/mcpRegistry.test.ts`
Expected: FAIL — `./mcpRegistry.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/server/src/discover/mcpRegistry.ts`:

```ts
import type { DiscoverResult } from './types.js';

const REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';

interface McpRegistryServer {
  name: string;
  description?: string;
  repository?: { url?: string };
}

interface McpRegistryResponse {
  servers?: McpRegistryServer[];
}

export async function searchMcpRegistry(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const url = query.trim()
    ? `${REGISTRY_BASE_URL}/v0.1/servers?search=${encodeURIComponent(query.trim())}`
    : `${REGISTRY_BASE_URL}/v0.1/servers`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) return [];
    const data = (await response.json()) as McpRegistryResponse;
    return (data.servers ?? []).map((server) => ({
      source: 'mcp_registry' as const,
      itemType: 'mcp' as const,
      name: server.name,
      description: server.description ?? null,
      url: server.repository?.url ?? `${REGISTRY_BASE_URL}/servers/${encodeURIComponent(server.name)}`,
      rating: { kind: 'official' as const, value: null },
      verified: true,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/discover/mcpRegistry.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/discover/mcpRegistry.ts apps/server/src/discover/mcpRegistry.test.ts
git commit -m "feat: add the official MCP registry as a discovery source"
```

---

### Task 14: `discover/smithery.ts`

**Files:**
- Create: `apps/server/src/discover/smithery.ts`
- Test: `apps/server/src/discover/smithery.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/discover/smithery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { searchSmithery } from './smithery.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('searchSmithery', () => {
  it('returns an empty array without calling fetch when no API key is configured', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    const results = await searchSmithery('pdf', config, fetchImpl);

    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it('maps servers into the common DiscoverResult shape when a key is configured', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({
        servers: [
          {
            qualifiedName: 'someone/pdf-mcp',
            displayName: 'PDF MCP',
            description: 'Handles PDFs',
            useCount: 4200,
            verified: true,
            repository: { url: 'https://github.com/someone/pdf-mcp' },
          },
        ],
      })) as typeof fetch;

    const results = await searchSmithery('pdf', config, fetchImpl);

    expect(results).toEqual([
      {
        source: 'smithery',
        itemType: 'mcp',
        name: 'PDF MCP',
        description: 'Handles PDFs',
        url: 'https://github.com/someone/pdf-mcp',
        rating: { kind: 'use_count', value: 4200 },
        verified: true,
      },
    ]);
  });

  it('falls back to qualifiedName when displayName is absent, and to the Smithery page when no repository url is present', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () =>
      fakeResponse({ servers: [{ qualifiedName: 'someone/no-display-name' }] })) as typeof fetch;

    const results = await searchSmithery('', config, fetchImpl);

    expect(results[0].name).toBe('someone/no-display-name');
    expect(results[0].url).toBe('https://smithery.ai/server/someone%2Fno-display-name');
    expect(results[0].verified).toBe(false);
    expect(results[0].rating).toEqual({ kind: 'use_count', value: null });
  });

  it('sends the API key as a bearer token', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return fakeResponse({ servers: [] });
    }) as typeof fetch;

    await searchSmithery('pdf', config, fetchImpl);

    expect(capturedHeaders).toMatchObject({ Authorization: 'Bearer key' });
  });

  it('returns an empty array when the API responds with an error', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;
    expect(await searchSmithery('pdf', config, fetchImpl)).toEqual([]);
  });

  it('returns an empty array when the fetch call throws', async () => {
    const config = loadConfig({ SMITHERY_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await searchSmithery('pdf', config, fetchImpl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/discover/smithery.test.ts`
Expected: FAIL — `./smithery.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/server/src/discover/smithery.ts`:

```ts
import type { SkillVaultConfig } from '../config.js';
import type { DiscoverResult } from './types.js';

interface SmitheryServer {
  qualifiedName: string;
  displayName?: string;
  description?: string;
  useCount?: number;
  verified?: boolean;
  repository?: { url?: string };
}

interface SmitheryResponse {
  servers?: SmitheryServer[];
}

export async function searchSmithery(
  query: string,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  if (!config.smitheryApiKey) return [];

  const url = query.trim()
    ? `https://api.smithery.ai/servers?q=${encodeURIComponent(query.trim())}`
    : 'https://api.smithery.ai/servers';

  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${config.smitheryApiKey}` },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as SmitheryResponse;
    return (data.servers ?? []).map((server) => ({
      source: 'smithery' as const,
      itemType: 'mcp' as const,
      name: server.displayName ?? server.qualifiedName,
      description: server.description ?? null,
      url: server.repository?.url ?? `https://smithery.ai/server/${encodeURIComponent(server.qualifiedName)}`,
      rating: { kind: 'use_count' as const, value: server.useCount ?? null },
      verified: server.verified ?? false,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/discover/smithery.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/discover/smithery.ts apps/server/src/discover/smithery.test.ts
git commit -m "feat: add Smithery as an optional discovery source"
```

---

### Task 15: `discover/aggregate.ts`

**Files:**
- Create: `apps/server/src/discover/aggregate.ts`
- Test: `apps/server/src/discover/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/discover/aggregate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../config.js';
import type { DiscoverResult } from './types.js';

vi.mock('./github.js', () => ({ searchGitHub: vi.fn() }));
vi.mock('./mcpRegistry.js', () => ({ searchMcpRegistry: vi.fn() }));
vi.mock('./smithery.js', () => ({ searchSmithery: vi.fn() }));

import { searchGitHub } from './github.js';
import { searchMcpRegistry } from './mcpRegistry.js';
import { searchSmithery } from './smithery.js';
import { discoverItems } from './aggregate.js';

function fakeResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'x',
    description: null,
    url: 'https://example.com',
    rating: { kind: 'stars', value: 1 },
    verified: false,
    ...overrides,
  };
}

describe('discoverItems', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls only GitHub for itemType=skill', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ itemType: 'skill' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const results = await discoverItems('pdf', 'skill', config, fetch);

    expect(searchGitHub).toHaveBeenCalledWith('pdf', 'skill', config, fetch);
    expect(searchMcpRegistry).not.toHaveBeenCalled();
    expect(searchSmithery).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('calls only GitHub for itemType=plugin', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ itemType: 'plugin' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    await discoverItems('pdf', 'plugin', config, fetch);

    expect(searchGitHub).toHaveBeenCalledWith('pdf', 'plugin', config, fetch);
    expect(searchMcpRegistry).not.toHaveBeenCalled();
    expect(searchSmithery).not.toHaveBeenCalled();
  });

  it('calls GitHub, the MCP registry, and Smithery for itemType=mcp, concatenating results', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([fakeResult({ source: 'github' })]);
    vi.mocked(searchMcpRegistry).mockResolvedValue([fakeResult({ source: 'mcp_registry' })]);
    vi.mocked(searchSmithery).mockResolvedValue([fakeResult({ source: 'smithery' })]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const results = await discoverItems('pdf', 'mcp', config, fetch);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.source)).toEqual(['github', 'mcp_registry', 'smithery']);
  });

  it('queries all three types when itemType is omitted', async () => {
    vi.mocked(searchGitHub).mockResolvedValue([]);
    vi.mocked(searchMcpRegistry).mockResolvedValue([]);
    vi.mocked(searchSmithery).mockResolvedValue([]);
    const config = loadConfig({} as NodeJS.ProcessEnv);

    await discoverItems('', undefined, config, fetch);

    expect(searchGitHub).toHaveBeenCalledTimes(3);
    expect(searchGitHub).toHaveBeenCalledWith('', 'skill', config, fetch);
    expect(searchGitHub).toHaveBeenCalledWith('', 'mcp', config, fetch);
    expect(searchGitHub).toHaveBeenCalledWith('', 'plugin', config, fetch);
    expect(searchMcpRegistry).toHaveBeenCalledTimes(1);
    expect(searchSmithery).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/discover/aggregate.test.ts`
Expected: FAIL — `./aggregate.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/server/src/discover/aggregate.ts`:

```ts
import type { SkillVaultConfig } from '../config.js';
import type { DiscoverItemType, DiscoverResult } from './types.js';
import { searchGitHub } from './github.js';
import { searchMcpRegistry } from './mcpRegistry.js';
import { searchSmithery } from './smithery.js';

const ALL_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

async function discoverForType(
  query: string,
  itemType: DiscoverItemType,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch
): Promise<DiscoverResult[]> {
  const sources: Promise<DiscoverResult[]>[] = [searchGitHub(query, itemType, config, fetchImpl)];
  if (itemType === 'mcp') {
    sources.push(searchMcpRegistry(query, fetchImpl), searchSmithery(query, config, fetchImpl));
  }
  const results = await Promise.all(sources);
  return results.flat();
}

export async function discoverItems(
  query: string,
  itemType: DiscoverItemType | undefined,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const types = itemType ? [itemType] : ALL_TYPES;
  const perType = await Promise.all(types.map((type) => discoverForType(query, type, config, fetchImpl)));
  return perType.flat();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/discover/aggregate.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Run full discover suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run src/discover/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/discover/aggregate.ts apps/server/src/discover/aggregate.test.ts
git commit -m "feat: aggregate discovery sources by item type"
```

---

### Task 16: `routes/discover.ts`

**Files:**
- Create: `apps/server/src/routes/discover.ts`
- Test: `apps/server/src/routes/discover.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/routes/discover.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs, type SkillVaultConfig } from '../config.js';
import { buildApp } from '../app.js';

vi.mock('../discover/aggregate.js', () => ({
  discoverItems: vi.fn(),
}));

import { discoverItems } from '../discover/aggregate.js';

describe('GET /api/discover', () => {
  const home = path.join(os.tmpdir(), `skillvault-discover-routes-${Date.now()}`);
  const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-discover-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function makeConfig(): SkillVaultConfig {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  it('returns results from discoverItems', async () => {
    vi.mocked(discoverItems).mockResolvedValue([
      {
        source: 'github',
        itemType: 'mcp',
        name: 'x/y',
        description: null,
        url: 'https://github.com/x/y',
        rating: { kind: 'stars', value: 10 },
        verified: false,
      },
    ]);

    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({ method: 'GET', url: '/api/discover?q=pdf&type=mcp' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(discoverItems).toHaveBeenCalledWith('pdf', 'mcp', expect.anything());
  });

  it('defaults q to an empty string and type to undefined when omitted', async () => {
    vi.mocked(discoverItems).mockResolvedValue([]);
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });

    await app.inject({ method: 'GET', url: '/api/discover' });

    expect(discoverItems).toHaveBeenCalledWith('', undefined, expect.anything());
  });

  it('returns 400 for an unsupported type', async () => {
    const app = buildApp({ db: createDb(':memory:'), config: makeConfig(), webDistPath: noDistPath });
    const response = await app.inject({ method: 'GET', url: '/api/discover?type=nim' });

    expect(response.statusCode).toBe(400);
    expect(discoverItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/routes/discover.test.ts`
Expected: FAIL — rota `/api/discover` não existe (404).

- [ ] **Step 3: Implement**

Create `apps/server/src/routes/discover.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { discoverItems } from '../discover/aggregate.js';
import type { DiscoverItemType } from '../discover/types.js';

const VALID_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

export function discoverRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    app.get('/api/discover', async (request, reply) => {
      const { q, type } = request.query as { q?: string; type?: string };

      if (type !== undefined && !VALID_TYPES.includes(type as DiscoverItemType)) {
        return reply.status(400).send({ error: `unsupported type: ${type}` });
      }

      return discoverItems(q ?? '', type as DiscoverItemType | undefined, config);
    });
  };
}
```

Em `apps/server/src/app.ts`, registre a rota:

```ts
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';
import { indexRoute } from './routes/indexRoute.js';
import { recommendRoutes } from './routes/recommend.js';
import { discoverRoutes } from './routes/discover.js';
```

```ts
  app.register(categoriesRoutes(options.config));
  app.register(itemsRoutes(options.config));
  app.register(indexRoute(options.config));
  app.register(recommendRoutes(options.config));
  app.register(discoverRoutes(options.config));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/routes/discover.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/discover.ts apps/server/src/routes/discover.test.ts apps/server/src/app.ts
git commit -m "feat: add GET /api/discover route"
```

---

## Grupo C — Frontend de busca externa

### Task 17: Frontend — tipos `DiscoverResult` + `discoverItems()` no cliente

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api/client.ts`

Sem teste dedicado — validado pelos testes de `DiscoverResultCard`/`DiscoverPage` nas próximas tasks, que efetivamente chamam/mockam essas funções, e por `tsc --noEmit`.

- [ ] **Step 1: Add types**

Em `apps/web/src/types.ts`, adicione ao final do arquivo:

```ts
export type DiscoverItemType = 'skill' | 'mcp' | 'plugin';
export type DiscoverSource = 'github' | 'mcp_registry' | 'smithery';

export interface DiscoverResult {
  source: DiscoverSource;
  itemType: DiscoverItemType;
  name: string;
  description: string | null;
  url: string;
  rating: { kind: 'stars' | 'use_count' | 'official'; value: number | null };
  verified: boolean;
}
```

- [ ] **Step 2: Add `discoverItems` to `api/client.ts`**

Em `apps/web/src/api/client.ts`, importe o novo tipo e adicione a função no final do arquivo:

```ts
import type {
  Category,
  Item,
  ItemDetail,
  ItemFilters,
  ItemUpdate,
  RecommendResult,
  Consulta,
  DiscoverResult,
  DiscoverItemType,
} from '../types.js';
```

```ts
export function discoverItems(q: string, type?: DiscoverItemType): Promise<DiscoverResult[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  const qs = params.toString();
  return request<DiscoverResult[]>(`/api/discover${qs ? `?${qs}` : ''}`);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/api/client.ts
git commit -m "feat: add DiscoverResult types and discoverItems() to the API client"
```

---

### Task 18: `Icon.tsx` — ícone `compass`

**Files:**
- Modify: `apps/web/src/components/ui/core/Icon/Icon.tsx`
- Modify: `apps/web/src/components/ui/core/Icon/Icon.test.tsx`

(`puzzle` já foi adicionado na Task 8, junto com o `TypeBadge` de plugin — esta task só adiciona `compass`, usado pela navegação da Task 21.)

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('Icon', ...)` em `apps/web/src/components/ui/core/Icon/Icon.test.tsx`:

```ts
  it('renders the compass icon', () => {
    const { container } = render(<Icon name="compass" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/core/Icon/Icon.test.tsx`
Expected: FAIL — `'compass'` não é um `IconName` válido (erro de tipo) / não existe no mapa `ICONS`.

- [ ] **Step 3: Implement**

Em `apps/web/src/components/ui/core/Icon/Icon.tsx`, adicione `Compass` ao import e ao mapa `ICONS` (mantendo `Puzzle`, já adicionado na Task 8):

```ts
import { Sparkles, GitBranch, Plug, Puzzle, Compass, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon, Wand2 } from 'lucide-react';

const ICONS = {
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  puzzle: Puzzle,
  compass: Compass,
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

Se `lucide-react` não exportar `Compass` sob esse nome exato (confirme com `grep -i "export.*Compass" node_modules/lucide-react/dist/lucide-react.d.ts` ou similar), use o ícone existente mais próximo semanticamente da coleção já importada em vez de travar a task — documente a escolha no commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/core/Icon/Icon.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/core/Icon/Icon.tsx apps/web/src/components/ui/core/Icon/Icon.test.tsx
git commit -m "feat: add compass icon"
```

---

### Task 19: `DiscoverResultCard.tsx`

**Files:**
- Create: `apps/web/src/components/DiscoverResultCard.tsx`
- Test: `apps/web/src/components/DiscoverResultCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/DiscoverResultCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverResultCard } from './DiscoverResultCard.js';
import type { DiscoverResult } from '../types.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function sampleResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/awesome-mcp',
    description: 'An awesome MCP server',
    url: 'https://github.com/someone/awesome-mcp',
    rating: { kind: 'stars', value: 1234 },
    verified: false,
    ...overrides,
  };
}

describe('DiscoverResultCard', () => {
  it('formats star ratings compactly', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard result={sampleResult()} />
      </MemoryRouter>
    );
    expect(screen.getByText('★ 1.2k')).toBeInTheDocument();
  });

  it('formats use_count ratings', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'smithery', rating: { kind: 'use_count', value: 500 } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('500 usos')).toBeInTheDocument();
  });

  it('shows an "Oficial" badge for mcp_registry results without a numeric rating', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'mcp_registry', verified: true, rating: { kind: 'official', value: null } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Oficial')).toBeInTheDocument();
  });

  it('shows a "Verificado" badge for verified Smithery results', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'smithery', verified: true, rating: { kind: 'use_count', value: 10 } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Verificado')).toBeInTheDocument();
  });

  it('navigates to /add with the result data as query params when "Adicionar ao vault" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({
            itemType: 'plugin',
            name: 'someone/my-plugin',
            url: 'https://github.com/someone/my-plugin',
          })}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar ao vault' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/add?type=plugin&name=someone%2Fmy-plugin&url=https%3A%2F%2Fgithub.com%2Fsomeone%2Fmy-plugin'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/DiscoverResultCard.test.tsx`
Expected: FAIL — módulo `./DiscoverResultCard.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/DiscoverResultCard.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import type { DiscoverResult } from '../types.js';
import { TypeBadge } from './ui/data-display/TypeBadge/TypeBadge.js';
import { Button } from './ui/core/Button/Button.js';

export interface DiscoverResultCardProps {
  result: DiscoverResult;
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(value);
}

function formatRating(result: DiscoverResult): string | null {
  if (result.rating.value === null) return null;
  if (result.rating.kind === 'stars') return `★ ${formatCompactNumber(result.rating.value)}`;
  if (result.rating.kind === 'use_count') return `${formatCompactNumber(result.rating.value)} usos`;
  return null;
}

export function DiscoverResultCard({ result }: DiscoverResultCardProps) {
  const navigate = useNavigate();
  const rating = formatRating(result);

  function handleAdd() {
    const params = new URLSearchParams({ type: result.itemType, name: result.name, url: result.url });
    navigate(`/add?${params.toString()}`);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-3)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={result.itemType} size="sm" />
        {result.source === 'mcp_registry' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>Oficial</span>
        )}
        {result.source === 'smithery' && result.verified && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>Verificado</span>
        )}
        {rating && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{rating}</span>}
      </div>
      <a href={result.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600 }}>
        {result.name}
      </a>
      {result.description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{result.description}</p>
      )}
      <div>
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          Adicionar ao vault
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/DiscoverResultCard.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/DiscoverResultCard.tsx apps/web/src/components/DiscoverResultCard.test.tsx
git commit -m "feat: add DiscoverResultCard component"
```

---

### Task 20: `DiscoverPage.tsx` + rota

**Files:**
- Create: `apps/web/src/pages/DiscoverPage.tsx`
- Test: `apps/web/src/pages/DiscoverPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/DiscoverPage.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverPage } from './DiscoverPage.js';
import * as api from '../api/client.js';
import type { DiscoverResult } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/awesome-mcp',
    description: 'An awesome MCP server',
    url: 'https://github.com/someone/awesome-mcp',
    rating: { kind: 'stars', value: 1234 },
    verified: false,
    ...overrides,
  };
}

describe('DiscoverPage', () => {
  it('loads highlighted results (empty query) on mount, grouped by source', async () => {
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([
      sampleResult({ source: 'github' }),
      sampleResult({ source: 'mcp_registry', name: 'io.example/pdf' }),
    ]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registro oficial de MCP' })).toBeInTheDocument();
    expect(discoverSpy).toHaveBeenCalledWith('', undefined);
  });

  it('shows an empty state when no source returns results', async () => {
    vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.spyOn(api, 'discoverItems').mockRejectedValue(new Error('network error'));

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('refetches with the typed query after the debounce delay', async () => {
    const user = userEvent.setup();
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum resultado encontrado.');
    discoverSpy.mockClear();

    await user.type(screen.getByLabelText('Buscar'), 'pdf');

    await vi.waitFor(() => {
      expect(discoverSpy).toHaveBeenCalledWith('pdf', undefined);
    });
  });

  it('refetches when the type filter changes', async () => {
    const user = userEvent.setup();
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum resultado encontrado.');
    discoverSpy.mockClear();

    await user.selectOptions(screen.getByLabelText('Tipo'), 'plugin');

    await vi.waitFor(() => {
      expect(discoverSpy).toHaveBeenCalledWith('', 'plugin');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/pages/DiscoverPage.test.tsx`
Expected: FAIL — módulo `./DiscoverPage.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/web/src/pages/DiscoverPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { discoverItems } from '../api/client.js';
import { DiscoverResultCard } from '../components/DiscoverResultCard.js';
import { Input } from '../components/ui/forms/Input/Input.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import type { DiscoverResult, DiscoverItemType } from '../types.js';

const SOURCE_LABELS: Record<DiscoverResult['source'], string> = {
  github: 'GitHub',
  mcp_registry: 'Registro oficial de MCP',
  smithery: 'Smithery',
};

function groupBySource(results: DiscoverResult[]): [DiscoverResult['source'], DiscoverResult[]][] {
  const groups = new Map<DiscoverResult['source'], DiscoverResult[]>();
  for (const result of results) {
    if (!groups.has(result.source)) groups.set(result.source, []);
    groups.get(result.source)!.push(result);
  }
  return [...groups.entries()];
}

export function DiscoverPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DiscoverItemType | ''>('');
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      discoverItems(q, type || undefined)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
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
  }, [q, type]);

  const groups = groupBySource(results);

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
        Descobrir
      </h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input
          type="search"
          placeholder="Buscar skills, MCPs, plugins..."
          aria-label="Buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          aria-label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as DiscoverItemType | '')}
          style={{ width: 160 }}
        >
          <option value="">Todos os tipos</option>
          <option value="skill">Skill</option>
          <option value="mcp">MCP</option>
          <option value="plugin">Plugin</option>
        </Select>
      </div>
      {status === 'loading' && <p>Buscando...</p>}
      {status === 'error' && <StatusMessage kind="error">Não foi possível buscar fontes externas.</StatusMessage>}
      {status === 'ready' && results.length === 0 && <p>Nenhum resultado encontrado.</p>}
      {status === 'ready' &&
        groups.map(([source, sourceResults]) => (
          <section key={source} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--fw-title)',
                color: 'var(--color-text)',
              }}
            >
              {SOURCE_LABELS[source]}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {sourceResults.map((result) => (
                <DiscoverResultCard key={`${result.source}-${result.url}`} result={result} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
```

Em `apps/web/src/App.tsx`, registre a rota:

```tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';
import { AddPage } from './pages/AddPage.js';
import { RecommendPage } from './pages/RecommendPage.js';
import { DiscoverPage } from './pages/DiscoverPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="add" element={<AddPage />} />
        <Route path="recommend" element={<RecommendPage />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/pages/DiscoverPage.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/DiscoverPage.tsx apps/web/src/pages/DiscoverPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: add the Discover page and route"
```

---

### Task 21: `Sidebar.tsx` — entrada de navegação "Descobrir"

**Files:**
- Modify: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`
- Modify: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('Sidebar', ...)` em `apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx`:

```tsx
  it('renders a navigation link to the discover route', () => {
    render(
      <MemoryRouter>
        <Sidebar theme="dark" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Descobrir' })).toHaveAttribute('href', '/discover');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/navigation/Sidebar/Sidebar.test.tsx`
Expected: FAIL — não existe link "Descobrir".

- [ ] **Step 3: Implement**

Em `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`, adicione a entrada entre "Catálogo" e "Adicionar":

```ts
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Catálogo', icon: 'library', end: true },
  { to: '/discover', label: 'Descobrir', icon: 'compass' },
  { to: '/add', label: 'Adicionar', icon: 'plus-circle' },
  { to: '/recommend', label: 'Recomendar', icon: 'wand-2' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/navigation/Sidebar/Sidebar.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx
git commit -m "feat: add Descobrir link to the sidebar"
```

---

### Task 22: Rebuild + verificação final

**Files:** nenhum (apenas build/verificação)

- [ ] **Step 1: Rebuild**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run build --workspace apps/web`
Expected: build finishes with no errors.

- [ ] **Step 2: Full workspace test run**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run test`
Expected: PASS — `apps/server` e `apps/web` verdes.

- [ ] **Step 3: Manual smoke test in the browser**

O servidor local não faz hot-reload — reinicie para servir o frontend recompilado:

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill //PID <pid-from-above> //F
wscript.exe run-server-hidden.vbs
```

Abrir `http://localhost:3001`:
1. Confirmar que "Descobrir" aparece na barra lateral, entre "Catálogo" e "Adicionar".
2. Ir em Descobrir, confirmar que resultados de destaque carregam ao abrir a página (sem digitar nada), agrupados por fonte.
3. Digitar uma busca (ex: "pdf"), confirmar que a lista atualiza.
4. Trocar o filtro de tipo para "Plugin", confirmar que só aparecem resultados do GitHub.
5. Clicar em "Adicionar ao vault" num resultado, confirmar que `/add` abre com tipo/nome/URL pré-preenchidos.
6. Confirmar/editar e enviar — confirmar que o item aparece no Catálogo com o tipo certo (badge "Plugin" ou "MCP" etc.), e — se for repo/plugin criado por URL — que o card mostra a ação de baixar (`RepoDownloadAction`, já existente, deve funcionar igual para `plugin`).
7. Ir em Recomendar, confirmar que a coluna "Plugins" aparece nos resultados.

Sem `GITHUB_TOKEN`/`SMITHERY_API_KEY` configurados, confirmar que a busca ainda funciona (GitHub com rate limit menor, Smithery simplesmente ausente dos resultados, sem erro visível).

No commit for this task.
