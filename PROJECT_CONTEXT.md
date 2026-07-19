# SkillVault — Contexto do Projeto

> Documento de continuidade: se esta conversa com o Claude Code for perdida ou você abrir uma sessão nova, este arquivo tem tudo que precisa saber para retomar o trabalho sem reconstruir o contexto do zero.

## Objetivo original

SkillVault é uma **biblioteca pessoal de skills, repositórios de código e MCPs**, com PWA responsivo, para uso individual (single-user, rodando localmente).

Pedido original do usuário (resumo fiel do prompt inicial):

Centralizar skills (SKILL.md + assets), repositórios de código (URLs git) e MCPs (config JSON/comando de instalação) recebidos pelo usuário, **entender automaticamente sua utilidade** (via LLM), armazená-los/cloná-los localmente, categorizá-los, e expor tudo em uma **interface navegável**. O app também deve **recomendar**, a partir de uma ideia de projeto em linguagem natural, quais skills/repos/MCPs do catálogo são mais relevantes. O catálogo resultante deve ficar disponível para o **Claude Code consumir via arquivo de índice** (`index.json`/`INDEX.md`).

### Funcionalidades pedidas originalmente
1. **Ingestão**: colar URL de repo git, upload/colar pasta de skill, ou cadastrar MCP (nome + URL/comando/config JSON) — seletor de tipo define o fluxo.
2. **Compreensão automática**: ao adicionar um item, gerar via LLM `{resumo, utilidade, categoria, tags}` a partir do README/SKILL.md/config.
3. **Armazenamento**: repos clonados em `~/skillvault/repos/`, skills copiadas em `~/skillvault/skills/`, MCPs salvos como JSON em `~/skillvault/mcps/`. Metadados em SQLite.
4. **Categorização**: categorias editáveis (renomear, mesclar, criar).
5. **Interface**: catálogo agrupado por categoria, busca/filtro (nome, categoria, tipo, tag), detalhe do item, tema dark (padrão) com toggle.
6. **Recomendador**: campo de texto livre com ideia de projeto → LLM cruza com o catálogo cadastrado → retorna skills/repos/MCPs recomendados (nunca inventa itens que não existem no catálogo).
7. **Integração com Claude Code**: `~/skillvault/index.json` + `INDEX.md` regenerados automaticamente a cada mudança no catálogo.
8. **PWA**: instalável, funciona offline para visualização do catálogo já carregado, responsivo.

## Decisões de stack (fechadas durante o brainstorming)

- **Linguagem**: TypeScript em todo o projeto.
- **Backend**: Fastify + better-sqlite3 (SQLite), `simple-git` para clone, `adm-zip` para upload de skill em zip, `@fastify/multipart` para upload.
- **Frontend**: React + Vite + TypeScript, `react-router-dom`, `react-markdown` (renderização segura de README/SKILL.md — sem `rehype-raw`, sem `dangerouslySetInnerHTML`), tema via CSS custom properties, **dark mode padrão**, **layout desktop-first** (não mobile-first — decisão explícita do usuário).
- **Testes**: Vitest + React Testing Library (frontend), Vitest (backend) — ambos os workspaces **unificados na mesma versão do vitest** (`^3.2.7`) para evitar conflitos de resolução de dependência no monorepo.
- **Enriquecimento via LLM (100% gratuito, sem custo)**: cadeia de fallback **Ollama local → Google Gemini 2.0 Flash (free tier, opcional) → preenchimento manual**. Nunca usa API paga da Anthropic para essa função (decisão explícita: o usuário rejeitou custo).
- **Monorepo**: npm workspaces (`apps/server`, `apps/web`), sem pacote compartilhado de tipos entre front/back (decisão deliberada de simplicidade — cada app tem sua própria cópia de `types.ts`, mantidas sincronizadas manualmente).
- **Armazenamento de dados**: **fora do repositório de código**, em `C:\Users\Diogo\skillvault\` (configurável via `SKILLVAULT_HOME`). O repo git do SkillVault contém só código-fonte — nunca repositórios/skills clonados de terceiros.

## Estrutura do projeto

```
C:\Users\Diogo\Projetos\SkillVault\      # repositório git (código-fonte)
  apps/
    server/     # backend Fastify + TypeScript
    web/        # frontend React + Vite + TypeScript
  docs/superpowers/
    specs/      # documento de design original
    plans/      # planos de implementação (TDD, task-by-task)

C:\Users\Diogo\skillvault\               # dados (FORA do repo git)
  skillvault.db     # SQLite
  repos/            # repositórios clonados
  skills/           # skills copiadas
  mcps/             # configs de MCP (.json)
  index.json        # índice para o Claude Code consumir
  INDEX.md
