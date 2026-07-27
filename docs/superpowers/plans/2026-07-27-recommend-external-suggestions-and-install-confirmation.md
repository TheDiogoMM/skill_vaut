# Sugestões externas na Recomendação + confirmação de instalação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela de Recomendar passa a mostrar, além dos itens já cadastrados no catálogo, uma seção "Sugestões externas" com os melhores resultados do Descobrir relacionados à ideia (sem repetir o que já está no vault). Além disso, o badge "Instalado" (Catálogo, Recomendar, Descobrir → Adicionar) passa a mostrar o caminho real onde o item foi instalado, confirmando que a instalação realmente aconteceu.

**Architecture:** O mesmo prompt do LLM que já resolve a recomendação passa a devolver também um `termo_busca` curto; esse termo dispara `discoverItems` (já existente, usado pela aba Descobrir) sem filtro de tipo; os resultados são filtrados contra o catálogo atual e cortados nos 5 melhores. O caminho de instalação é calculado em `computeGlobalStatus` (já espalhado em toda resposta que inclui `installedGlobally`/`hasRedactedSecret`), então não exige mudança de rota.

**Tech Stack:** Sem dependências novas — reaproveita `discover/aggregate.ts`, `discover/translate.ts` (via `POST /api/discover/translate`) e `DiscoverResultCard` já construídos para a aba Descobrir.

---

## Grupo A — Confirmação do caminho de instalação

### Task 1: `global-status.ts` ganha `installedPath`

**Files:**
- Modify: `apps/server/src/global-status.ts`
- Modify: `apps/server/src/global-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Substitua o `describe('computeGlobalStatus', ...)` no final de `apps/server/src/global-status.test.ts` por:

```ts
describe('computeGlobalStatus', () => {
  it('returns nulls for repo items', () => {
    const item = sampleItem({ type: 'repo' });
    expect(computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item)).toEqual({
      installedGlobally: null,
      hasRedactedSecret: null,
      installedPath: null,
    });
  });

  it('returns installedGlobally=false, hasRedactedSecret=null and installedPath=null for a skill not yet installed', () => {
    const item = sampleItem({ type: 'skill', localPath: '/nonexistent-skill-path' });
    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item);
    expect(status).toEqual({ installedGlobally: false, hasRedactedSecret: null, installedPath: null });
  });

  it('returns installedPath pointing at claudeSkillsDir/<basename> for an installed skill', () => {
    const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-global-status-installpath-${Date.now()}`);
    fs.mkdirSync(path.join(claudeSkillsDir, 'my-skill'), { recursive: true });
    const item = sampleItem({ type: 'skill', localPath: '/wherever/my-skill' });

    const status = computeGlobalStatus({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item);

    expect(status.installedGlobally).toBe(true);
    expect(status.installedPath).toBe(path.join(claudeSkillsDir, 'my-skill'));

    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
  });

  it('returns installedPath equal to claudeConfigPath for an installed mcp', () => {
    const claudeConfigPath = path.join(os.tmpdir(), `skillvault-global-status-installpath-mcp-${Date.now()}.json`);
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { stripe: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });

    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item);

    expect(status.installedGlobally).toBe(true);
    expect(status.installedPath).toBe(claudeConfigPath);

    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('returns installedPath=null for an mcp not yet installed', () => {
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item);
    expect(status.installedPath).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/global-status.test.ts`
Expected: FAIL — `computeGlobalStatus` ainda não retorna `installedPath`, e os `toEqual` das duas primeiras alterações não batem mais (faltando a chave).

- [ ] **Step 3: Implement**

Substitua `apps/server/src/global-status.ts` por:

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
    return raw.includes('REDACTED');
  } catch {
    return false;
  }
}

export interface GlobalStatus {
  installedGlobally: boolean | null;
  hasRedactedSecret: boolean | null;
  installedPath: string | null;
}

