# SkillVault — Design

Biblioteca pessoal (single-user, local) de skills, repositórios de código e MCPs, com PWA responsivo. Ingestão inteligente (resumo/categoria/tags via LLM local), catálogo navegável, recomendador de itens a partir de uma ideia de projeto em linguagem natural, e um índice consumível pelo Claude Code.

## 1. Arquitetura e armazenamento

**Código** — monorepo com npm workspaces em `C:\Users\Diogo\Projetos\SkillVault\`:

```
SkillVault/
  apps/web/          # React + Vite + PWA (vite-plugin-pwa)
  apps/server/        # Fastify + TypeScript
  packages/shared/     # tipos TS compartilhados (Item, Category, RecommendResult, ...)
```

`npm run dev` na raiz sobe os dois processos (workspaces + `concurrently`). O Vite dev server faz proxy de `/api` para o Fastify. Linguagem: TypeScript em todo o projeto.

**Dados** — fora do repositório de código, em `C:\Users\Diogo\skillvault\` (caminho base configurável via env `SKILLVAULT_HOME`, default `~/skillvault`):

```
skillvault/
  skillvault.db      # SQLite (better-sqlite3)
  repos/<nome>/       # repositórios git clonados
  skills/<nome>/       # skills copiadas/clonadas
  mcps/<nome>.json     # configs de MCP
  index.json
  INDEX.md
```

Manter dados fora do git do projeto evita versionar dezenas de repositórios de terceiros dentro do próprio repositório do SkillVault, e dá um caminho fixo e previsível para o Claude Code referenciar (`~/skillvault/index.json`).

## 2. Enriquecimento via LLM (com fallback)

Sem custo — nada de API paga. Cadeia de fallback ao adicionar um item:

1. **Ollama local** (`http://localhost:11434`, modelo configurável via env `OLLAMA_MODEL`, default `llama3.2`) — tentativa primária, 100% local e gratuita.
2. **Google Gemini 2.0 Flash free tier** (env `GEMINI_API_KEY`, opcional) — usado somente se o Ollama não responder.
3. **Manual** — se nenhuma das duas anteriores estiver disponível/configurada, ou se a resposta não for um JSON parseável, os campos ficam vazios e o usuário preenche na UI antes de confirmar o cadastro.

Prompt estruturado pede JSON `{resumo, utilidade, categoria, tags}`. O parsing extrai o primeiro bloco `{...}` da resposta; falha de parsing cai automaticamente para o próximo elo da cadeia. O item salvo registra `enrichment_source` (`ollama` | `gemini` | `manual`) para transparência na UI.

## 3. Modelo de dados (SQLite via better-sqlite3)

```sql
categories (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
)

items (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('skill','repo','mcp')),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('local_path','upload','url','manual')),
  source_value TEXT NOT NULL,       -- path original, URL, ou nome do arquivo enviado
  local_path TEXT NOT NULL,         -- localização final em ~/skillvault/...
  category_id INTEGER REFERENCES categories(id),
  summary TEXT,
  utility TEXT,
  tags TEXT,                        -- JSON array serializado
  enrichment_source TEXT CHECK (enrichment_source IN ('ollama','gemini','manual')),
  global_install_status TEXT CHECK (global_install_status IN ('success','failed')), -- só skill via URL
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

consultas (
  id INTEGER PRIMARY KEY,
  ideia TEXT NOT NULL,
  resposta_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Categorias em tabela própria (não string livre) para permitir renomear (`UPDATE categories`) e mesclar (reatribuir `category_id` dos itens de A para B, apagar A) sem editar item a item. Tags como JSON serializado em TEXT — suficiente para um catálogo pessoal, evita tabela de junção.

## 4. Pipeline de ingestão por tipo

**Repo** (`type=repo`, `source=<URL git>`)
1. `simple-git clone <url> ~/skillvault/repos/<nome>` (nome slugificado a partir da URL; conflito de nome → sufixo numérico)
2. Lê `README.md`/`README` da raiz
3. Enriquecimento (§2) → grava em `items` → regenera índice

**Skill** — três formas de entrada:
- **Caminho local**: copia a pasta inteira para `~/skillvault/skills/<nome>`
- **Upload** (arquivo único ou `.zip`): salva em temp, extrai se zip, copia para `skills/<nome>`
- **URL**: `git clone` genérico para `skills/<nome>`, **e em paralelo** tenta `npx skills add <url>` (best effort) para instalação global no Claude Code. Resultado (`success`/`failed`) fica em `global_install_status` e é exibido na UI; falha na instalação global não impede o cadastro no catálogo.

Em todos os casos: lê `SKILL.md` (fallback `README.md`) → enriquecimento → grava.

**MCP** (`type=mcp`, sem clone)
- Formulário: nome + (URL de pacote npm **ou** comando de instalação **ou** bloco JSON `mcpServers`)
- Salva config em `~/skillvault/mcps/<nome>.json`
- Enriquecimento usa o conteúdo da config + descrição opcional do usuário

**Erros**: clone/upload/cópia falhos retornam erro claro na UI e **nada é gravado no banco** — sem itens órfãos com `local_path` inválido.

## 5. API REST (Fastify)

```
POST   /api/items                 { type, source_type, source, ...manual? }
GET    /api/items                 ?q=&type=&category=&tag=
GET    /api/items/:id             detalhe + conteúdo renderizado (README/SKILL.md/config)
PATCH  /api/items/:id             editar categoria/tags/resumo/utilidade manualmente
DELETE /api/items/:id             remove registro + apaga pasta/arquivo local + regenera índice

