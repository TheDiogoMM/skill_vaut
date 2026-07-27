# Sugestões externas na Recomendação + confirmação de instalação — Design

> Spec de continuidade: se esta conversa for perdida, este documento tem tudo que precisa para retomar sem reconstruir contexto.

## Motivação

Duas melhorias pedidas pelo usuário, ambas na tela de Recomendar (e uma delas reaparece em qualquer lugar que mostra o status de instalação global):

1. A recomendação hoje só sugere itens que já estão no catálogo do usuário. O usuário quer que ela também traga sugestões externas — coisas bem avaliadas no GitHub/registro de MCP/Smithery (a mesma busca já usada na aba Descobrir) — relacionadas à ideia digitada, mesmo que ainda não estejam no vault.
2. Depois de clicar em "Instalar globalmente", o usuário não conseguia confirmar se a instalação realmente aconteceu (cópia de arquivo / escrita no `.claude.json`) ou se foi só uma mudança de status na tela. A instalação já é real (verificado no código: `installSkillGlobally` copia a pasta via `fs.cpSync`, `installMcpGlobally` mescla o config no `.claude.json` com backup) — o problema é falta de confirmação visível, não um bug de "instalação falsa".

## Escopo

Full-stack. Toca: `recommend/` (prompt, parse, recommend.ts), `global-status.ts`, os dois `types.ts`, `RecommendPage.tsx`, `AvailabilityBadge.tsx`/`GlobalInstallAction.tsx`, e testes existentes que constroem objetos `Item` completos (~10 arquivos, listados na seção de testes).

## 1. Sugestões externas na Recomendação

### 1.1 O LLM também devolve um termo de busca

`recommend/prompt.ts`: o mesmo prompt que já pede a recomendação do catálogo passa a pedir também um `termo_busca` — uma frase curta (poucas palavras) que resuma a ideia, usada depois para buscar no Descobrir. Um termo curto tende a achar mais resultados nas fontes externas do que a ideia inteira (GitHub combina múltiplos termos com E lógico, registro de MCP só casa substring no nome — ambos documentados em `discover/github.ts`/`discover/mcpRegistry.ts`).

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
{"skills": [{"id": N, "motivo": "..."}], "repos": [...], "mcps": [...], "plugins": [...], "termo_busca": "algumas palavras-chave"}

Cite apenas ids que aparecem na lista acima. Se nada do catálogo servir para um tipo, retorne um array vazio para esse tipo. "termo_busca" deve ser uma frase curta (1 a 3 palavras) que resuma a ideia, útil para buscar ferramentas relacionadas em fontes externas — nunca vazia.`;
}
```

`RECOMMEND_JSON_SCHEMA` ganha `termo_busca: { type: 'string' }` na lista de `required`.

### 1.2 Parsing

`recommend/parse.ts`: `ParsedRecommendResult` ganha `termoBusca: string` (lido de `parsed.termo_busca`, validado como string não-vazia — se vazio/ausente/tipo errado, `parseRecommendJson` retorna `null` como já acontece para os outros campos obrigatórios, forçando o fallback pro Gemini ou pro erro 503 já existente).

### 1.3 Buscar e filtrar sugestões externas

Novo módulo `apps/server/src/recommend/externalSuggestions.ts`:

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

- Reaproveita `discoverItems` sem filtro de tipo — a mesma busca que a aba Descobrir faz quando não há filtro selecionado, com o mesmo custo de rede (não adiciona uma nova classe de chamada).
- Filtra por `sourceValue` (URL/caminho de origem do item já cadastrado) comparado com `result.url` — cobre o caso comum de repositório/plugin/MCP adicionado por URL.
- Ordena pela avaliação (maior primeiro; `official`/sem número fica com `0`, então tende a aparecer depois dos itens com estrelas/uso — aceitável, é o mesmo critério "mais bem avaliado" pedido).
- Corta em 5 no total, sem reservar vagas por tipo.
- **Não traduz aqui** — a tradução das descrições acontece no frontend, depois, reaproveitando o mesmo `POST /api/discover/translate` já usado pela aba Descobrir (ver seção 1.5).

### 1.4 `getRecommendations`

`recommend/recommend.ts`: depois de resolver os 4 baldes do catálogo, chama `resolveExternalSuggestions`:

```ts
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

  // ...prompt/parse como já existe...

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

`RecommendResult` (`apps/server/src/types.ts` e `apps/web/src/types.ts`) ganha `externalSuggestions: DiscoverResult[]`.

Nota: quando o catálogo está vazio (`allItems.length === 0`), retorna cedo sem chamar o LLM nem buscar externamente — mantém o comportamento atual (early return já existente), só adiciona `externalSuggestions: []` ao objeto retornado.

### 1.5 Frontend: seção "Sugestões externas"

`RecommendPage.tsx`: depois de `getRecommendations` resolver, dispara a mesma tradução em segunda leva já usada no Descobrir (`translateDiscoverResults`), atualizando só `result.externalSuggestions` quando ela chegar — mesmo padrão de guarda contra resposta atrasada (comparação de identidade do `result` antes de aplicar).

Nova seção abaixo das 4 colunas, reaproveitando `DiscoverResultCard` (já pronto: badge de tipo, selo Oficial/Verificado, avaliação formatada, botão "Adicionar ao vault"):

```tsx
{result.externalSuggestions.length > 0 && (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
    <h2 style={{ /* mesmo estilo dos <h2> de coluna */ }}>Sugestões externas</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {result.externalSuggestions.map((suggestion) => (
        <DiscoverResultCard key={`${suggestion.source}-${suggestion.url}`} result={suggestion} />
      ))}
    </div>
  </section>
)}
```

Sem agrupamento por fonte aqui (diferente do Descobrir) — só 5 itens no máximo, uma grade simples já é suficiente.

## 2. Confirmação de instalação (caminho real)

### 2.1 Calcular o caminho no backend

`global-status.ts`: `GlobalStatus` ganha `installedPath: string | null` — o caminho real onde o item está instalado, calculado sempre que `installedGlobally` for `true` (senão `null`, mesmo padrão já usado em `hasRedactedSecret`).

```ts
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