export function computeGlobalStatus(config: ClaudeLocations, item: Item): GlobalStatus {
  if (item.type === 'skill') {
    const installed = isSkillInstalledGlobally(config, item);
    return {
      installedGlobally: installed,
      hasRedactedSecret: null,
      installedPath: installed ? path.join(config.claudeSkillsDir, path.basename(item.localPath)) : null,
    };
  }
  if (item.type === 'mcp') {
    const installed = isMcpInstalledGlobally(config, item);
    return {
      installedGlobally: installed,
      hasRedactedSecret: mcpHasRedactedSecret(item),
      installedPath: installed ? config.claudeConfigPath : null,
    };
  }
  return { installedGlobally: null, hasRedactedSecret: null, installedPath: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/global-status.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/global-status.ts apps/server/src/global-status.test.ts
git commit -m "feat: compute the real global-install destination path"
```

---

### Task 2: Propagação — `recommend.test.ts` (backend)

**Files:**
- Modify: `apps/server/src/recommend/recommend.test.ts`

Como `resolveList` (em `recommend.ts`) já espalha `computeGlobalStatus(config, item)` em cada item resolvido, o `installedPath` novo já propaga sozinho para as respostas de recomendação — mas os testes que comparam o objeto inteiro (`toEqual`) precisam do campo novo pra continuar batendo.

- [ ] **Step 1: Confirmar a quebra**

Run: `cd apps/server && npx vitest run src/recommend/recommend.test.ts`
Expected: FAIL — os testes `resolves ids from the Ollama response...`, `deduplicates repeated ids...` e `resolves plugin ids...` quebram porque os objetos esperados não têm `installedPath`.

- [ ] **Step 2: Corrigir**

Em `apps/server/src/recommend/recommend.test.ts`, adicione `installedPath: null` (sempre `null` nesses testes, já que nenhum item está de fato instalado) às 4 ocorrências de `hasRedactedSecret: null` dentro de literais `toEqual`:

```ts
    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, installedPath: null, motivo: 'Ajuda a extrair texto de PDFs' },
    ]);
    expect(result?.repos).toEqual([
      { ...repoItem, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Bom ponto de partida' },
    ]);
```

```ts
    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, installedPath: null, motivo: 'primeira menção' },
    ]);
