# Busca externa de skills, MCPs e plugins — Design

> Spec de continuidade: se esta conversa for perdida, este documento tem tudo que precisa para retomar sem reconstruir contexto.

## Motivação

O usuário quer uma nova aba no SkillVault para descobrir skills, MCPs e plugins bem avaliados/recomendados em fontes externas (principalmente GitHub, mais outras fontes reais de MCP), e poder sugerir a inclusão de um resultado no vault com um clique.

Este projeto foi desmembrado de um pedido maior que também incluía suporte a modelos/NIMs da NVIDIA como um novo tipo de item — isso ficou como um **segundo projeto separado**, a ser desenhado depois deste (decisão do usuário: primeiro busca externa, depois NVIDIA/NIM).

## Escopo

Full-stack: backend (`apps/server`) ganha módulos de busca externa + rota nova; frontend (`apps/web`) ganha uma aba "Descobrir" e um novo tipo de item `plugin`. Sem mudança de banco de dados além do que o novo tipo de item já implica (nenhuma migration necessária — `type` já é uma coluna de texto livre validada na camada de aplicação, não um enum de banco).

## 1. Novo tipo de item: `plugin`

O vault hoje só modela 3 tipos (`skill`, `repo`, `mcp`). Plugins do Claude Code são distribuídos como repositório git com `.claude-plugin/plugin.json`/`marketplace.json` — tecnicamente o mesmo processo de ingestão de um `repo` (clone do git), só que catalogado com um tipo próprio para refletir a categoria real e permitir filtrar/recomendar separadamente.

**Mudanças:**
- `ItemType` passa de `'skill' | 'repo' | 'mcp'` para `'skill' | 'repo' | 'mcp' | 'plugin'` em **ambos** `apps/server/src/types.ts` e `apps/web/src/types.ts` (mantidos sincronizados manualmente, como já é o padrão neste projeto — não há pacote de tipos compartilhado).
- Ingestão: `plugin` reaproveita o pipeline de `apps/server/src/ingestion/repo.ts` (clone do repositório) — a rota `POST /api/items` com `type: 'plugin'` e `url` chama a mesma função de clone que `type: 'repo'` já usa, só gravando `type: 'plugin'` no registro.
- Validação de tipos aceitos em `apps/server/src/routes/items.ts` passa a incluir `'plugin'`.
- `computeGlobalStatus` (`apps/server/src/global-status.ts`) trata `plugin` do mesmo jeito que `repo` já é tratado: cai no `return { installedGlobally: null, hasRedactedSecret: null }` (branch padrão, sem `if` novo). **Não implementamos detecção de "instalado globalmente" para plugins nesta v1** — não há um jeito trivial e bem documentado de descobrir quais plugins/marketplaces o Claude Code tem habilitados no momento. Fica registrado aqui como melhoria futura.
- Novo `apps/web/src/pages/forms/PluginForm.tsx`, estruturalmente idêntico a `RepoForm.tsx` (campos nome + URL, `createItem({ type: 'plugin', name, url })`), mas aceitando dois props opcionais `initialName`/`initialUrl` (ver seção 4) para o fluxo de pré-preenchimento vindo da busca externa. `RepoForm.tsx` também ganha esses mesmos dois props opcionais, pelo mesmo motivo.
- `AddPage.tsx`: novo `<option value="plugin">Plugin</option>` no `Select` de tipo, e `{type === 'plugin' && <PluginForm onCreated={handleCreated} initialName={...} initialUrl={...} />}`.
- `TypeBadge` (`apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.tsx`): nova entrada de cor/label para `plugin` (label "Plugin"), seguindo o mesmo padrão das entradas existentes de `skill`/`repo`/`mcp`.
- `SearchFilterBar.tsx`: novo `<option value="plugin">Plugin</option>` no filtro de tipo.
- `apps/server/src/recommend/`: `RecommendResult` ganha um 4º balde `plugins: RecommendedItem[]` (em `types.ts` de ambos os lados), `prompt.ts` inclui `plugins` no schema JSON e no prompt, `recommend.ts`'s `resolveList` é chamado uma 4ª vez para `'plugin'`. `RecommendPage.tsx` renderiza a nova seção "Plugins" igual às outras três.
- **Sem mudança necessária** em `export.ts`/`exportPdf.ts`/`INDEX.md` (`generate.ts`) — todos agrupam por **categoria**, não por tipo, então um item `plugin` flui pelos mesmos caminhos automaticamente.