Como `installedPath` entra no mesmo `GlobalStatus` já espalhado via `{ ...item, ...computeGlobalStatus(config, item) }` (em `routes/items.ts`'s `withGlobalStatus` e em `recommend.ts`'s `resolveList`), **nenhuma rota precisa de mudança de lógica** — o campo já propaga sozinho para toda resposta que hoje inclui `installedGlobally`/`hasRedactedSecret` (listagem, detalhe, criação, download, install, recomendação). Confirma isso na implementação rodando o checklist de propagação de campo computado já usado neste projeto (grep pelos 3 lugares).

`apps/web/src/types.ts`: `Item` ganha `installedPath: string | null` (campo persistido/computado igual aos outros dois — não é opcional).

### 2.2 Mostrar no frontend

`AvailabilityBadge.tsx` ganha um prop opcional `title?: string`, repassado pro atributo nativo `title` do `<span>` (tooltip ao passar o mouse — sem mudar o visual do badge).

`GlobalInstallAction.tsx`, no branch "já instalado":

```tsx
if (item.installedGlobally) {
  return (
    <AvailabilityBadge tone="positive" icon="check-circle-2" title={item.installedPath ?? undefined}>
      Instalado
    </AvailabilityBadge>
  );
}
```

Como `item` já vem atualizado (via `onUpdated`) logo após o clique em "Instalar globalmente" bem-sucedido, o caminho aparece imediatamente ao passar o mouse no badge que troca de "Instalar globalmente" para "Instalado" — resolve a dúvida de confirmação no momento exato em que o usuário mais precisa dela, e continua disponível depois (Catálogo, Recomendar, Descobrir → Adicionar) porque é o mesmo campo computado em toda resposta.

## Testes

- `recommend/prompt.test.ts`: sem mudança necessária (não testa o schema por campo específico hoje — conferir na implementação se vale adicionar uma checagem de que o prompt menciona "termo_busca").
- `recommend/parse.test.ts`: adicionar `termo_busca` em todos os fixtures JSON existentes; casos novos — retorna `null` quando `termo_busca` está ausente/vazio/não é string.
- `recommend/externalSuggestions.test.ts` (novo): mocka `discoverItems`, testa filtro por URL já conhecida, ordenação por rating, corte em 5.
- `recommend/recommend.test.ts`: adicionar `termo_busca` aos fixtures, mockar `discoverItems` (ou `resolveExternalSuggestions` diretamente) e verificar que `externalSuggestions` vem populado; caso de catálogo vazio retorna `externalSuggestions: []` sem chamar o LLM/buscar externamente.
- `routes/recommend.test.ts`: ajustar os `toEqual`/mocks que hoje fixam `{ skills, repos, mcps, plugins }` pra incluir `externalSuggestions: []`.
- `global-status.test.ts`: casos novos para `installedPath` — `null` quando não instalado, caminho correto quando instalado (skill e mcp), `null` para repo/plugin.
- `AvailabilityBadge.test.tsx`: novo teste garantindo que o prop `title` chega no atributo do `<span>`.
- `GlobalInstallAction.test.tsx`: caso novo verificando que o badge "Instalado" tem o `title` com `item.installedPath`.
- `RecommendPage.test.tsx`: novo teste pra seção "Sugestões externas" (renderiza os cards, "Adicionar ao vault" funciona, tradução em segunda leva reaproveitando o mesmo padrão já testado no Descobrir); ajustar mocks existentes de `getRecommendations` pra incluir `externalSuggestions: []`.
- Arquivos que constroem `Item` completo e precisam ganhar `installedPath: null` no fixture (achados via grep por `hasRedactedSecret:`): `RecommendPage.test.tsx`, `RepoDownloadAction.test.tsx`, `recommend/recommend.test.ts`, `export.test.ts`, `CatalogPage.test.tsx`, `ExportButtons.test.tsx`, `global-status.test.ts`, `ItemDetailPage.test.tsx`, `ItemCard.test.tsx`, `GlobalInstallAction.test.tsx`.

## Fora de escopo

- Não recalcula/some com avaliações entre fontes diferentes (estrelas vs. uso vs. oficial) além do `?? 0` já usado — comparação simples, não uma nota unificada "de verdade".
- Não desfaz a instalação (sem botão de desinstalar) — fora do pedido original.
- Não mostra o caminho para itens `repo`/`plugin` (eles não têm conceito de "instalação global" nesta versão, decisão já tomada quando o tipo `plugin` foi criado).
