# SkillVault — Recomendador de Projeto

Implementa a peça 1 das duas que faltavam do escopo original (`PROJECT_CONTEXT.md`, "O que falta"): um campo de texto livre com uma ideia de projeto que cruza com o catálogo cadastrado via LLM e retorna skills/repos/MCPs recomendados, com anti-alucinação e histórico de consultas.

## 1. Backend: prompt e API

Novo módulo `apps/server/src/recommend/`, paralelo a `apps/server/src/enrichment/` e reaproveitando as mesmas funções `callOllama`/`callGemini` (mesma cadeia de fallback Ollama → Gemini, sem fallback manual — não existe humano pra preencher uma recomendação):

- `buildRecommendPrompt(ideia, catalog)`: monta o prompt listando todo o catálogo atual (`id`, `type`, `name`, `summary`, `utility`, `category`, `tags` de cada item) junto com a ideia do usuário, pedindo resposta em JSON `{"skills":[{"id":N,"motivo":"..."}], "repos":[...], "mcps":[...]}`. O `motivo` é texto que a própria LLM escreve pra aquela consulta específica (não é um reaproveitamento do `summary`/`utility` já salvos do item — é uma justificativa nova, contextualizada à ideia).
- `parseRecommendJson(raw)`: extrai e valida o JSON da resposta, mesmo padrão de `parseEnrichmentJson` (extrai o primeiro bloco `{...}`, valida estrutura, retorna `null` se malformado).
- `getRecommendations(config, itemsRepo, ideia)`: orquestra — monta prompt, tenta Ollama, tenta Gemini se Ollama falhar/não parsear, valida os resultados.

**Anti-alucinação por id** (mais robusto que validar por nome, que era a redação original do spec — evita ambiguidade com nomes duplicados/parecidos no catálogo): cada `id` citado pela LLM é conferido contra `itemsRepo.getById(id)` — precisa existir **e** ser exatamente do tipo em que foi citado (um id citado em `"skills"` que na verdade é `type=repo` no catálogo é descartado). IDs que não existem no catálogo são descartados silenciosamente — não é erro do usuário, é a LLM "errando".

**Catálogo vazio**: se não há nenhum item cadastrado, a rota nem chama a LLM — retorna direto os 3 blocos vazios com a mensagem padrão de bloco vazio (ver abaixo), evitando uma chamada à toa.

**Falha total da LLM** (Ollama indisponível E Gemini indisponível/resposta não-parseável): `503` com `{"error": "Não foi possível gerar recomendações no momento. Tente novamente."}`. Nada é salvo em `consultas` nesse caso — só consultas que efetivamente produziram uma resposta (mesmo que com blocos vazios) entram no histórico.

**Endpoints**:

```text
POST /api/recommend { ideia: string }
  -> 200 { skills: RecommendedItem[], repos: RecommendedItem[], mcps: RecommendedItem[] }
  -> 503 { error: string }                         -- LLM indisponível

GET /api/consultas
  -> 200 { id, ideia, createdAt }[]                -- últimas 10, mais recente primeiro
```

`RecommendedItem` é o registro completo do item (mesmo shape de `Item` no client, incluindo `id`/`name`/`localPath`/etc.) mais o campo `motivo` (string) anexado pela rota depois da validação.

Toda chamada bem-sucedida de `POST /api/recommend` (mesmo com blocos vazios) grava uma linha em `consultas`: `ideia` (o texto original do usuário) e `resposta_json` (o resultado já validado, serializado) — a coluna já existe no schema desde o design original; guardamos o JSON completo ali mesmo que o histórico exibido na tela hoje só mostre ideia+data, mantendo o dado disponível para uma futura expansão da tela sem precisar migrar nada.

## 2. Frontend

Nova página `apps/web/src/pages/RecommendPage.tsx`, rota `/recommend` (registrada em `App.tsx` junto das rotas existentes).

- **Formulário**: `Textarea` (campo da ideia) + `Button` ("Recomendar"), estado de carregamento desabilita o botão durante a chamada — mesmo padrão dos formulários de `/add`.
- **Resultado**: 3 colunas (`Skills`, `Repos`, `MCPs`), cada item mostrando nome (link para `/items/:id`, mesmo padrão de navegação do `ItemCard` do catálogo), o `motivo` retornado pela API, e o `localPath` em `<code>`. Um bloco sem recomendações mostra uma mensagem fixa por tipo (ex: "Nenhuma skill do catálogo cobre essa necessidade.", "Nenhum repositório...", "Nenhum MCP...") em vez de aparecer vazio sem explicação — essas três mensagens são texto fixo no frontend (mesmo padrão de "Nenhum item cadastrado ainda." já hardcoded em `CatalogPage.tsx`), não vêm da API; a API só precisa devolver arrays vazios, sem campo de mensagem.
- **Histórico**: lista compacta abaixo do resultado, carregada via `GET /api/consultas` ao montar a página — cada linha mostra a ideia digitada e a data. Sem interação (clicar não reexecuta nem expande).
- **Erros**: falha da API (503) usa `StatusMessage kind="error"` com a mensagem retornada, mesmo padrão já usado em `CatalogPage`/`ItemDetailPage`.

**Sidebar**: o item de navegação "Recomendar" (removido durante a implementação do design system porque a feature não existia ainda) volta ao `NAV_ITEMS` de `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`, apontando para `/recommend`. Usa o ícone `wand-2` do Lucide — não fazia parte do conjunto de 12 ícones já registrados em `Icon.tsx` (só os usados pelas telas existentes até agora), então é adicionado ao mapa `ICONS`.

**`apps/web/src/api/client.ts`**: novas funções `getRecommendations(ideia: string): Promise<RecommendResult>` e `listConsultas(): Promise<Consulta[]>`, seguindo o mesmo padrão de `request<T>()` já usado por todas as outras chamadas.

## 3. Testes

- **Backend**: testes unitários para `buildRecommendPrompt` e `parseRecommendJson` (mesmo padrão de `enrich.test.ts`/`parse.test.ts`); testes de rota para `POST /api/recommend` cobrindo: validação por id (descarta id inexistente, descarta id de tipo errado), catálogo totalmente vazio (não chama a LLM), falha total da LLM (503, nada salvo em `consultas`), e persistência correta de uma consulta bem-sucedida; testes de rota para `GET /api/consultas` (limite de 10, ordem cronológica decrescente).
- **Frontend**: teste de `RecommendPage` cobrindo submit do formulário, renderização das 3 colunas com dados retornados, exibição de mensagem de bloco vazio, exibição de erro em caso de falha da API, e renderização do histórico.

## 4. Fora de escopo

- Expandir ou reexecutar uma consulta a partir do histórico (a coluna `resposta_json` fica salva para uma eventual expansão futura, mas a tela não usa isso agora).
- Paginação do histórico além das últimas 10 consultas.
- Deletar consultas do histórico.
- Editar um item diretamente a partir da tela de recomendar (o usuário navega para a tela de detalhe existente, que já tem edição).
- Qualquer mudança ao PWA (peça 2 do que falta, é um plano separado).
