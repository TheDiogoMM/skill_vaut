# Disponibilidade global + instalação com um clique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada skill/MCP do catálogo passa a mostrar, em todo lugar da interface, se já está instalado/disponível globalmente (fora do vault) — e, quando não estiver, oferece um botão para instalar de verdade (copiar skill para `~/.claude/skills`, ou escrever o MCP no `~/.claude.json` real, com backup automático e nunca instalando um config com segredo redigido).

**Architecture:** Dois campos (`installedGlobally`, `hasRedactedSecret`) calculados **ao vivo** a cada leitura de item (nunca persistidos), via um novo módulo `global-status.ts` que checa o sistema de arquivos/config real. Um novo endpoint `POST /api/items/:id/install` materializa a instalação sob demanda. No frontend, um novo componente `GlobalInstallAction` (irmão do `RepoDownloadAction` já existente) entra nos mesmos três lugares que já mostram status de repo, e um `AvailabilityBadge` compartilhado deixa a apresentação visualmente consistente nos dois casos.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, React, Vitest — sem novas dependências.

---

## Backend

### Task 1: Config — `claudeSkillsDir` e `claudeConfigPath`

**Files:**
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/server/src/config.test.ts`, inside `describe('loadConfig', ...)`:

```ts
  it('defaults claudeSkillsDir and claudeConfigPath to the standard Claude Code locations', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.claudeSkillsDir).toBe(path.join(os.homedir(), '.claude', 'skills'));
    expect(config.claudeConfigPath).toBe(path.join(os.homedir(), '.claude.json'));
  });

  it('honors CLAUDE_SKILLS_DIR and CLAUDE_CONFIG_PATH overrides', () => {
    const config = loadConfig({
      CLAUDE_SKILLS_DIR: '/tmp/custom-skills',
      CLAUDE_CONFIG_PATH: '/tmp/custom-claude.json',
    } as NodeJS.ProcessEnv);
    expect(config.claudeSkillsDir).toBe('/tmp/custom-skills');
    expect(config.claudeConfigPath).toBe('/tmp/custom-claude.json');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: FAIL — `claudeSkillsDir`/`claudeConfigPath` don't exist on the returned config.

- [ ] **Step 3: Add the fields**

Replace `apps/server/src/config.ts` entirely with:

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
  claudeSkillsDir: string;
  claudeConfigPath: string;
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
  };
}

export function ensureSkillVaultDirs(config: SkillVaultConfig): void {
  for (const dir of [config.skillvaultHome, config.reposDir, config.skillsDir, config.mcpsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts
git commit -m "feat: add claudeSkillsDir and claudeConfigPath to SkillVaultConfig"
```

---

### Task 2: `global-status.ts` — cálculo ao vivo de disponibilidade

**Files:**
- Create: `apps/server/src/global-status.ts`
- Create: `apps/server/src/global-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/global-status.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isSkillInstalledGlobally,
  isMcpInstalledGlobally,
  mcpHasRedactedSecret,
  computeGlobalStatus,
} from './global-status.js';
import type { Item } from './types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'my-skill',
    sourceType: 'local_path',
    sourceValue: '/tmp/does-not-matter',
    localPath: '/tmp/does-not-matter',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isSkillInstalledGlobally', () => {
  const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-global-status-skills-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
  });

  it('returns true when a folder with the same basename exists', () => {
    fs.mkdirSync(path.join(claudeSkillsDir, 'my-skill'), { recursive: true });
    const item = sampleItem({ localPath: '/wherever/my-skill' });
    expect(isSkillInstalledGlobally({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item)).toBe(true);
  });

  it('returns false when no matching folder exists', () => {
    const item = sampleItem({ localPath: '/wherever/missing-skill' });
    expect(isSkillInstalledGlobally({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item)).toBe(false);
  });
});

describe('isMcpInstalledGlobally', () => {
  const claudeConfigPath = path.join(os.tmpdir(), `skillvault-global-status-config-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('returns true when the item name is a key in mcpServers', () => {
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { stripe: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(true);
  });

  it('returns false when the config file does not exist', () => {
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(
      isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/does/not/exist.json' }, item)
    ).toBe(false);
  });

  it('returns false when the config file is not valid JSON', () => {
    fs.writeFileSync(claudeConfigPath, 'not json');
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(false);
  });

  it('returns false when the item name is not a key in mcpServers', () => {
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { supabase: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(false);
  });
});

describe('mcpHasRedactedSecret', () => {
  const mcpFilePath = path.join(os.tmpdir(), `skillvault-global-status-mcp-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(mcpFilePath, { force: true });
  });

  it('returns true when the file contains <REDACTED>', () => {
    fs.writeFileSync(mcpFilePath, JSON.stringify({ env: { KEY: '<REDACTED>' } }));
    const item = sampleItem({ type: 'mcp', localPath: mcpFilePath });
    expect(mcpHasRedactedSecret(item)).toBe(true);
  });

  it('returns false when the file has no redacted values', () => {
    fs.writeFileSync(mcpFilePath, JSON.stringify({ type: 'http', url: 'https://example.com' }));
    const item = sampleItem({ type: 'mcp', localPath: mcpFilePath });
    expect(mcpHasRedactedSecret(item)).toBe(false);
  });
});