```

```ts
    expect(result?.plugins).toEqual([
      { ...plugin, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Resolve isso' },
    ]);
```

E no teste `'includes computed global status fields on resolved items'`, adicione uma checagem da nova propriedade:

```ts
    expect(resolvedSkill).toHaveProperty('installedGlobally');
    expect(resolvedSkill).toHaveProperty('hasRedactedSecret');
    expect(resolvedSkill).toHaveProperty('installedPath');
    expect(resolvedSkill?.installedGlobally).toBe(false);
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/recommend.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 4: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/recommend.test.ts
git commit -m "test: propagate installedPath into recommend result assertions"
```

---

### Task 3: Propagação — `Item` (frontend) ganha `installedPath`

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`
- Modify: `apps/web/src/pages/ItemDetailPage.test.tsx`
- Modify: `apps/web/src/lib/export.test.ts`
- Modify: `apps/web/src/components/ExportButtons.test.tsx`
- Modify: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`
- Modify: `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`
- Modify: `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx`

- [ ] **Step 1: Widen the type**

Em `apps/web/src/types.ts`, no `interface Item`, adicione o campo logo depois de `hasRedactedSecret`:

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
  installedPath: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Confirmar a quebra**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL — erro de tipo em cada arquivo listado acima, cujo `sampleItem()` (ou equivalente) constrói um `Item` completo sem `installedPath`.

- [ ] **Step 3: Corrigir cada fixture**

Em cada um dos 8 arquivos de teste listados, ache a linha `hasRedactedSecret: null,` dentro da função `sampleItem()` (ou nome equivalente) e adicione `installedPath: null,` logo depois:

```ts
    hasRedactedSecret: null,
    installedPath: null,
```

Arquivos e função a editar em cada um: `RecommendPage.test.tsx` (`sampleItem`), `CatalogPage.test.tsx` (`sampleItem`), `ItemDetailPage.test.tsx` (fixture equivalente), `export.test.ts` (`sampleItem`), `ExportButtons.test.tsx` (`sampleItem`), `ItemCard.test.tsx` (fixture equivalente), `GlobalInstallAction.test.tsx` (`sampleItem`), `RepoDownloadAction.test.tsx` (fixture equivalente).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/pages/RecommendPage.test.tsx apps/web/src/pages/CatalogPage.test.tsx apps/web/src/pages/ItemDetailPage.test.tsx apps/web/src/lib/export.test.ts apps/web/src/components/ExportButtons.test.tsx apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.test.tsx
git commit -m "feat: add installedPath to the frontend Item type"
```

---

### Task 4: `AvailabilityBadge` ganha `title` opcional

**Files:**
- Modify: `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx`
- Modify: `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('AvailabilityBadge', ...)`:

```tsx
  it('forwards the title prop to the underlying span for a tooltip', () => {
    render(
      <AvailabilityBadge tone="positive" icon="check-circle-2" title="C:\Users\me\.claude\skills\my-skill">
        Instalado
      </AvailabilityBadge>
    );
    expect(screen.getByText('Instalado')).toHaveAttribute('title', 'C:\\Users\\me\\.claude\\skills\\my-skill');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx`
Expected: FAIL — o `<span>` renderizado não tem atributo `title`.

- [ ] **Step 3: Implement**

Em `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx`:

```tsx
export interface AvailabilityBadgeProps {
  tone: AvailabilityTone;
  icon: IconName;
  title?: string;
  children: ReactNode;
}
```

```tsx
export function AvailabilityBadge({ tone, icon, title, children }: AvailabilityBadgeProps) {
  const style = TONE_STYLE[tone];
  return (
    <span
      title={title}
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
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.test.tsx
git commit -m "feat: let AvailabilityBadge show a tooltip via an optional title prop"
```

---

### Task 5: `GlobalInstallAction` mostra o caminho no badge "Instalado"

**Files:**
- Modify: `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx`
- Modify: `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`

- [ ] **Step 1: Write the failing test**

Adicione ao final do `describe('GlobalInstallAction', ...)`:

```tsx
  it('shows the real install path as a tooltip on the "Instalado" badge', () => {
    render(
      <GlobalInstallAction
        item={sampleItem({ installedGlobally: true, installedPath: 'C:\\Users\\me\\.claude\\skills\\minha-skill' })}
      />
    );
    expect(screen.getByText('Instalado')).toHaveAttribute('title', 'C:\\Users\\me\\.claude\\skills\\minha-skill');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`
Expected: FAIL — o badge "Instalado" ainda não tem `title`.

- [ ] **Step 3: Implement**

Em `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx`, troque o branch "já instalado":

```tsx
  if (item.installedGlobally) {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2" title={item.installedPath ?? undefined}>
        Instalado
      </AvailabilityBadge>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas — isso fecha o Grupo A (confirmação de instalação) de ponta a ponta.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.test.tsx
git commit -m "feat: show the real install path on the Instalado badge"
```

---

## Grupo B — Sugestões externas na Recomendação

### Task 6: `recommend/prompt.ts` — pedir `termo_busca`

**Files:**
- Modify: `apps/server/src/recommend/prompt.ts`
- Modify: `apps/server/src/recommend/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Em `apps/server/src/recommend/prompt.test.ts`, adicione ao import `RECOMMEND_JSON_SCHEMA`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRecommendPrompt, RECOMMEND_JSON_SCHEMA } from './prompt.js';
```

E adicione ao final do `describe('buildRecommendPrompt', ...)`:

```ts
  it('asks for a short termo_busca in the prompt text', () => {
    const prompt = buildRecommendPrompt('ideia', []);
    expect(prompt).toContain('termo_busca');
  });

  it('includes termo_busca as a required string field in the JSON schema', () => {
    expect(RECOMMEND_JSON_SCHEMA.required).toContain('termo_busca');
    expect(RECOMMEND_JSON_SCHEMA.properties.termo_busca).toEqual({ type: 'string' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/recommend/prompt.test.ts`
Expected: FAIL — o prompt não menciona `termo_busca` e o schema não tem essa propriedade.

- [ ] **Step 3: Implement**

Substitua `apps/server/src/recommend/prompt.ts` por:

```ts
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

  return `Você é um assistente que recomenda itens de um catálogo pessoal de skills, repositórios de código, MCPs (Model Context Protocol servers) e plugins do Claude Code para uma ideia de projeto.

Ideia do usuário: "${ideia}"

Catálogo disponível (só pode recomendar itens desta lista, citando o id exato):
${catalogLines || '(catálogo vazio)'}

Responda APENAS com um JSON no formato:
{"skills": [{"id": N, "motivo": "por que esse item ajuda nessa ideia"}], "repos": [...], "mcps": [...], "plugins": [...], "termo_busca": "algumas palavras-chave"}

Cite apenas ids que aparecem na lista acima. Se nada do catálogo servir para um tipo, retorne um array vazio para esse tipo. "termo_busca" deve ser uma frase curta (1 a 3 palavras) que resuma a ideia, útil para buscar ferramentas relacionadas em fontes externas — nunca vazia.`;
}

// Passed as Ollama's `format` field (grammar-constrained decoding) so small
// local models are forced to include the required "motivo" key on every
// entry — format:"json" alone only guarantees valid JSON syntax, not that
// the model actually follows this exact shape.
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
    termo_busca: { type: 'string' },
  },
  required: ['skills', 'repos', 'mcps', 'plugins', 'termo_busca'],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/prompt.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/prompt.ts apps/server/src/recommend/prompt.test.ts
git commit -m "feat: ask the recommend LLM for a short external search term"
```

---

### Task 7: `recommend/parse.ts` — ler `termo_busca`

**Files:**
- Modify: `apps/server/src/recommend/parse.ts`
- Modify: `apps/server/src/recommend/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Substitua `apps/server/src/recommend/parse.test.ts` por:

```ts
import { describe, it, expect } from 'vitest';
import { parseRecommendJson } from './parse.js';

describe('parseRecommendJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está:\n{"skills":[{"id":1,"motivo":"Serve para X"}],"repos":[],"mcps":[{"id":5,"motivo":"Y"}],"plugins":[],"termo_busca":"pdf"}\nFim.`;
    expect(parseRecommendJson(raw)).toEqual({
      skills: [{ id: 1, motivo: 'Serve para X' }],
      repos: [],
      mcps: [{ id: 5, motivo: 'Y' }],
      plugins: [],
      termoBusca: 'pdf',
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseRecommendJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a list entry is missing motivo', () => {
    expect(parseRecommendJson('{"skills":[{"id":1}],"repos":[],"mcps":[],"plugins":[],"termo_busca":"pdf"}')).toBeNull();
  });

  it('returns null when a required array is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"plugins":[],"termo_busca":"pdf"}')).toBeNull();
  });

  it('returns null when plugins is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"mcps":[],"termo_busca":"pdf"}')).toBeNull();
  });

  it('returns null when id is not a number', () => {
    expect(
      parseRecommendJson('{"skills":[{"id":"1","motivo":"x"}],"repos":[],"mcps":[],"plugins":[],"termo_busca":"pdf"}')
    ).toBeNull();
  });

  it('returns null when termo_busca is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"mcps":[],"plugins":[]}')).toBeNull();
  });

  it('returns null when termo_busca is an empty string', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"mcps":[],"plugins":[],"termo_busca":""}')).toBeNull();
  });

  it('returns null when termo_busca is not a string', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[],"mcps":[],"plugins":[],"termo_busca":123}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/recommend/parse.test.ts`
Expected: FAIL — `parseRecommendJson` ainda não valida/retorna `termoBusca`.

- [ ] **Step 3: Implement**

Substitua `apps/server/src/recommend/parse.ts` por:

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
  termoBusca: string;
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
    const termoBusca = parsed.termo_busca;
    if (!skills || !repos || !mcps || !plugins) return null;
    if (typeof termoBusca !== 'string' || termoBusca.trim() === '') return null;
    return { skills, repos, mcps, plugins, termoBusca };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/parse.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/parse.ts apps/server/src/recommend/parse.test.ts
git commit -m "feat: parse and validate termo_busca from the recommend LLM response"
```

