# Disponibilidade global (skills/MCPs) + instalação com um clique — Design

> Spec de continuidade: se esta conversa for perdida, este documento tem tudo que precisa para retomar sem reconstruir contexto.

## Motivação

Depois de popular o catálogo (10 repos, 14 skills, 5 MCPs) e categorizá-lo, o usuário pediu que ficasse claro, em todos os lugares da interface, o que está "instalado/disponível" e o que não está — com uma ação para instalar/tornar disponível quando não estiver. Repos já têm esse conceito (`downloadStatus` + botão "Baixar", de um trabalho anterior). Skills e MCPs não têm nada equivalente: uma skill cadastrada por `local_path` nunca teve seu status de instalação rastreado, e um MCP cadastrado no catálogo não tem nenhuma relação com o `~/.claude.json` real do usuário — cadastrar um MCP no SkillVault não o torna utilizável em nenhum projeto.

## Escopo

Cobre `apps/server` e `apps/web`. Repos ficam de fora da parte de "instalação" (já resolvido pelo `downloadStatus`/`/download` existente) — só ganham uma melhoria visual (badge mais visível, ver seção 4).

## 1. Modelo de dados

Dois novos campos no `Item` retornado pela API (**calculados ao vivo a cada leitura, nunca persistidos no banco** — decisão do usuário, para nunca ficarem desatualizados se algo mudar fora do app):

- `installedGlobally: boolean | null`
  - `skill`: `true` se existir uma pasta com o mesmo nome de `path.basename(item.localPath)` dentro de `CLAUDE_SKILLS_DIR`.
  - `mcp`: `true` se `item.name` já for uma chave em `mcpServers` no arquivo `CLAUDE_CONFIG_PATH`.
  - `repo`: sempre `null` (usa `downloadStatus`, já existente).
- `hasRedactedSecret: boolean | null`
  - `mcp`: `true` se o JSON salvo em `item.localPath` contiver, em qualquer profundidade, o valor literal `'<REDACTED>'`.
  - `skill`/`repo`: sempre `null`.

Novos campos em `SkillVaultConfig` (`apps/server/src/config.ts`), seguindo o padrão já usado por `OLLAMA_URL`/`SKILLVAULT_HOME`:

```ts
claudeSkillsDir: string;   // env CLAUDE_SKILLS_DIR, default path.join(os.homedir(), '.claude', 'skills')
claudeConfigPath: string;  // env CLAUDE_CONFIG_PATH, default path.join(os.homedir(), '.claude.json')
```

Isso torna a feature testável sem tocar nos arquivos reais do usuário (os testes apontam essas duas variáveis para diretórios/arquivos temporários).

Novo módulo `apps/server/src/global-status.ts`:

```ts
export function isSkillInstalledGlobally(config: SkillVaultConfig, item: Item): boolean {
  const target = path.join(config.claudeSkillsDir, path.basename(item.localPath));
  return fs.existsSync(target);
}

export function isMcpInstalledGlobally(config: SkillVaultConfig, item: Item): boolean {
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

export function computeGlobalStatus(
  config: SkillVaultConfig,
  item: Item
): { installedGlobally: boolean | null; hasRedactedSecret: boolean | null } {
  if (item.type === 'skill') return { installedGlobally: isSkillInstalledGlobally(config, item), hasRedactedSecret: null };
  if (item.type === 'mcp') {
    return { installedGlobally: isMcpInstalledGlobally(config, item), hasRedactedSecret: mcpHasRedactedSecret(item) };
  }
  return { installedGlobally: null, hasRedactedSecret: null };
}
```

`GET /api/items`, `GET /api/items/:id`, e a resposta de `POST /api/items` e `POST /api/items/:id/install` (ver seção 3) passam cada item por `computeGlobalStatus` antes de responder, espalhando os dois campos no objeto retornado.

## 2. Instalação de skill

Endpoint compartilhado (repo já tem o seu próprio, `/download` — este é novo, exclusivo de skill/mcp):

`POST /api/items/:id/install`

- 404 se o item não existir.
- 409 se `item.type === 'repo'` (mensagem: `'use /download for repo items'`).
- 409 se `computeGlobalStatus(...).installedGlobally === true` (nada a fazer).
- Para `type === 'skill'`: `fs.mkdirSync(config.claudeSkillsDir, { recursive: true })`, depois `fs.cpSync(item.localPath, path.join(config.claudeSkillsDir, path.basename(item.localPath)), { recursive: true })`.
- Regenera o índice (mesmo padrão best-effort de erro dos outros endpoints).
- Retorna o item com `computeGlobalStatus` recalculado (deve vir `installedGlobally: true`).

## 3. Instalação de MCP

Mesmo endpoint, ramo `type === 'mcp'`:

- 409 adicional se `computeGlobalStatus(...).hasRedactedSecret === true` (mensagem: `'mcp config has a redacted secret; add it manually to CLAUDE_CONFIG_PATH'`) — **checado antes de qualquer leitura/escrita do `~/.claude.json`**, nunca escreve config quebrado.
- Se passar nos dois checks (não instalado, sem segredo redigido):
  1. Lê `item.localPath` (o JSON do MCP salvo no vault) e faz `JSON.parse`.
  2. Se `config.claudeConfigPath` existir: copia para `${config.claudeConfigPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}` antes de qualquer escrita. Se não existir, pula esse passo (nada para copiar).
  3. Lê e faz `JSON.parse` do `claudeConfigPath` atual (ou `{}` se o arquivo não existir). Se o parse falhar (JSON corrompido), aborta com 500 (`'failed to parse CLAUDE_CONFIG_PATH'`) **sem escrever nada, sem fazer backup** (não há necessidade — nada seria sobrescrito).
  4. `parsed.mcpServers = { ...(parsed.mcpServers ?? {}), [item.name]: mcpConfig }` — só essa chave é tocada; todo o resto do objeto (tema, `projects`, `tipsHistory`, etc.) é preservado por spread.
  5. `fs.writeFileSync(config.claudeConfigPath, JSON.stringify(parsed, null, 2), 'utf-8')`.
- Regenera o índice.
- Retorna o item com `computeGlobalStatus` recalculado.

Isso significa que, hoje, só o MCP `stitch` (sem segredo) pode ser instalado por esse botão — `stripe`, `supabase`, `nano-banana`, `magic` ficam bloqueados até o usuário completar a chave manualmente no arquivo.

## 4. Frontend

- `apps/web/src/types.ts`: `Item` ganha `installedGlobally: boolean | null` e `hasRedactedSecret: boolean | null`.
- `apps/web/src/api/client.ts`: `installItem(id: number): Promise<Item>` → `POST /api/items/${id}/install`.
- Novo componente `apps/web/src/components/ui/data-display/AvailabilityBadge/AvailabilityBadge.tsx`: pill colorida reutilizável, modelada no `TypeBadge` existente (mesmo padrão de `border-radius: var(--radius-full)`, ícone + texto). Duas variantes: `tone="positive"` (fundo/borda derivados de `var(--color-success)` via `color-mix`, como o `--color-type-*-bg` já faz) e `tone="neutral"` (reaproveita o visual do `Tag` — `var(--color-surface-hover)` + `var(--color-border)`). Props: `{ tone: 'positive' | 'neutral'; icon: IconName; children: ReactNode }`.
- `RepoDownloadAction` (existente) passa a renderizar `AvailabilityBadge` em vez do `<span>` de texto simples para os estados `local`/`downloaded` (`tone="positive"`), mantendo o botão "Baixar" para `not_downloaded` inalterado (só a apresentação dos estados "concluído" muda — nenhuma lógica de dados/API muda, então os testes existentes que fazem `getByText('Local')`/`getByText('Baixado')` continuam passando).
- Novo componente `apps/web/src/components/ui/data-display/GlobalInstallAction/GlobalInstallAction.tsx`, irmão do `RepoDownloadAction`, mesma forma de props (`{ item: Item; onUpdated?: (item: Item) => void }`):
  - `item.type === 'repo'` ou `installedGlobally === null` → não renderiza nada.
  - `installedGlobally === true` → `<AvailabilityBadge tone="positive">Instalado</AvailabilityBadge>`.
  - `hasRedactedSecret === true` → texto simples (sem botão): "Segredo redigido — instale manualmente em `~/.claude.json`".
  - Caso contrário → botão "Instalar globalmente" (mesmo padrão de loading/erro do `RepoDownloadAction`: `Button` + `StatusMessage` em caso de falha).
- `GlobalInstallAction` é renderizado nos **mesmos três lugares** que já têm `RepoDownloadAction` — `ItemCard`, `ResultColumn` (RecommendPage) e `ItemDetailPage` — lado a lado (cada item só mostra o que se aplica ao seu tipo, então nunca aparecem os dois ao mesmo tempo para o mesmo item).

## 5. Índice (`index.json`/`INDEX.md`)

`IndexEntry` ganha `installedGlobally: boolean | null` (mesmo padrão do `downloadStatus` já feito). `renderIndexMarkdown` ganha uma linha condicional análoga à de repo:

```ts
if (entry.installedGlobally === false) {
  lines.push(`  - Status: não instalado globalmente`);
}
```

## Testes

Seguindo a convenção do projeto (TDD, Vitest):

- `global-status.test.ts`: cobre os 4 casos de `isSkillInstalledGlobally`/`isMcpInstalledGlobally`/`mcpHasRedactedSecret` (existe/não existe, JSON válido/corrompido/ausente), usando `claudeSkillsDir`/`claudeConfigPath` apontando para diretórios temporários — nunca toca no `~/.claude` real do usuário durante os testes.
- Rotas: `POST /api/items/:id/install` — sucesso skill, sucesso mcp (com backup verificado), 409 já instalado, 409 segredo redigido, 409 tipo repo, 404 inexistente, 500 config corrompido (sem escrita).
- Frontend: `AvailabilityBadge.test.tsx`, `GlobalInstallAction.test.tsx` (mesmos 4 estados + clique), ajuste dos testes existentes de `ItemCard`/`RecommendPage`/`ItemDetailPage` para o novo componente somado ao já existente.