describe('computeGlobalStatus', () => {
  it('returns nulls for repo items', () => {
    const item = sampleItem({ type: 'repo' });
    expect(computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item)).toEqual({
      installedGlobally: null,
      hasRedactedSecret: null,
    });
  });

  it('returns installedGlobally=false and hasRedactedSecret=null for a skill not yet installed', () => {
    const item = sampleItem({ type: 'skill', localPath: '/nonexistent-skill-path' });
    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item);
    expect(status).toEqual({ installedGlobally: false, hasRedactedSecret: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/global-status.test.ts`
Expected: FAIL — `./global-status.js` does not exist.

- [ ] **Step 3: Implement `global-status.ts`**

Create `apps/server/src/global-status.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { SkillVaultConfig } from './config.js';
import type { Item } from './types.js';

type ClaudeLocations = Pick<SkillVaultConfig, 'claudeSkillsDir' | 'claudeConfigPath'>;

export function isSkillInstalledGlobally(config: ClaudeLocations, item: Item): boolean {
  const target = path.join(config.claudeSkillsDir, path.basename(item.localPath));
  return fs.existsSync(target);
}

export function isMcpInstalledGlobally(config: ClaudeLocations, item: Item): boolean {
  if (!fs.existsSync(config.claudeConfigPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(config.claudeConfigPath, 'utf-8'));
    return typeof parsed.mcpServers === 'object' && parsed.mcpServers !== null && item.name in parsed.mcpServers;
  } catch {
    return false;
  }
}

export function mcpHasRedactedSecret(item: Item): boolean {
  try {
    const raw = fs.readFileSync(item.localPath, 'utf-8');
    return raw.includes('<REDACTED>');
  } catch {
    return false;
  }
}

export interface GlobalStatus {
  installedGlobally: boolean | null;
  hasRedactedSecret: boolean | null;
}

export function computeGlobalStatus(config: ClaudeLocations, item: Item): GlobalStatus {
  if (item.type === 'skill') {
    return { installedGlobally: isSkillInstalledGlobally(config, item), hasRedactedSecret: null };
  }
  if (item.type === 'mcp') {
    return {
      installedGlobally: isMcpInstalledGlobally(config, item),
      hasRedactedSecret: mcpHasRedactedSecret(item),
    };
  }
  return { installedGlobally: null, hasRedactedSecret: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/global-status.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/global-status.ts apps/server/src/global-status.test.ts
git commit -m "feat: compute live global install status for skill/mcp items"
```

---

### Task 3: Expor `installedGlobally`/`hasRedactedSecret` nas rotas de leitura/escrita de item

**Files:**
- Modify: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/routes/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Read the current `apps/server/src/routes/items.test.ts` in full first to see its exact `describe` blocks and helpers (`home`, `config`, `app`, `createFixtureRepo`, `noDistPath`). Add these three tests — one inside the existing `describe('POST /api/items (type=repo)', ...)` block, and two as new standalone `describe` blocks at the end of the file:

```ts
  it('includes installedGlobally=null and hasRedactedSecret=null on a repo item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Status', source_type: 'local_path', path: fixtureRepo },
    });

    const body = response.json();
    expect(body.installedGlobally).toBeNull();
    expect(body.hasRedactedSecret).toBeNull();
  });
```

```ts
describe('GET /api/items includes global status for skill and mcp items', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-global-status-${Date.now()}`);
  const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-claude-skills-${Date.now()}`);
  const claudeConfigPath = path.join(os.tmpdir(), `skillvault-claude-config-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('reflects installedGlobally=true once a skill folder exists at claudeSkillsDir', async () => {
    const config = loadConfig({
      SKILLVAULT_HOME: home,
      CLAUDE_SKILLS_DIR: claudeSkillsDir,
      CLAUDE_CONFIG_PATH: claudeConfigPath,
    } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-status-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Minha Skill');

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Minha Skill', source_type: 'local_path', path: sourceDir },
    });
    const created = create.json();
    expect(created.installedGlobally).toBe(false);

    fs.mkdirSync(path.join(claudeSkillsDir, path.basename(created.localPath)), { recursive: true });

    const getResponse = await app.inject({ method: 'GET', url: `/api/items/${created.id}` });
    expect(getResponse.json().installedGlobally).toBe(true);
  });

  it('reflects hasRedactedSecret=true for an mcp whose config was redacted', async () => {
    const config = loadConfig({
      SKILLVAULT_HOME: home,
      CLAUDE_SKILLS_DIR: claudeSkillsDir,
      CLAUDE_CONFIG_PATH: claudeConfigPath,
    } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'Meu MCP', config: { env: { STRIPE_SECRET_KEY: 'sk_test_real' } } },
    });

    expect(create.json().hasRedactedSecret).toBe(true);
  });
});
```

Make sure `fs` and `path`/`os` are imported at the top of `items.test.ts` — check the existing imports first (the file already imports these for `createFixtureRepo`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: FAIL — responses don't include `installedGlobally`/`hasRedactedSecret` yet.

- [ ] **Step 3: Wire `computeGlobalStatus` into every item-returning response**

In `apps/server/src/routes/items.ts`:

1. Add the import:

```ts
import { computeGlobalStatus } from '../global-status.js';
```

2. Right after the `function regenerate() { ... }` declaration inside `itemsRoutes`, add a small helper:

```ts
    function withGlobalStatus(item: Item) {
      return { ...item, ...computeGlobalStatus(config, item) };
    }
```

This requires importing the `Item` type — add `import type { Item } from '../types.js';` to the top imports.

3. Replace every `return reply.status(201).send(item);` (there are three, one per type branch in `POST /api/items`) with `return reply.status(201).send(withGlobalStatus(item));`.

4. In `app.get('/api/items', ...)`, change the final `return itemsRepo.list({...});` to:

```ts
      const items = itemsRepo.list({
        q,
        type: type as NewItem['type'] | undefined,
        categoryId,
        tag,
      });
      return items.map(withGlobalStatus);
```

5. In `app.get('/api/items/:id', ...)`, change `return { ...item, content: readItemContent(item) };` to:

```ts
      return { ...withGlobalStatus(item), content: readItemContent(item) };
```

6. In `app.patch('/api/items/:id', ...)`, change the final `return item;` to `return withGlobalStatus(item);`.

7. In `app.post('/api/items/:id/download', ...)`, change `return updated;` to `return withGlobalStatus(updated);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full backend suite**

Run: `cd apps/server && npx vitest run`
Expected: PASS — no regressions (existing tests check specific fields, not exhaustive object equality, so the extra fields don't break them).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/items.ts apps/server/src/routes/items.test.ts
git commit -m "feat: include installedGlobally/hasRedactedSecret on all item API responses"
```

---

### Task 4: `install.ts` — ações de instalação (sem rota ainda)

**Files:**
- Create: `apps/server/src/ingestion/install.ts`

Este módulo só executa a ação — validações (já instalado? segredo redigido?) ficam na rota (Task 5), seguindo o mesmo padrão de separação usado por `download.ts` (que também não valida, só executa).

- [ ] **Step 1: Implement `install.ts`**

Create `apps/server/src/ingestion/install.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { SkillVaultConfig } from '../config.js';
import type { Item } from '../types.js';

export function installSkillGlobally(config: SkillVaultConfig, item: Item): void {
  const targetName = path.basename(item.localPath);
  fs.mkdirSync(config.claudeSkillsDir, { recursive: true });
  fs.cpSync(item.localPath, path.join(config.claudeSkillsDir, targetName), { recursive: true });
}

export function installMcpGlobally(config: SkillVaultConfig, item: Item): void {
  const mcpConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));

  let parsed: Record<string, unknown> = {};
  const configExists = fs.existsSync(config.claudeConfigPath);
  if (configExists) {
    try {
      parsed = JSON.parse(fs.readFileSync(config.claudeConfigPath, 'utf-8'));
    } catch {
      throw new Error('failed to parse CLAUDE_CONFIG_PATH');
    }
    const backupPath = `${config.claudeConfigPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(config.claudeConfigPath, backupPath);
  }

  const mcpServers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  parsed.mcpServers = { ...mcpServers, [item.name]: mcpConfig };

  fs.writeFileSync(config.claudeConfigPath, JSON.stringify(parsed, null, 2), 'utf-8');
}
```

Note the ordering inside `installMcpGlobally`: the current config is **read and parsed before** the backup is made, and parse failure `throw`s before any backup/write happens — matching the spec's requirement that a corrupted `~/.claude.json` results in zero filesystem changes.

- [ ] **Step 2: Typecheck**

Run: `cd apps/server && npx tsc --noEmit`
Expected: clean (this file isn't imported/used anywhere yet, so it should just compile standalone with no errors).

This task has no test of its own — both functions are exercised end-to-end by the route tests in Task 5 (matching the precedent set by `download.ts`, which also has no dedicated unit test file).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ingestion/install.ts
git commit -m "feat: add installSkillGlobally and installMcpGlobally actions"
```

---

### Task 5: Rota `POST /api/items/:id/install`

**Files:**
- Modify: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/routes/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `apps/server/src/routes/items.test.ts`:

```ts
describe('POST /api/items/:id/install', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-install-route-${Date.now()}`);
  const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-install-claude-skills-${Date.now()}`);
  const claudeConfigPath = path.join(os.tmpdir(), `skillvault-install-claude-config-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
    fs.rmSync(claudeConfigPath, { force: true });
  });

  function makeConfig() {
    const config = loadConfig({
      SKILLVAULT_HOME: home,
      CLAUDE_SKILLS_DIR: claudeSkillsDir,
      CLAUDE_CONFIG_PATH: claudeConfigPath,
    } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    return config;
  }

  it('installs a skill by copying it into claudeSkillsDir', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const sourceDir = path.join(os.tmpdir(), `skillvault-install-skill-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Minha Skill');

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Minha Skill', source_type: 'local_path', path: sourceDir },
    });
    const created = create.json();

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(200);
    const installed = install.json();
    expect(installed.installedGlobally).toBe(true);
    const targetDir = path.join(claudeSkillsDir, path.basename(created.localPath));
    expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
  });

  it('installs an mcp by merging it into CLAUDE_CONFIG_PATH, backing up the original file first', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    fs.writeFileSync(claudeConfigPath, JSON.stringify({ theme: 'dark', mcpServers: { existing: { type: 'stdio' } } }));

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'novo-mcp', config: { type: 'http', url: 'https://example.com/mcp' } },
    });
    const created = create.json();

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(200);
    expect(install.json().installedGlobally).toBe(true);

    const finalConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
    expect(finalConfig.theme).toBe('dark');
    expect(finalConfig.mcpServers.existing).toEqual({ type: 'stdio' });
    expect(finalConfig.mcpServers['novo-mcp']).toEqual({ type: 'http', url: 'https://example.com/mcp' });

    const backups = fs.readdirSync(path.dirname(claudeConfigPath)).filter((f) => f.startsWith(`${path.basename(claudeConfigPath)}.bak-`));
    expect(backups.length).toBe(1);
    const backupContent = JSON.parse(fs.readFileSync(path.join(path.dirname(claudeConfigPath), backups[0]), 'utf-8'));
    expect(backupContent.mcpServers.existing).toEqual({ type: 'stdio' });
    expect(backupContent.mcpServers['novo-mcp']).toBeUndefined();
  });

  it('returns 500 and writes nothing when CLAUDE_CONFIG_PATH has invalid JSON', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    fs.writeFileSync(claudeConfigPath, 'not valid json{{{');

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'outro-mcp', config: { type: 'http', url: 'https://example.com/mcp' } },
    });
    const created = create.json();

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(500);
    expect(fs.readFileSync(claudeConfigPath, 'utf-8')).toBe('not valid json{{{');
    const backups = fs.readdirSync(path.dirname(claudeConfigPath)).filter((f) => f.startsWith(`${path.basename(claudeConfigPath)}.bak-`));
    expect(backups.length).toBe(0);
  });

  it('returns 409 when the mcp config has a redacted secret', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'mcp-com-segredo', config: { env: { API_KEY: 'sk_real_secret' } } },
    });
    const created = create.json();
    expect(created.hasRedactedSecret).toBe(true);

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(409);
    expect(fs.existsSync(claudeConfigPath)).toBe(false);
  });

  it('returns 409 when the item is already installed globally', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const sourceDir = path.join(os.tmpdir(), `skillvault-install-already-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Já instalada');

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Ja Instalada', source_type: 'local_path', path: sourceDir },
    });
    const created = create.json();

    await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });
    const secondInstall = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(secondInstall.statusCode).toBe(409);
  });

  it('returns 409 for repo items (use /download instead)', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Nao Instala', source_type: 'local_path', path: fixtureRepo },
    });
    const created = create.json();

    const install = await app.inject({ method: 'POST', url: `/api/items/${created.id}/install` });

    expect(install.statusCode).toBe(409);
  });

  it('returns 404 for a nonexistent item', async () => {
    const config = makeConfig();
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'POST', url: '/api/items/999/install' });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: FAIL — `/api/items/:id/install` doesn't exist yet (Fastify's default 404 for all of these).