## 2. Fontes de busca externa

Três fontes na v1. Cada uma tem sua própria noção de "avaliação" — não normalizamos numa escala única cross-fonte (seria uma comparação falsa entre métricas incomparáveis); cada fonte ordena pelo seu próprio sinal e os resultados aparecem agrupados por fonte na UI.

### GitHub (`https://api.github.com/search/repositories`)

- Autenticação opcional: sem `GITHUB_TOKEN`, limite de ~10 requisições/min (endpoint de busca do GitHub); com o token, sobe para 30/min. Header `Authorization: Bearer <token>` quando configurado.
- Critério de avaliação: `stargazers_count`, ordenado via `sort=stars&order=desc`.
- Query montada por tipo, combinando o termo de busca do usuário (se houver) com tópicos fixos:
  - `skill` → `topic:claude-skill topic:claude-skills`
  - `mcp` → `topic:mcp-server topic:model-context-protocol`
  - `plugin` → `topic:claude-code-plugin topic:claude-plugin`
  - Exemplo com busca "pdf" e tipo `mcp`: `q=pdf topic:mcp-server topic:model-context-protocol&sort=stars&order=desc`
  - Sem termo de busca (`q` vazio na rota `/api/discover`): usa só os tópicos, sem termo livre, para trazer os "destaques" por estrelas.
- Cobre os 3 tipos (`skill`, `mcp`, `plugin`).
- Campos usados da resposta: `full_name` (name), `description`, `html_url` (url), `stargazers_count` (rating.value).

### Registro oficial de MCP (`https://registry.modelcontextprotocol.io/v0.1/servers`)

- Sem autenticação.
- Sem campo de popularidade/rating na API — o sinal é binário: **está listado no registro oficial** (`verified: true` sempre, `rating: { kind: 'official', value: null }`).
- Busca por nome/palavra-chave via parâmetro de busca próprio da API (`search`); sem query, lista os mais recentes (`GET /v0.1/servers` sem parâmetro extra, primeira página).
- Cobre só o tipo `mcp`.
- Campos usados: `name`, `description`, campo de repositório do servidor (quando presente no payload) como `url`; se a versão da API não expuser URL de repositório diretamente, usar a própria página do registro (`https://registry.modelcontextprotocol.io/servers/<name>`) como `url` de fallback.

### Smithery (`https://api.smithery.ai/servers`)

- Exige `SMITHERY_API_KEY` (cadastro em smithery.ai/account/api-keys). **Opcional**: se a variável de ambiente não estiver configurada, essa fonte não é chamada e simplesmente não aparece nos resultados agregados — sem erro visível ao usuário, mesmo padrão de "fonte opcional silenciosa" já usado para o Gemini quando `GEMINI_API_KEY` não está setada.
- Header `Authorization: Bearer <SMITHERY_API_KEY>`.
- Critério de avaliação: `useCount`, `verified` como selo adicional (badge "Verificado" quando `true`).
- Parâmetro de busca: `q`. Sem termo, chama sem `q` para trazer os mais usados (a API permite "browse" sem query).
- Cobre só o tipo `mcp`.
- Campos usados: `qualifiedName` (name), `description`, campo de repositório (quando presente) ou a própria página do Smithery como `url`, `useCount` (rating.value), `verified`.

### Resumo de cobertura por tipo

| Tipo | GitHub | Registro MCP | Smithery |
|---|---|---|---|
| skill | ✅ | — | — |
| mcp | ✅ | ✅ | ✅ |
| plugin | ✅ | — | — |

## 3. Backend

### Novo diretório `apps/server/src/discover/`

```ts
export interface DiscoverResult {
  source: 'github' | 'mcp_registry' | 'smithery';
  itemType: 'skill' | 'mcp' | 'plugin';
  name: string;
  description: string | null;
  url: string;
  rating: { kind: 'stars' | 'use_count' | 'official'; value: number | null };
  verified: boolean;
}
```

