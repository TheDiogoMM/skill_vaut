# Ingestão preguiçosa de repositórios + redação de segredos em MCP — Design

> Spec de continuidade: se esta conversa for perdida, este documento tem tudo que precisa para retomar sem reconstruir contexto.

## Motivação

O pedido original era "rastreie no computador tudo (repositório, skill ou MCP) e alimente a biblioteca". Ao investigar o que existe na máquina do usuário, dois problemas de design surgiram:

1. **Repos**: a ingestão de `type=repo` sempre faz `git clone`. Os ~10 repositórios candidatos são projetos **próprios** e ativos do usuário (Sketchain, Gifittome, GuideLife, Quiron, DeltaBrain, co-writer, Stack Learning, LeadChain, SocIA Selling, Relax Place), todos já presentes localmente sob `C:\Users\Diogo\Projetos\`. Cloná-los de novo para dentro de `~/skillvault/repos/` duplicaria uma quantidade substancial de dados em disco sem necessidade. O usuário pediu explicitamente: registrar o repositório, capturar suas informações, mas **não baixar** — deixando tudo pronto para clonar/baixar/instalar sob demanda, quando necessário. Isso vale tanto para repos próprios (já locais) quanto, de forma geral, para repos adicionados por URL daqui pra frente.
2. **MCPs**: os configs de `stripe` e `supabase` capturados de `~/.claude.json` contêm chave secreta e bearer token em texto puro. Persistir isso tal qual dentro do catálogo (`~/skillvault/mcps/*.json`) espalha segredos para mais um lugar em disco sem necessidade.

## Escopo

Este spec cobre apenas o backend/frontend do SkillVault (`apps/server`, `apps/web`). Não cobre a skill ingestion (que já é barata — cópia local ou clone pequeno) nem muda o fluxo de MCP além da redação de segredos.

## 1. Modelo de dados

Novo campo em `items`: `download_status TEXT CHECK (download_status IN ('local','not_downloaded','downloaded'))`, nullable.

- `'local'` — o `local_path` aponta para um diretório que já existe no disco do usuário (repo próprio); o vault nunca clona nem gerencia essa cópia, só referencia.
- `'not_downloaded'` — repo cadastrado por URL; ainda não existe cópia em `~/skillvault/repos/`; `local_path` guarda o destino **futuro** (calculado, mas a pasta não existe ainda).
- `'downloaded'` — era `not_downloaded`; o usuário pediu para clonar via `POST /api/items/:id/download`; agora existe de fato em `~/skillvault/repos/`.
- `null` — não se aplica (todo item `type='skill'` ou `type='mcp'`).

`Item.downloadStatus: 'local' | 'not_downloaded' | 'downloaded' | null` no `types.ts` do server e do client (mantidos sincronizados manualmente, como já é convenção do projeto).

## 2. Ingestão de repositório

`POST /api/items` com `type=repo` passa a aceitar um novo campo `source_type`:

### `source_type=local_path`

- Corpo: `{ type: 'repo', name, source_type: 'local_path', path }`.
- Valida que `path` existe e é um diretório (`fs.statSync`), senão 422.
- Lê o README direto de `path` (sem cópia, sem git) usando `readFirstExisting` (já existe, reaproveitado de `content.ts`).
- Tenta capturar o remote git: `simpleGit(path).remote(['get-url', 'origin'])`. Se existir, `sourceValue = <url do remote>`. Se não existir (repo sem remote configurado), `sourceValue = path` e o item fica sem URL de origem para reclonar depois — aceitável, é o caso de projetos puramente locais.
- `sourceType = 'local_path'`, `localPath = path` (o path original, nunca copiado), `downloadStatus = 'local'`.
- Enriquecimento roda normalmente sobre o conteúdo do README lido.

### `source_type=url` (default — mesma assinatura de hoje, comportamento novo)

- Corpo: `{ type: 'repo', name, url }` (sem `source_type` explícito continua indo por este caminho, para não quebrar o formulário existente).
- Clone raso e temporário: `simpleGit().clone(url, tmpDir, ['--depth', '1'])`, onde `tmpDir` é criado em `os.tmpdir()` com prefixo `skillvault-repo-probe-`.
- Lê o README do `tmpDir`, roda o enriquecimento.
- Remove `tmpDir` (`fs.rmSync(tmpDir, { recursive: true, force: true })`) em `finally`, mesmo se o enriquecimento falhar.
- `localPath` = destino calculado via `resolveUniqueDir(config.reposDir, name)` — mesma lógica de nomeação de hoje — **mas a pasta não é criada agora**.
- `sourceType = 'url'`, `sourceValue = url`, `downloadStatus = 'not_downloaded'`.

### Novo endpoint: `POST /api/items/:id/download`

- Só válido para itens `type='repo'` com `downloadStatus='not_downloaded'`. Fora isso, `409 { error: 'item is not pending download' }`.
- Faz `simpleGit().clone(item.sourceValue, item.localPath)` (clone completo desta vez, para uso real).
- Atualiza `downloadStatus = 'downloaded'`, `updatedAt`.
- Regenera o índice (`index.json`/`INDEX.md`) como as outras mutações.
- Retorna o item atualizado.

### Efeitos colaterais em código existente

- `DELETE /api/items/:id` já usa `fs.existsSync(item.localPath)` antes de remover — continua funcionando sem alteração para itens `not_downloaded` (a pasta não existe, então só apaga o registro do banco).
- `assertSafeRepoUrl` continua sendo chamado tanto no probe temporário quanto no download real.

## 3. Redação de segredos em MCP

Em `ingestMcp`, antes de serializar `input.config` para disco e para o prompt de enriquecimento, uma função `redactSecrets(config: Record<string, unknown>): Record<string, unknown>` percorre o objeto recursivamente (incluindo objetos aninhados como `env` e `headers`) e substitui o valor de qualquer chave cujo nome (case-insensitive) contenha `key`, `token`, `secret`, `password`, `authorization` ou `bearer` por `"<REDACTED>"`. Arrays são percorridos elemento a elemento; valores primitivos não tocados a menos que a própria chave-pai bata no filtro.

Isso é aplicado a **todo MCP cadastrado dali para frente**, não é uma flag opcional. O valor original nunca é persistido em `~/skillvault/mcps/*.json` nem enviado ao LLM de enriquecimento.

## 4. Frontend

- `apps/web/src/api/client.ts`: nova função `downloadItem(id: number): Promise<Item>` chamando `POST /api/items/:id/download`.
- `apps/web/src/types.ts`: adicionar `downloadStatus` ao tipo `Item`, espelhando o server.
- Novo componente `apps/web/src/components/ui/data-display/RepoDownloadAction/RepoDownloadAction.tsx`:
  - Props: `{ item: Item; onUpdated?: (item: Item) => void }`.
  - Não renderiza nada se `item.type !== 'repo'` ou `downloadStatus == null`.
  - `downloadStatus === 'not_downloaded'`: botão "Baixar" (usa `Button` existente, variante secundária/pequena); ao clicar, chama `downloadItem`, estado de loading local, em caso de sucesso chama `onUpdated?.(item)` e mostra o novo status; erro usa `StatusMessage`.
  - `downloadStatus === 'local'`: texto pequeno "Local" (mesmo estilo de `Tag`/texto terciário já usado nos cards).
  - `downloadStatus === 'downloaded'`: texto pequeno "Baixado".
- Usado em **três lugares**, todos onde `item.localPath` já é exibido hoje:
  1. `ItemCard` (catálogo) — abaixo do `<code>` do `localPath`.
  2. `ResultColumn` do `RecommendPage` (resultados de recomendação) — mesmo padrão.
  3. `ItemDetailPage` (detalhe do item) — ao lado do botão "copiar caminho" existente.
- Em todos os três, ao `onUpdated`, o item é substituído no estado local da página (sem necessidade de refetch completo da lista).

## 5. População inicial do catálogo (execução, não código)

Depois do app ajustado, os seguintes itens são cadastrados via API:

**Repos** (`source_type=local_path`, `download_status` resultante `'local'`):
Sketchain, Gifittome, GuideLife, Quiron, DeltaBrain, co-writer, Stack Learning, LeadChain, SocIA Selling, Relax Place — os 10 diretórios sob `C:\Users\Diogo\Projetos\` que têm `.git` com remote configurado.

Ficam de fora (sem `.git`): Mentor, TypeScriptEstudos, Távola, Estudos, bolao copa, Nova pasta — decisão explícita do usuário.

**Skills** (uma entrada por plugin + avulsas, todas `source_type=local_path`):
- `get-shit-done` (plugin, ~60 subcomandos agrupados em um item)
- `superpowers` (plugin)
- `firecrawl` (família de skills relacionadas ao Firecrawl)
- `frontend-design`
- `napkin`
- `playwright-cli`
- `image-prompt`
- `interface-design`
- `skill-creator`
- `docx`, `pdf`, `pptx`, `xlsx`, `find-skills` (utilitários avulsos de `~/.agents/skills`)

**MCPs** (config redigido automaticamente pela nova lógica):
- `stripe`, `supabase` (globais, de `~/.claude.json`)
- `stitch`, `nano-banana`, `magic` (configurados no projeto Quiron)

## Testes

Seguindo a convenção do projeto (TDD, Vitest nos dois workspaces):

- `ingestion/repo.test.ts`: cobre `source_type=local_path` (com e sem remote git), `source_type=url` com probe temporário (mock de `simpleGit`), limpeza do diretório temporário mesmo em erro de enriquecimento.
- Novo teste para o handler `POST /api/items/:id/download`: sucesso (not_downloaded → downloaded, clone chamado com args corretos), 409 quando já `local`/`downloaded`, 404 quando item não existe.
- `ingestion/mcp.test.ts`: novo teste para `redactSecrets` — chaves sensíveis em nível raiz, aninhadas (`env`, `headers`), case-insensitive, não mexe em chaves não sensíveis.
- Frontend: novo `RepoDownloadAction.test.tsx` cobrindo os 3 estados e o clique de download; ajuste dos testes existentes de `ItemCard`, `RecommendPage` e `ItemDetailPage` para os novos elementos.
