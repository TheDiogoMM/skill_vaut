# SkillVault

Biblioteca pessoal de skills, repositórios de código e MCPs — catálogo local, single-user.

## Rodando localmente

1. `npm install` (na raiz do monorepo)
2. Opcional: crie `apps/server/.env` com:
   - `SKILLVAULT_HOME` — pasta de dados (default: `~/skillvault`)
   - `OLLAMA_URL` — default `http://localhost:11434`
   - `OLLAMA_MODEL` — default `llama3.2`
   - `GEMINI_API_KEY` — opcional, usado como fallback quando o Ollama não responde
   - `GEMINI_MODEL` — default `gemini-2.0-flash`
   - `PORT` — default `3001`
3. `npm run dev` sobe o backend em `http://localhost:3001`
4. Testes: `npm run test`

## Endpoints disponíveis

- `POST /api/items` — adiciona skill/repo/mcp (`type: 'skill' | 'repo' | 'mcp'`)
- `GET /api/items` — lista, com filtros `?q=&type=&category=&tag=`
- `GET /api/items/:id` / `PATCH /api/items/:id` / `DELETE /api/items/:id`
- `GET /api/categories`, `POST /api/categories`, `PATCH /api/categories/:id`, `POST /api/categories/:id/merge`
- `GET /api/index` — serve o `index.json` consumível pelo Claude Code

## Integração com Claude Code

Aponte o Claude Code para `~/skillvault/index.json` (ou `INDEX.md`) como referência de contexto — o arquivo é regenerado automaticamente a cada item adicionado, editado ou removido.

## Status

Backend de ingestão completo (skills, repos, MCPs) com enriquecimento via LLM (Ollama → Gemini free tier → manual) e catálogo via API REST. Interface web, recomendador e PWA são fases seguintes — ver `docs/superpowers/specs/`.