---

### Task 8: `recommend/externalSuggestions.ts` — buscar e filtrar

**Files:**
- Create: `apps/server/src/recommend/externalSuggestions.ts`
- Test: `apps/server/src/recommend/externalSuggestions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/recommend/externalSuggestions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../config.js';
import type { Item } from '../types.js';
import type { DiscoverResult } from '../discover/types.js';

vi.mock('../discover/aggregate.js', () => ({ discoverItems: vi.fn() }));

import { discoverItems } from '../discover/aggregate.js';
import { resolveExternalSuggestions } from './externalSuggestions.js';

function fakeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Existing',
    sourceType: 'url',
    sourceValue: 'https://github.com/existing/repo',
    localPath: '/skillvault/repos/existing',
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

function fakeResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/repo',
    description: null,
    url: 'https://github.com/someone/repo',
    rating: { kind: 'stars', value: 10 },
    verified: false,
    ...overrides,
  };
}

describe('resolveExternalSuggestions', () => {
  it('filters out results whose url matches an existing item sourceValue', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://github.com/existing/repo' }),
      fakeResult({ url: 'https://github.com/new/repo' }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [fakeItem()], config, fetch);

    expect(result).toEqual([fakeResult({ url: 'https://github.com/new/repo' })]);
  });

  it('sorts results by rating value descending', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://a', rating: { kind: 'stars', value: 5 } }),
      fakeResult({ url: 'https://b', rating: { kind: 'stars', value: 50 } }),
      fakeResult({ url: 'https://c', rating: { kind: 'use_count', value: 20 } }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result.map((r) => r.url)).toEqual(['https://b', 'https://c', 'https://a']);
  });

  it('treats a null rating value as lowest when sorting', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([
      fakeResult({ url: 'https://official', rating: { kind: 'official', value: null } }),
      fakeResult({ url: 'https://stars', rating: { kind: 'stars', value: 1 } }),
    ]);

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result.map((r) => r.url)).toEqual(['https://stars', 'https://official']);
  });

  it('caps the result at 5 items', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        fakeResult({ url: `https://item-${i}`, rating: { kind: 'stars', value: i } })
      )
    );

    const result = await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(result).toHaveLength(5);
  });

  it('calls discoverItems with no type filter, searching across skill/mcp/plugin', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    vi.mocked(discoverItems).mockResolvedValue([]);

    await resolveExternalSuggestions('pdf', [], config, fetch);

    expect(discoverItems).toHaveBeenCalledWith('pdf', undefined, config, fetch);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/recommend/externalSuggestions.test.ts`
Expected: FAIL — `./externalSuggestions.js` não existe.

- [ ] **Step 3: Implement**

Create `apps/server/src/recommend/externalSuggestions.ts`:

```ts
import type { SkillVaultConfig } from '../config.js';
import type { Item } from '../types.js';
import { discoverItems } from '../discover/aggregate.js';
import type { DiscoverResult } from '../discover/types.js';

const MAX_SUGGESTIONS = 5;

export async function resolveExternalSuggestions(
  termoBusca: string,
  existingItems: Item[],
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const known = new Set(existingItems.map((item) => item.sourceValue));
  const results = await discoverItems(termoBusca, undefined, config, fetchImpl);
  return results
    .filter((result) => !known.has(result.url))
    .sort((a, b) => (b.rating.value ?? 0) - (a.rating.value ?? 0))
    .slice(0, MAX_SUGGESTIONS);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/externalSuggestions.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/recommend/externalSuggestions.ts apps/server/src/recommend/externalSuggestions.test.ts
git commit -m "feat: resolve top-rated external suggestions for a recommend search"
```

---

### Task 9: `recommend.ts` — ligar tudo

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/recommend/recommend.ts`
- Modify: `apps/server/src/recommend/recommend.test.ts`

- [ ] **Step 1: Write the failing tests**

Substitua `apps/server/src/recommend/recommend.test.ts` por:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { loadConfig } from '../config.js';
import { ItemsRepository, type NewItem } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { getRecommendations } from './recommend.js';
import type { RecommendedItem } from '../types.js';
import type { GlobalStatus } from '../global-status.js';
import type { DiscoverResult } from '../discover/types.js';

vi.mock('../discover/aggregate.js', () => ({ discoverItems: vi.fn() }));

import { discoverItems } from '../discover/aggregate.js';

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
    downloadStatus: null,
    ...overrides,
  };
}

function fakeDiscoverResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/pdf-tool',
    description: null,
    url: 'https://github.com/someone/pdf-tool',
    rating: { kind: 'stars', value: 10 },
    verified: false,
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
    vi.mocked(discoverItems).mockResolvedValue([]);
  });

  it('returns empty blocks without calling the LLM when the catalog is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toEqual({ skills: [], repos: [], mcps: [], plugins: [], externalSuggestions: [] });
    expect(discoverItems).not.toHaveBeenCalled();
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
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      {
        ...skill,
        installedGlobally: false,
        hasRedactedSecret: null,
        installedPath: null,
        motivo: 'Ajuda a extrair texto de PDFs',
      },
    ]);
    expect(result?.repos).toEqual([
      { ...repoItem, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Bom ponto de partida' },
    ]);
    expect(result?.mcps).toEqual([]);
  });

  it('deduplicates repeated ids cited by the LLM within the same block', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [
        { id: skill.id, motivo: 'primeira menção' },
        { id: skill.id, motivo: 'segunda menção, deveria ser descartada' },
      ],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, installedPath: null, motivo: 'primeira menção' },
    ]);
  });

  it('includes computed global status fields on resolved items', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    const resolvedSkill = result?.skills[0] as (RecommendedItem & GlobalStatus) | undefined;

    expect(resolvedSkill).toHaveProperty('installedGlobally');
    expect(resolvedSkill).toHaveProperty('hasRedactedSecret');
    expect(resolvedSkill).toHaveProperty('installedPath');
    expect(resolvedSkill?.installedGlobally).toBe(false);
  });

  it('falls back to Gemini when Ollama fails', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'via gemini' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
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

  it('returns null when termo_busca is missing from the LLM response', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({ skills: [{ id: skill.id, motivo: 'x' }], repos: [], mcps: [], plugins: [] });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves plugin ids into full items, same as the other three buckets', async () => {
    const plugin = itemsRepo.create(baseNewItem({ type: 'plugin', name: 'My Plugin' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [{ id: plugin.id, motivo: 'Resolve isso' }],
      termo_busca: 'plugin',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);

    expect(result?.plugins).toEqual([
      { ...plugin, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Resolve isso' },
    ]);
  });

  it('populates externalSuggestions from discoverItems, using the LLM-provided termo_busca', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'leitor de pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;
    vi.mocked(discoverItems).mockResolvedValue([fakeDiscoverResult()]);

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(discoverItems).toHaveBeenCalledWith('leitor de pdf', undefined, config, fetchImpl);
    expect(result?.externalSuggestions).toEqual([fakeDiscoverResult()]);
  });

  it('excludes an external suggestion whose url matches an item already in the catalog', async () => {
    const skill = itemsRepo.create(baseNewItem({ sourceValue: 'https://github.com/someone/pdf-tool' }));
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;
    vi.mocked(discoverItems).mockResolvedValue([fakeDiscoverResult({ url: 'https://github.com/someone/pdf-tool' })]);

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.externalSuggestions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/recommend/recommend.test.ts`
Expected: FAIL — `RecommendResult` ainda não tem `externalSuggestions`, `getRecommendations` não chama `discoverItems`.

- [ ] **Step 3: Implement**

Em `apps/server/src/types.ts`, importe `DiscoverResult` e amplie `RecommendResult`:

```ts
import type { DiscoverResult } from './discover/types.js';
```

```ts
export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
  plugins: RecommendedItem[];
  externalSuggestions: DiscoverResult[];
}
```

Substitua `apps/server/src/recommend/recommend.ts` por:

```ts
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import type { Item, RecommendedItem, RecommendResult } from '../types.js';
import { callOllama } from '../enrichment/ollama.js';
import { callGemini } from '../enrichment/gemini.js';
import { buildRecommendPrompt, RECOMMEND_JSON_SCHEMA, type CatalogItemForPrompt } from './prompt.js';
import { parseRecommendJson, type ParsedRecommendation } from './parse.js';
import { computeGlobalStatus } from '../global-status.js';
import { resolveExternalSuggestions } from './externalSuggestions.js';

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
  itemsRepo: ItemsRepository,
  config: SkillVaultConfig
): RecommendedItem[] {
  const resolved: RecommendedItem[] = [];
  const seenIds = new Set<number>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) continue;
    const item = itemsRepo.getById(entry.id);
    if (!item || item.type !== expectedType) continue;
    seenIds.add(entry.id);
    resolved.push({ ...item, ...computeGlobalStatus(config, item), motivo: entry.motivo });
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
    return { skills: [], repos: [], mcps: [], plugins: [], externalSuggestions: [] };
  }

  const categoryNameById = new Map(categoriesRepo.list().map((c) => [c.id, c.name]));
  const catalog = allItems.map((item) => toCatalogEntry(item, categoryNameById));
  const prompt = buildRecommendPrompt(ideia, catalog);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl, RECOMMEND_JSON_SCHEMA);
  let parsed = ollamaRaw ? parseRecommendJson(ollamaRaw) : null;

  if (!parsed) {
    const geminiRaw = await callGemini(config, prompt, fetchImpl);
    parsed = geminiRaw ? parseRecommendJson(geminiRaw) : null;
  }

  if (!parsed) return null;

  const externalSuggestions = await resolveExternalSuggestions(parsed.termoBusca, allItems, config, fetchImpl);

  return {
    skills: resolveList(parsed.skills, 'skill', itemsRepo, config),
    repos: resolveList(parsed.repos, 'repo', itemsRepo, config),
    mcps: resolveList(parsed.mcps, 'mcp', itemsRepo, config),
    plugins: resolveList(parsed.plugins, 'plugin', itemsRepo, config),
    externalSuggestions,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/recommend/`
Expected: PASS (todos os arquivos do diretório).

- [ ] **Step 5: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/recommend/recommend.ts apps/server/src/recommend/recommend.test.ts
git commit -m "feat: wire external suggestions into getRecommendations"
```

---

### Task 10: `routes/recommend.test.ts` — propagação

**Files:**
- Modify: `apps/server/src/routes/recommend.test.ts`

- [ ] **Step 1: Confirmar a quebra**

Run: `cd apps/server && npx vitest run src/routes/recommend.test.ts`
Expected: FAIL — os mocks/asserts de `{ skills: [], repos: [], mcps: [], plugins: [] }` não incluem `externalSuggestions`.

- [ ] **Step 2: Corrigir**

Nas 3 ocorrências de `{ skills: [], repos: [], mcps: [], plugins: [] }` neste arquivo (2 em `mockResolvedValue`, 1 em `toEqual`), adicione `externalSuggestions: []`:

```ts
{ skills: [], repos: [], mcps: [], plugins: [], externalSuggestions: [] }
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/routes/recommend.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 4: Run full backend suite**

Run: `cd apps/server && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas — isso fecha todo o backend do Grupo B.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/recommend.test.ts
git commit -m "test: propagate externalSuggestions into recommend route assertions"
```

---

### Task 11: Frontend — tipo, seção "Sugestões externas" e tradução em segunda leva

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/pages/RecommendPage.tsx`
- Modify: `apps/web/src/pages/RecommendPage.test.tsx`

- [ ] **Step 1: Widen `RecommendResult` (web)**

Em `apps/web/src/types.ts`:

```ts
export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
  plugins: RecommendedItem[];
  externalSuggestions: DiscoverResult[];
}
```

(`DiscoverResult` já está definido mais abaixo no mesmo arquivo — mova a definição de `RecommendResult` para depois de `DiscoverResult`, ou apenas garanta que `DiscoverResult` já foi declarado antes de ser referenciado; TypeScript não exige ordem para `interface`, então isso funciona independente da posição.)

- [ ] **Step 2: Write the failing tests**

Em `apps/web/src/pages/RecommendPage.test.tsx`:

1. Adicione `externalSuggestions: []` a **todas** as 6 ocorrências de `getRecommendations`.mockResolvedValue com o shape `{ skills: ..., repos: ..., mcps: ..., plugins: ... }` já existentes no arquivo.
2. Adicione `import type { DiscoverResult, Item } from '../types.js';` (troque a linha de import de tipos existente).
3. Adicione os 3 testes novos ao final do `describe('RecommendPage', ...)`:

```tsx
  it('renders the "Sugestões externas" section with a card per result', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [
        {
          source: 'github',
          itemType: 'mcp',
          name: 'someone/pdf-tool',
          description: 'Handles PDFs',
          url: 'https://github.com/someone/pdf-tool',
          rating: { kind: 'stars', value: 42 },
          verified: false,
        },
      ],
    });
    vi.spyOn(api, 'translateDiscoverResults').mockImplementation((results) => Promise.resolve(results));

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('heading', { name: 'Sugestões externas' })).toBeInTheDocument();
    expect(screen.getByText('someone/pdf-tool')).toBeInTheDocument();
  });

  it('does not render the "Sugestões externas" section when there are none', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem(), motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    await screen.findByRole('link', { name: 'PDF Parser' });
    expect(screen.queryByRole('heading', { name: 'Sugestões externas' })).not.toBeInTheDocument();
  });

  it('translates external suggestion descriptions in a second pass after the recommendation loads', async () => {
    const user = userEvent.setup();
    const original: DiscoverResult = {
      source: 'github',
      itemType: 'mcp',
      name: 'someone/pdf-tool',
      description: 'Handles PDFs',
      url: 'https://github.com/someone/pdf-tool',
      rating: { kind: 'stars', value: 42 },
      verified: false,
    };
    const translated: DiscoverResult = { ...original, description: 'Lida com PDFs' };
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [original],
    });
    let resolveTranslate!: (value: DiscoverResult[]) => void;
    vi.spyOn(api, 'translateDiscoverResults').mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve;
      })
    );

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByText('Handles PDFs')).toBeInTheDocument();

    resolveTranslate([translated]);

    expect(await screen.findByText('Lida com PDFs')).toBeInTheDocument();
    expect(screen.queryByText('Handles PDFs')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: FAIL — sem a seção "Sugestões externas" e sem a tradução em segunda leva.

- [ ] **Step 4: Implement**

Em `apps/web/src/pages/RecommendPage.tsx`, ajuste os imports:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations, listConsultas, translateDiscoverResults } from '../api/client.js';
import type { Consulta, Item, RecommendedItem, RecommendResult } from '../types.js';
import { Textarea } from '../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';
import { GlobalInstallAction } from '../components/ui/data-display/GlobalInstallAction/GlobalInstallAction.js';
import { DiscoverResultCard } from '../components/DiscoverResultCard.js';
```

Troque `handleSubmit`:

```tsx
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    setError('');
    setResult(null);
    try {
      const data = await getRecommendations(ideia);
      setResult(data);
      setStatus('idle');
      if (data.externalSuggestions.length > 0) {
        translateDiscoverResults(data.externalSuggestions)
          .then((translated) => {
            setResult((prev) => (prev === data ? { ...prev, externalSuggestions: translated } : prev));
          })
          .catch(() => {});
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }
```

(A comparação `prev === data` funciona como guarda contra resposta atrasada: se uma segunda submissão já trocou `result` por um objeto novo antes da tradução da primeira chegar, `prev` não será mais o mesmo `data` daquela primeira chamada, e a atualização é descartada — mesmo princípio já usado no `DiscoverPage.tsx`, só que comparando identidade do objeto em vez de uma flag `cancelled`, já que aqui a busca não é disparada por efeito/debounce e sim por clique explícito.)

Troque o bloco `{result && (...)}` pra incluir a seção nova fora da `<div>` de colunas:

```tsx
      {result && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
            <ResultColumn
              title="Skills"
              items={result.skills}
              emptyMessage={EMPTY_MESSAGES.skills}
              onItemUpdated={handleItemUpdated}
            />
            <ResultColumn
              title="Repos"
              items={result.repos}
              emptyMessage={EMPTY_MESSAGES.repos}
              onItemUpdated={handleItemUpdated}
            />
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
          </div>

          {result.externalSuggestions.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-title)',
                  fontWeight: 'var(--fw-title)',
                  color: 'var(--color-text)',
                }}
              >
                Sugestões externas
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {result.externalSuggestions.map((suggestion) => (
                  <DiscoverResultCard key={`${suggestion.source}-${suggestion.url}`} result={suggestion} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/pages/RecommendPage.test.tsx`
Expected: PASS (todos os testes, incluindo os 3 novos).

- [ ] **Step 6: Run full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero erros, zero falhas.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/pages/RecommendPage.tsx apps/web/src/pages/RecommendPage.test.tsx
git commit -m "feat: show external suggestions on the recommend page, translated in a second pass"
```

---

### Task 12: Rebuild + verificação final

**Files:** nenhum (apenas build/verificação)

- [ ] **Step 1: Rebuild**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run build --workspace apps/web`
Expected: build finishes with no errors.

- [ ] **Step 2: Full workspace test run**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run test`
Expected: PASS — `apps/server` e `apps/web` verdes.

- [ ] **Step 3: Manual smoke test in the browser**

Reiniciar o servidor (não faz hot-reload):

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill //PID <pid-acima> //F
wscript.exe run-server-hidden.vbs
```

Abrir `http://localhost:3001`:
1. Ir em Recomendar, digitar uma ideia relacionada a algo que existe fora do catálogo (ex: "ferramentas para trabalhar com PDF") e enviar.
2. Confirmar que as 4 colunas continuam funcionando como antes.
3. Confirmar que aparece "Sugestões externas" abaixo, com itens vindos do GitHub/registro de MCP/Smithery, nenhum repetindo o que já está no catálogo.
4. Confirmar que as descrições aparecem em inglês primeiro e trocam para português alguns segundos depois (mesmo comportamento já visto na aba Descobrir).
5. Clicar em "Adicionar ao vault" numa sugestão externa e confirmar que abre `/add` pré-preenchido.
6. Ir num item `skill` ou `mcp` não instalado (Catálogo ou Recomendar) e clicar em "Instalar globalmente". Depois de instalar, passar o mouse no badge "Instalado" e confirmar que aparece o caminho real (pasta em `.claude/skills/` ou o `.claude.json`).

No commit for this task.