- [ ] **Step 3: Add the route**

In `apps/server/src/routes/items.ts`:

1. Add the import:

```ts
import { installSkillGlobally, installMcpGlobally } from '../ingestion/install.js';
```

2. Add the route right after the existing `app.post('/api/items/:id/download', ...)` handler, before the closing `};` of `itemsRoutes`:

```ts
    app.post('/api/items/:id/install', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      if (item.type === 'repo') return reply.status(409).send({ error: 'use /download for repo items' });

      const globalStatus = computeGlobalStatus(config, item);
      if (globalStatus.installedGlobally) {
        return reply.status(409).send({ error: 'item is already installed globally' });
      }
      if (globalStatus.hasRedactedSecret) {
        return reply
          .status(409)
          .send({ error: 'mcp config has a redacted secret; add it manually to CLAUDE_CONFIG_PATH' });
      }

      try {
        if (item.type === 'skill') {
          installSkillGlobally(config, item);
        } else {
          installMcpGlobally(config, item);
        }
      } catch (err) {
        return reply.status(500).send({ error: (err as Error).message });
      }

      try {
        regenerate();
      } catch (err) {
        app.log.error(err, 'failed to regenerate index after item install');
      }

      return withGlobalStatus(item);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/routes/items.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full backend suite and typecheck**

Run: `cd apps/server && npx vitest run && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/items.ts apps/server/src/routes/items.test.ts
git commit -m "feat: add POST /api/items/:id/install for skill and mcp global install"
```

---

### Task 6: Índice — incluir `installedGlobally`

**Files:**
- Modify: `apps/server/src/index/generate.ts`
- Modify: `apps/server/src/index/generate.test.ts`
- Modify: `apps/server/src/routes/categories.ts`

O índice é o que o Claude Code consome — sem `installedGlobally`, uma skill/MCP catalogado mas não instalado apareceria como se já estivesse disponível.

- [ ] **Step 1: Write the failing test**

In `apps/server/src/index/generate.test.ts`, add a `testLocations` constant right after the existing `category`/`item` constants:

```ts
const testLocations = { claudeSkillsDir: '/nonexistent-skills-dir', claudeConfigPath: '/nonexistent-config.json' };
```

Update every call to `buildIndexEntries([item], [category])` (and its variants with `itemWithSpecialChars`/`itemWithSpecialPath`) in the file to pass `testLocations` as a third argument, e.g. `buildIndexEntries([item], [category], testLocations)`. Since `item.type` is `'repo'` in every existing fixture, `computeGlobalStatus` never touches the filesystem for these tests (early-returns null/null for repos), so `testLocations` pointing at nonexistent paths is safe and correct.

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
        installedGlobally: null,
      },
    ]);
```