- **`github.ts`** — `searchGitHub(query: string, itemType: 'skill' | 'mcp' | 'plugin', config: SkillVaultConfig, fetchImpl: typeof fetch): Promise<DiscoverResult[]>`. Monta a query conforme a tabela de tópicos acima, chama a Search API, mapeia pra `DiscoverResult[]`. Erro de rede/resposta não-2xx: captura e retorna `[]` (não propaga exceção — uma fonte fora do ar não deve derrubar as outras).
- **`mcpRegistry.ts`** — `searchMcpRegistry(query: string, fetchImpl: typeof fetch): Promise<DiscoverResult[]>`. Mesma política de erro (retorna `[]`).
- **`smithery.ts`** — `searchSmithery(query: string, config: SkillVaultConfig, fetchImpl: typeof fetch): Promise<DiscoverResult[]>`. Se `config.smitheryApiKey` for `null`, retorna `[]` imediatamente, sem chamada de rede. Mesma política de erro nas chamadas que efetivamente acontecem.
- **`aggregate.ts`** — `discoverItems(query: string, itemType: 'skill' | 'mcp' | 'plugin' | undefined, config: SkillVaultConfig, fetchImpl: typeof fetch): Promise<DiscoverResult[]>`. Decide quais fontes chamar por tipo (tabela de cobertura acima), dispara em paralelo (`Promise.all` — cada função interna já não lança, então não precisa de `allSettled`), concatena os resultados. Quando `itemType` é omitido, chama a função uma vez por tipo (`skill`, `mcp`, `plugin`) e concatena tudo.

### Rota `GET /api/discover`

`apps/server/src/routes/discover.ts`, registrada em `app.ts` junto das rotas existentes.

- Query params: `q` (opcional, string), `type` (opcional, `'skill' | 'mcp' | 'plugin'`).
- Chama `discoverItems(q ?? '', type, config, fetch)` e retorna `DiscoverResult[]` como JSON.
- Sem paginação na v1 — cada fonte já limita naturalmente (GitHub Search API pagina em 30 por página por padrão, suficiente pra uma lista de destaques/resultados de busca nesta versão).

### Configuração (`apps/server/src/config.ts`)

Dois campos novos em `SkillVaultConfig`, seguindo exatamente o padrão de `geminiApiKey`:

```ts
githubToken: string | null;      // env GITHUB_TOKEN
smitheryApiKey: string | null;   // env SMITHERY_API_KEY
```

## 4. Frontend

### Navegação

`apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`: novo item em `NAV_ITEMS`, entre "Catálogo" e "Adicionar":

```ts
{ to: '/discover', label: 'Descobrir', icon: 'compass' }
```

(usar o ícone `compass` do set já existente em `Icon.tsx`; se não existir, usar o ícone existente mais próximo semanticamente — confirmar disponibilidade na implementação).

### `DiscoverPage.tsx`

- Campo de busca (`Input`) + `Select` de tipo (`Todos` / `Skill` / `MCP` / `Plugin`), reaproveitando os componentes de UI já existentes.
- Debounce de 250ms na digitação, mesmo padrão do `useEffect` com `window.setTimeout` já usado em `CatalogPage.tsx`.
- Ao montar (sem termo digitado ainda), já dispara a busca com `q` vazio — mostra os destaques por padrão, sem exigir que o usuário digite algo primeiro.
- Chama `GET /api/discover?q=&type=` via novo `discoverItems(q, type)` em `apps/web/src/api/client.ts`.
- Resultados agrupados visualmente por `source` (títulos de seção: "GitHub", "Registro oficial de MCP", "Smithery"), cada grupo renderizando seus `DiscoverResultCard`.
- Estado vazio: mensagem quando uma busca não retorna nada de nenhuma fonte.

### `DiscoverResultCard.tsx`

Props: `{ result: DiscoverResult }`.