GET    /api/categories
POST   /api/categories            { name }
PATCH  /api/categories/:id        { name }              -- renomear
POST   /api/categories/:id/merge  { target_id }          -- mesclar A em B

POST   /api/recommend             { ideia } -> { skills[], repos[], mcps[] }
GET    /api/consultas             histórico das últimas recomendações

GET    /api/index                 serve index.json
```

Toda escrita (`POST`/`PATCH`/`DELETE` em items/categories) regenera `index.json` e `INDEX.md` de forma síncrona antes de responder.

**Anti-alucinação em `/api/recommend`**: o prompt inclui a lista real do catálogo (nome/tipo/resumo/utilidade/categoria/tags de cada item). Após a resposta do LLM, o backend valida cada item citado contra os nomes reais do catálogo — itens mencionados que não existem são descartados antes de retornar ao front-end. Bloco vazio → mensagem explícita (ex: "nenhum MCP do catálogo cobre essa necessidade") em vez de inventar.

## 6. Front-end (React + Vite PWA)

Layout **desktop-first** (uso principal em desktop), com adaptação responsiva para tablet/mobile como estado secundário — breakpoints reduzem densidade (sidebar → bottom-nav/hambúrguer, grid → lista) em vez de definirem o layout base.

- **Catálogo** (`/`): grid/lista agrupada por categoria; card com nome, badge de tipo (skill/repo/mcp), resumo, utilidade, tags, caminho local. Busca + filtros (tipo, categoria, tag).
- **Detalhe** (`/items/:id`): conteúdo renderizado (Markdown do README/SKILL.md, ou JSON formatado do MCP), botão "copiar caminho/comando", categoria e tags editáveis inline.
- **Adicionar** (`/add`): seletor de tipo → formulário específico (repo: URL; skill: abas caminho/upload/URL; mcp: campo config). Preview do enriquecimento com opção de editar antes de confirmar.
- **Recomendar** (`/recommend`): textarea da ideia → 3 colunas (Skills/Repos/MCPs) com nome, motivo, caminho/comando; histórico das últimas consultas (tabela `consultas`) abaixo.
- **Categorias**: renomear/mesclar, acessível a partir dos filtros do catálogo.
- **Tema**: dark mode padrão, toggle persistido em localStorage.
- **PWA**: `vite-plugin-pwa`, manifest com ícones/nome/theme_color, service worker cacheando o app shell + runtime caching (network-first) da última resposta de `GET /api/items` para visualização offline do catálogo. Adicionar/recomendar exigem rede (dependem do backend local, sem sentido offline).

## 7. Integração com Claude Code

`~/skillvault/index.json` e `~/skillvault/INDEX.md` são regenerados a cada escrita (item ou categoria) e listam todos os itens com tipo, categoria, resumo, utilidade e caminho local — formato pronto para o Claude Code consumir como contexto. `GET /api/index` expõe o mesmo conteúdo programaticamente.

## 8. Fora de escopo (v1)

- Autenticação/multiusuário
- Deploy remoto (é uso local via `localhost`)
- Versionamento de skills/repos além do que o próprio `git clone` já dá
- Edição de conteúdo de skill/repo pelo app (só leitura + metadados editáveis)