In `describe('writeIndexFiles', ...)`, the `const entries = buildIndexEntries([item], [category]);` line becomes `const entries = buildIndexEntries([item], [category], testLocations);`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/index/generate.test.ts`
Expected: FAIL — `buildIndexEntries` doesn't accept a third argument yet, and entries don't include `installedGlobally`.

- [ ] **Step 3: Update `generate.ts`**

Replace `apps/server/src/index/generate.ts` entirely with:

```ts
import fs from 'node:fs';
import type { Item, Category } from '../types.js';
import type { SkillVaultConfig } from '../config.js';
import { computeGlobalStatus } from '../global-status.js';

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
  installedGlobally: boolean | null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*_`[\]]/g, '\\$&');
}

export function buildIndexEntries(
  items: Item[],
  categories: Category[],
  config: Pick<SkillVaultConfig, 'claudeSkillsDir' | 'claudeConfigPath'>
): IndexEntry[] {
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
    installedGlobally: computeGlobalStatus(config, item).installedGlobally,
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
  for (const [category, categoryEntries] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${category}`, '');
    for (const entry of categoryEntries) {
      const escapedName = escapeMarkdown(entry.name);
      const escapedSummary = escapeMarkdown(entry.summary ?? 'sem resumo');
      const escapedUtility = escapeMarkdown(entry.utility ?? 'n/a');
      lines.push(`- **${escapedName}** (${entry.type}) — ${escapedSummary}`);
      lines.push(`  - Utilidade: ${escapedUtility}`);
      lines.push(`  - Caminho: \`${entry.localPath}\``);
      if (entry.downloadStatus === 'not_downloaded') {
        lines.push(`  - Status: ainda não baixado (pendente de download)`);
      }
      if (entry.installedGlobally === false) {
        lines.push(`  - Status: não instalado globalmente`);
      }
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
  config: Pick<SkillVaultConfig, 'claudeSkillsDir' | 'claudeConfigPath'>,
  jsonPath: string,
  mdPath: string
): void {
  const entries = buildIndexEntries(itemsRepo.list(), categoriesRepo.list(), config);
  writeIndexFiles(entries, jsonPath, mdPath);
}
```

- [ ] **Step 4: Update the two `regenerateIndex` call sites**

In `apps/server/src/routes/items.ts`, inside `function regenerate() { ... }`, change:

```ts
      regenerateIndex(itemsRepo, categoriesRepo, config.indexJsonPath, config.indexMdPath);