- Nome, descrição, badge do tipo (`skill`/`mcp`/`plugin`, reaproveitando `TypeBadge`), selo "Oficial" (quando `source === 'mcp_registry'`) ou "Verificado" (quando `verified === true` e `source === 'smithery'`).
- Rating formatado por `rating.kind`:
  - `stars` → `★ 1.2k` (formatação compacta de milhares, mesmo estilo simples usado em outros lugares do app — sem dependência nova, uma função pura local tipo `formatCompactNumber`)
  - `use_count` → `1.2k usos`
  - `official` → sem número, só o selo "Oficial" já cobre o sinal
- Botão "Adicionar ao vault".

### Fluxo de adicionar (pré-preencher + revisar, não adicionar direto)

- Clique em "Adicionar ao vault" chama `navigate(`/add?type=${result.itemType}&name=${encodeURIComponent(result.name)}&url=${encodeURIComponent(result.url)}`)`.
- `AddPage.tsx` passa a ler esses query params via `useSearchParams` (`react-router-dom`, já é dependência do projeto):
  - `type` pré-seleciona o `Select` de tipo (estado inicial de `type` lido dos params, com fallback pro padrão atual `'repo'` se ausente/inválido).
  - `name`/`url` são passados como `initialName`/`initialUrl` pro `RepoForm`/`PluginForm` (ambos ganham esses dois props opcionais — ver seção 1). Quando ausentes, os forms continuam funcionando exatamente como hoje (campos vazios).
  - `McpForm` recebe só `initialName` (não há como inferir um config JSON executável a partir dos dados de busca disponíveis nesta v1) — o campo de config continua em branco, o usuário preenche manualmente. `McpForm` ganha esse prop opcional `initialName`.
- O usuário revisa/edita os campos pré-preenchidos e confirma "Adicionar" pelo caminho já existente (`createItem` → ingestão → enriquecimento automático via Ollama/Gemini, que já roda hoje pra todo item novo).

## 5. Testes

- `discover/github.ts`, `discover/mcpRegistry.ts`, `discover/smithery.ts`: testes unitários com `fetchImpl` mockado (mesmo padrão de `ollama.test.ts`), cobrindo mapeamento pro `DiscoverResult` comum, ausência de token/chave (github funciona sem token com rate limit menor; smithery retorna `[]` sem chave, sem chamar fetch), e falha de rede/resposta não-2xx não lançando exceção.
- `discover/aggregate.ts`: uma fonte falhando não impede as outras de retornar; `itemType` filtra corretamente quais fontes são chamadas (tabela de cobertura da seção 2); `itemType` omitido consulta os 3 tipos.
- `routes/discover.ts`: teste de integração da rota, mesmo padrão de `recommend.test.ts` (app Fastify de teste, mocks de fetch).
- `DiscoverPage.test.tsx`: busca com debounce, carregamento inicial sem termo (destaques), agrupamento por fonte, estado vazio.
- `DiscoverResultCard.test.tsx`: formatação de rating por `kind`, selos condicionais, clique navega para `/add` com os query params corretos.
- `AddPage.test.tsx`: lê `type`/`name`/`url` da URL e pré-preenche o formulário certo; sem params, comportamento idêntico ao atual.
- Novo tipo `plugin`: adiciona casos nos testes já existentes que cobrem os 3 tipos hoje (`apps/server/src/routes/items.test.ts`, `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`, `apps/web/src/components/SearchFilterBar.test.tsx`, `apps/server/src/recommend/recommend.test.ts`, `apps/server/src/global-status.test.ts`) — não é escopo extra, é o novo tipo passando pelos mesmos testes que os outros três já têm.

## Fora de escopo (v1)

- Glama.ai como fonte (sem API pública confirmada — ver histórico da conversa; pode ser revisitado se uma API real for encontrada depois).
- Detecção de "instalado globalmente" para itens `plugin`.
- Cache/atualização periódica dos resultados de busca (decisão explícita: começar com busca ao vivo sem cache; revisitar só se rate limit virar problema real em uso).
- Geração automática de config JSON executável para resultados de MCP (registro oficial ou Smithery) — o usuário preenche manualmente no `McpForm` ao revisar.
- Suporte a modelos/NIMs da NVIDIA — projeto separado, a ser desenhado depois deste.