```

- Repositório remoto: **https://github.com/TheDiogoMM/skill_vaut.git** (branch `main`, sincronizado).
- Spec de design completa: `docs/superpowers/specs/2026-07-16-skillvault-design.md`
- Plano do backend: `docs/superpowers/plans/2026-07-16-backend-ingestion.md` (13 tarefas)
- Plano do frontend: `docs/superpowers/plans/2026-07-18-catalog-ui.md` (11 tarefas + 1 ajuste de backend)

## O que já foi construído

### Backend (`apps/server`) — completo
- Monorepo scaffold, config (`SKILLVAULT_HOME`, `OLLAMA_URL`/`OLLAMA_MODEL`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `PORT`).
- Schema SQLite (`categories`, `items`, `consultas`) + conexão.
- Enriquecimento via LLM com fallback Ollama → Gemini → manual (`apps/server/src/enrichment/`).
- 3 pipelines de ingestão:
  - **Repo**: clone via `simple-git`, lê README, enriquece, salva.
  - **Skill**: 3 formas — caminho local, upload (arquivo/zip), URL (clone + `npx skills add` best-effort para instalação global).
  - **MCP**: salva config JSON, enriquece a partir da descrição/config.
- API REST completa: `POST/GET/PATCH/DELETE /api/items`, `GET/POST/PATCH /api/categories`, `POST /api/categories/:id/merge`, `GET /api/index`.
- Geração automática de `index.json`/`INDEX.md` a cada escrita (items **e** categorias).
- `GET /api/items/:id` retorna também o **conteúdo bruto do arquivo** (README/SKILL.md/config) — campo `content`, adicionado especificamente para a tela de detalhe do frontend.
- 66 testes passando.

### Frontend (`apps/web`) — completo (exceto recomendador e PWA)
- **Catálogo** (`/`): lista agrupada por categoria, cards com nome, tipo, resumo, utilidade, tags, caminho local. Busca + filtros por tipo/categoria/tag (debounce de 250ms).
- **Detalhe do item** (`/items/:id`): conteúdo renderizado (Markdown para repo/skill, JSON bruto para MCP), botão "copiar caminho", categoria e tags **editáveis inline**.
- **Adicionar** (`/add`): seletor de tipo → formulário de repo (URL), skill (3 abas: caminho local/upload/URL), MCP (nome + config JSON). Após criar, redireciona para a tela de detalhe do item novo (onde o usuário vê e pode ajustar os campos gerados pela LLM — essa foi a interpretação escolhida para o requisito original de "preview do enriquecimento antes de confirmar", evitando redesenhar o backend em duas fases).
- **Categorias**: renomear e mesclar, acessível a partir do catálogo.
- **Tema**: dark mode padrão, toggle persistido em localStorage, layout desktop-first (sidebar fixa, colapsa abaixo de 720px).
- 44 testes passando.

### Bugs reais encontrados e corrigidos durante o desenvolvimento (revisão por subagentes)
- Backend: injeção via argumento de URL no `git clone`, upload multipart quebrado (bug crítico, corrigido), path traversal em nome de arquivo de upload, categorias não regeneravam o índice (gap contra a spec).
- Frontend: gap de infraestrutura de testes (RTL não limpava o DOM entre testes — corrigido globalmente em `apps/web/src/test/setup.ts`), estado `saveStatus` vazando entre navegação de itens diferentes, inconsistência de validação (`required` faltando), cards do catálogo não mostravam utilidade/tags/caminho (gap contra a spec, corrigido).

## O que falta (próximos passos)

Do escopo original, ainda **não implementado**:

1. **Recomendador de projeto** (`/recommend` + `POST /api/recommend`): campo de texto livre → LLM cruza com o catálogo → retorna skills/repos/MCPs recomendados em 3 blocos, com anti-alucinação (nunca inventa item que não existe no catálogo) e histórico de consultas (tabela `consultas`, já existe no schema mas não é usada ainda).
2. **PWA**: `vite-plugin-pwa`, manifest (ícones, nome, theme_color), service worker para cache do app shell + última resposta de `GET /api/items` (visualização offline do catálogo).
3. Nada além disso do escopo original ficou pendente — essas são as duas únicas peças que faltam para o app estar 100% conforme o pedido inicial.

## Como rodar localmente

```bash
cd C:\Users\Diogo\Projetos\SkillVault
npm install
npm run dev          # sobe backend (porta 3001) e frontend (porta 5173) juntos
npm run test          # roda os testes dos dois workspaces
```

Frontend: http://localhost:5173
Backend: http://localhost:3001

## Convenções de trabalho usadas neste projeto (para próximas sessões)

- Todo trabalho segue o fluxo **brainstorming → spec → plano (TDD, tarefa por tarefa) → execução via subagentes com dupla revisão** (conformidade com spec + qualidade de código) por tarefa, seguido de uma **revisão final do plano inteiro** antes de considerar pronto.
- Specs ficam em `docs/superpowers/specs/`, planos em `docs/superpowers/plans/` — sempre committados no git.
- Cada plano novo (ex: recomendador, PWA) deve seguir o mesmo padrão: brainstorming curto (se houver decisão técnica em aberto) → escrever plano → executar tarefa por tarefa com revisão dupla → revisão final → push para o GitHub.
- Preferência do usuário: trabalhar direto no branch `main` (sem worktree/branch separado) para este projeto.