```

to:

```ts
      regenerateIndex(itemsRepo, categoriesRepo, config, config.indexJsonPath, config.indexMdPath);
```

In `apps/server/src/routes/categories.ts`, inside its own `function regenerate() { ... }`, change:

```ts
      regenerateIndex(itemsRepo, repo, config.indexJsonPath, config.indexMdPath);
```

to:

```ts
      regenerateIndex(itemsRepo, repo, config, config.indexJsonPath, config.indexMdPath);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/index/generate.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Run the full backend suite and typecheck**

Run: `cd apps/server && npx vitest run && npx tsc --noEmit`
Expected: PASS, zero errors (this confirms `routes/categories.test.ts`, which exercises `regenerateIndex` indirectly through `app.inject`, still passes with the new signature).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/index/generate.ts apps/server/src/index/generate.test.ts apps/server/src/routes/items.ts apps/server/src/routes/categories.ts
git commit -m "feat: expose installedGlobally in index.json/INDEX.md"
```

---

## Frontend

### Task 7: Types + API client — `installedGlobally`, `hasRedactedSecret`, `installItem`

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api/client.ts`

- [ ] **Step 1: Add the fields to `Item`**

In `apps/web/src/types.ts`, add `installedGlobally: boolean | null;` and `hasRedactedSecret: boolean | null;` to the `Item` interface, right after `downloadStatus`:

```ts
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
  installedGlobally: boolean | null;
  hasRedactedSecret: boolean | null;
  createdAt: string;
  updatedAt: string;
}
```

(Leave every other type in the file untouched.)

- [ ] **Step 2: Add `installItem` to the API client**

In `apps/web/src/api/client.ts`, add right after `downloadItem`:

```ts
export function installItem(id: number): Promise<Item> {
  return request<Item>(`/api/items/${id}/install`, { method: 'POST' });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL — several test files' `sampleItem`/`sampleDetail` fixtures are now missing the two new required fields. This is expected and fixed in Task 11, not here.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/api/client.ts
git commit -m "feat: add installedGlobally/hasRedactedSecret to Item and installItem to the API client"
```

---

### Task 8: Componente `AvailabilityBadge`

**Files:**
- Create: `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx`
- Create: `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvailabilityBadge } from './AvailabilityBadge.js';

describe('AvailabilityBadge', () => {
  it('renders its children with a positive tone', () => {
    render(
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Instalado
      </AvailabilityBadge>
    );
    expect(screen.getByText('Instalado')).toBeInTheDocument();
  });

  it('renders its children with a neutral tone', () => {
    render(
      <AvailabilityBadge tone="neutral" icon="alert-circle">
        Não instalado
      </AvailabilityBadge>
    );
    expect(screen.getByText('Não instalado')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../core/Icon/Icon.js';

export type AvailabilityTone = 'positive' | 'neutral';

export interface AvailabilityBadgeProps {
  tone: AvailabilityTone;
  icon: IconName;
  children: ReactNode;
}

const TONE_STYLE: Record<AvailabilityTone, { color: string; background: string; border: string }> = {
  positive: {
    color: 'var(--color-success)',
    background: 'color-mix(in oklch, var(--color-success) 16%, var(--color-surface))',
    border: '1px solid color-mix(in oklch, var(--color-success) 45%, transparent)',
  },
  neutral: {
    color: 'var(--color-text-tertiary)',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
  },
};

export function AvailabilityBadge({ tone, icon, children }: AvailabilityBadgeProps) {
  const style = TONE_STYLE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 600,
        color: style.color,
        background: style.background,
        border: style.border,
      }}
    >
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/AvailabilityBadge
git commit -m "feat: add AvailabilityBadge component"
```

---

### Task 9: `RepoDownloadAction` passa a usar `AvailabilityBadge`

**Files:**
- Modify: `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx`

Puramente visual — nenhuma lógica de dados/API muda, então os testes existentes (`getByText('Local')`, `getByText('Baixado')`) continuam passando sem alteração.

- [ ] **Step 1: Update the component**

Replace `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx` entirely with:

```tsx
import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { downloadItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';
import { AvailabilityBadge } from '../AvailabilityBadge/AvailabilityBadge.js';

export interface RepoDownloadActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function RepoDownloadAction({ item, onUpdated }: RepoDownloadActionProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  if (item.type !== 'repo' || !item.downloadStatus) return null;

  if (item.downloadStatus === 'local') {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Local
      </AvailabilityBadge>
    );
  }

  if (item.downloadStatus === 'downloaded') {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Baixado
      </AvailabilityBadge>
    );
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

- [ ] **Step 2: Run the existing test to verify it still passes unmodified**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`
Expected: PASS (all 4 tests, no changes needed to the test file — `getByText('Local')`/`getByText('Baixado')` still find the text inside the badge).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx
git commit -m "refactor: use AvailabilityBadge for RepoDownloadAction's local/downloaded states"
```

---

### Task 10: Componente `GlobalInstallAction`

**Files:**
- Create: `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx`
- Create: `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalInstallAction } from './GlobalInstallAction.js';
import * as client from '../../../../api/client.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'Minha Skill',
    sourceType: 'local_path',
    sourceValue: '/skillvault/skills/minha-skill',
    localPath: '/skillvault/skills/minha-skill',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: false,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('GlobalInstallAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing for repo items', () => {
    const { container } = render(
      <GlobalInstallAction item={sampleItem({ type: 'repo', installedGlobally: null, downloadStatus: 'local' })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an "Instalado" badge when installedGlobally is true', () => {
    render(<GlobalInstallAction item={sampleItem({ installedGlobally: true })} />);
    expect(screen.getByText('Instalado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a redacted-secret message with no button when hasRedactedSecret is true', () => {
    render(<GlobalInstallAction item={sampleItem({ type: 'mcp', installedGlobally: false, hasRedactedSecret: true })} />);
    expect(screen.getByText('Segredo redigido — instale manualmente')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('installs the item and calls onUpdated when not installed and has no redacted secret', async () => {
    const updatedItem = sampleItem({ installedGlobally: true });
    vi.spyOn(client, 'installItem').mockResolvedValue(updatedItem);
    const onUpdated = vi.fn();

    render(<GlobalInstallAction item={sampleItem({ installedGlobally: false })} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar globalmente' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedItem));
    expect(client.installItem).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx`:

```tsx
import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { installItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';
import { AvailabilityBadge } from '../AvailabilityBadge/AvailabilityBadge.js';

export interface GlobalInstallActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function GlobalInstallAction({ item, onUpdated }: GlobalInstallActionProps) {
  const [status, setStatus] = useState<'idle' | 'installing' | 'error'>('idle');

  if (item.type !== 'skill' && item.type !== 'mcp') return null;
  if (item.installedGlobally === null) return null;

  if (item.installedGlobally) {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Instalado
      </AvailabilityBadge>
    );
  }

  if (item.hasRedactedSecret) {
    return (
      <AvailabilityBadge tone="neutral" icon="alert-circle">
        Segredo redigido — instale manualmente
      </AvailabilityBadge>
    );
  }

  async function handleInstall() {
    setStatus('installing');
    try {
      const updated = await installItem(item.id);
      setStatus('idle');
      onUpdated?.(updated);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleInstall} disabled={status === 'installing'}>
        {status === 'installing' ? 'Instalando...' : 'Instalar globalmente'}
      </Button>
      {status === 'error' && <StatusMessage kind="error">Erro ao instalar.</StatusMessage>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/GlobalInstallAction
git commit -m "feat: add GlobalInstallAction component"
```

---

### Task 11: Corrigir fixtures `Item` existentes (typecheck)

**Files:**
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
- Modify: `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`

Mudança puramente mecânica, sem alteração de comportamento — cada um desses arquivos tem uma função `sampleItem`/`sampleDetail` que constrói um `Item`/`ItemDetail` literal e precisa dos dois novos campos.

- [ ] **Step 1: Confirm the compile errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL — exactly the 5 files listed above, each reporting `installedGlobally`/`hasRedactedSecret` missing.

- [ ] **Step 2: Add the two fields to every fixture**

In each of the 5 files, find the `sampleItem`/`sampleDetail` function's default object (it currently ends with `downloadStatus: <something>,` right before `createdAt`) and add two lines right after it:

```ts
    installedGlobally: null,
    hasRedactedSecret: null,
```

(Do not change anything else — no other lines, no assertion changes.)

- [ ] **Step 3: Run typecheck again**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS — zero errors.

- [ ] **Step 4: Run the full frontend suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — all suites green (no behavior changed, only fixtures gained two fields).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "chore: add installedGlobally/hasRedactedSecret to existing Item test fixtures"
```

---

### Task 12: Ligar `GlobalInstallAction` aos três lugares (catálogo, recomendador, detalhe)

**Files:**
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.tsx`
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
- Modify: `apps/web/src/pages/RecommendPage.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`

Os três lugares já têm a plumbing de `onUpdated` pronta (de um trabalho anterior) — esta tarefa só adiciona a renderização do novo componente ao lado do `RepoDownloadAction` já existente, reaproveitando o mesmo callback.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`, inside `describe('ItemCard', ...)`:

```tsx
  it('shows the global install action for a skill not yet installed', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ type: 'skill', downloadStatus: null, installedGlobally: false })} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Instalar globalmente' })).toBeInTheDocument();
  });
```

(`sampleItem`'s default in this file already has `installedGlobally: null` from Task 11 — this test overrides it explicitly.)

Add to `apps/web/src/pages/RecommendPage.test.tsx`, inside `describe('RecommendPage', ...)`:

```tsx
  it('shows a global install action for a skill result not yet installed', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem({ installedGlobally: false }), motivo: 'Ajuda a extrair texto de PDFs' }],
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

    expect(await screen.findByRole('button', { name: 'Instalar globalmente' })).toBeInTheDocument();
  });
```

Add to `apps/web/src/pages/ItemDetailPage.test.tsx`, inside `describe('ItemDetailPage', ...)`:

```tsx
  it('shows a global install action for a skill pending install', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ type: 'skill', downloadStatus: null, installedGlobally: false })
    );

    renderWithRoute('1');

    expect(await screen.findByRole('button', { name: 'Instalar globalmente' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/ItemCard/ItemCard.test.tsx src/pages/RecommendPage.test.tsx src/pages/ItemDetailPage.test.tsx`
Expected: FAIL — no "Instalar globalmente" button rendered in any of the three yet.

- [ ] **Step 3: Wire `GlobalInstallAction` into `ItemCard`**

In `apps/web/src/components/ui/data-display/ItemCard/ItemCard.tsx`, add the import:

```tsx
import { GlobalInstallAction } from '../GlobalInstallAction/GlobalInstallAction.js';
```

Render it right after the existing `<RepoDownloadAction item={item} onUpdated={onUpdated} />` line:

```tsx
      <RepoDownloadAction item={item} onUpdated={onUpdated} />
      <GlobalInstallAction item={item} onUpdated={onUpdated} />
```

- [ ] **Step 4: Wire `GlobalInstallAction` into `RecommendPage`'s `ResultColumn`**

In `apps/web/src/pages/RecommendPage.tsx`, add the import:

```tsx
import { GlobalInstallAction } from '../components/ui/data-display/GlobalInstallAction/GlobalInstallAction.js';
```

Render it right after the existing `<RepoDownloadAction item={item} onUpdated={onItemUpdated} />` line inside `ResultColumn`:

```tsx
            <RepoDownloadAction item={item} onUpdated={onItemUpdated} />
            <GlobalInstallAction item={item} onUpdated={onItemUpdated} />
```

- [ ] **Step 5: Wire `GlobalInstallAction` into `ItemDetailPage`**

In `apps/web/src/pages/ItemDetailPage.tsx`, add the import:

```tsx
import { GlobalInstallAction } from '../components/ui/data-display/GlobalInstallAction/GlobalInstallAction.js';
```

Render it right after the existing `<RepoDownloadAction .../>` line (inside the same flex container as the "Copiar caminho" button):

```tsx
        <RepoDownloadAction item={item} onUpdated={(updated) => setItem((prev) => (prev ? { ...prev, ...updated } : prev))} />
        <GlobalInstallAction item={item} onUpdated={(updated) => setItem((prev) => (prev ? { ...prev, ...updated } : prev))} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/ItemCard/ItemCard.test.tsx src/pages/RecommendPage.test.tsx src/pages/ItemDetailPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Run the full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ui/data-display/ItemCard apps/web/src/pages/RecommendPage.tsx apps/web/src/pages/RecommendPage.test.tsx apps/web/src/pages/ItemDetailPage.tsx apps/web/src/pages/ItemDetailPage.test.tsx
git commit -m "feat: show global install action in catalog, recommend, and detail views"
```

---

### Task 13: Rebuild do frontend + verificação final

**Files:** nenhum (apenas build/verificação)

- [ ] **Step 1: Rebuild**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run build --workspace apps/web`
Expected: build finishes with no errors.

- [ ] **Step 2: Full workspace test run (both packages)**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run test`
Expected: PASS — both `apps/server` and `apps/web` suites green.

- [ ] **Step 3: Restart the local server so it picks up the new code**

The locally running SkillVault server does not hot-reload (`run-server-hidden.vbs` uses a one-shot `npx tsx`, not watch mode). Stop it and relaunch:

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill //PID <pid-from-above> //F
```

Then, from `C:\Users\Diogo\Projetos\SkillVault`:

```bash
wscript.exe run-server-hidden.vbs
```

Wait a couple seconds, then confirm: `curl http://localhost:3001/api/health` returns `{"status":"ok"}`.

- [ ] **Step 4: Spot-check against the real catalog**

Run: `curl http://localhost:3001/api/items | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const items=JSON.parse(d);const sample=items.filter(i=>i.type!=='repo').slice(0,3);console.log(sample.map(i=>({name:i.name,type:i.type,installedGlobally:i.installedGlobally,hasRedactedSecret:i.hasRedactedSecret})));})"`

Expected: skills show `installedGlobally: true` (they were sourced from `~/.claude/skills`/`~/.agents/skills`, so they're already there), and MCPs with secrets (`stripe`, `supabase`, `nano-banana`, `magic`) show `hasRedactedSecret: true`, while `stitch` shows `hasRedactedSecret: false` and `installedGlobally: true` (it's already configured in the Quiron project's `.claude.json`... note: this checks the **global** `~/.claude.json`, not project-scoped config, so `stitch`/`nano-banana`/`magic` — which are only configured in the Quiron project today — will correctly show `installedGlobally: false` unless they also happen to exist in the global file. This is expected and correct: the feature reports **global** availability, not project-scoped).

No commit for this task.
