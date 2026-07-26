# Exportação do catálogo (Markdown e PDF) — Design

> Spec de continuidade: se esta conversa for perdida, este documento tem tudo que precisa para retomar sem reconstruir contexto.

## Motivação

O usuário quer, na tela do Catálogo, uma forma de exportar a lista de itens (nome, link, breve descrição) como arquivo Markdown ou PDF — útil para compartilhar ou consultar o catálogo fora do app.

## Escopo

Só frontend (`apps/web`). Não requer mudanças no backend — a tela do catálogo já mantém em memória exatamente os itens filtrados/buscados no momento (`items`, `categories`), que é a fonte de dados da exportação.

## 1. Resolução de dados por item

Novo módulo puro `apps/web/src/lib/export.ts`:

```ts
export interface ExportRow {
  category: string;
  name: string;
  link: string;
  description: string;
}

function resolveLink(item: Item): string {
  return /^https?:\/\//i.test(item.sourceValue) ? item.sourceValue : item.localPath;
}

function resolveDescription(item: Item): string {
  return item.summary || item.utility || 'sem descrição';
}

export function buildExportRows(items: Item[], categories: Category[]): ExportRow[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return items.map((item) => ({
    category: item.categoryId !== null ? categoryNameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria',
    name: item.name,
    link: resolveLink(item),
    description: resolveDescription(item),
  }));
}
```

`resolveLink`: se `sourceValue` começa com `http://`/`https://` (repo/skill vindos de URL, ou repo local com remote git capturado automaticamente), usa `sourceValue`. Caso contrário (repo local sem remote, skill local/upload, MCP), usa `item.localPath` — o caminho real e estável no disco.

`resolveDescription`: usa `summary`, com fallback para `utility`, com fallback para `'sem descrição'`.

## 2. Exportação em Markdown

`apps/web/src/lib/export.ts` também exporta:

```ts
export function renderExportMarkdown(rows: ExportRow[]): string
```

Agrupa `rows` por `category` (ordem alfabética, igual ao agrupamento já usado no `INDEX.md` do backend), gera:

```markdown
# SkillVault — Catálogo

## dev-tools

- **superpowers** — Sistema de skills meta para Claude Code...
  Link: `C:\Users\Diogo\skillvault\skills\superpowers`

## design

- **magic** — MCP do 21st.dev que gera componentes de UI React...
  Link: https://mcp.21st.dev/api
```

(Link em code span quando é um caminho local; como URL "crua" quando é http(s) — para ficar clicável em visualizadores de Markdown que suportam autolink, mas sem forçar sintaxe `[texto](url)` desnecessariamente.)

O download é feito 100% no navegador: `new Blob([markdown], { type: 'text/markdown' })` → `URL.createObjectURL` → `<a download="catalogo.md">` clicado programaticamente → `URL.revokeObjectURL` logo depois.

## 3. Exportação em PDF

Nova dependência `jspdf` (só o pacote base, sem `jspdf-autotable`) em `apps/web/package.json`.

Novo módulo `apps/web/src/lib/exportPdf.ts`:

```ts
export function buildPdf(rows: ExportRow[]): jsPDF
```

Usa a mesma fonte de dados (`ExportRow[]`, já agrupada por categoria dentro da função). Layout:
- Título "SkillVault — Catálogo" no topo da primeira página.
- Por categoria: subtítulo.
- Por item: nome em negrito, link abaixo em fonte menor, descrição quebrada em várias linhas via `doc.splitTextToSize(text, larguraUtil)`.
- Cursor vertical (`y`) rastreado manualmente; antes de desenhar cada bloco, se `y + alturaDoBloco > alturaDaPágina - margemInferior`, chama `doc.addPage()` e reseta `y` para o topo.

O botão "Baixar .pdf" chama `buildPdf(rows).save('catalogo.pdf')` (método nativo do jsPDF, já dispara o download).

## 4. Interface

Novo componente `apps/web/src/components/ExportButtons.tsx`:

```ts
export interface ExportButtonsProps {
  items: Item[];
  categories: Category[];
  disabled?: boolean;
}
```

Renderiza dois `Button` (variante secundária, mesmo padrão visual já usado no app): "Baixar .md" e "Baixar .pdf". Cada clique chama `buildExportRows(items, categories)` e o exportador correspondente. `disabled` fica `true` quando `status !== 'ready'` ou a lista está vazia (mesma lógica de estado que `CatalogPage.tsx` já usa para o restante da tela).

Em `apps/web/src/pages/CatalogPage.tsx`, `<ExportButtons items={items} categories={categories} disabled={...} />` entra logo abaixo do `<SearchFilterBar />`, antes da lista de grupos — reaproveita o `items`/`categories` que a página já busca e filtra, sem nova chamada à API.

## Testes

- `export.test.ts`: `resolveLink` (URL http/https → usa sourceValue; local_path/mcp/sem URL → usa localPath), `resolveDescription` (summary → utility → fallback), `buildExportRows` (mapeamento completo, agrupamento correto), `renderExportMarkdown` (formato exato, agrupamento por categoria, ordenação alfabética).
- `exportPdf.test.ts`: testa a lógica de paginação/layout isoladamente do jsPDF real quando possível (ex: uma função pura que decide quando quebrar página dado `y` atual + altura do próximo bloco); testa que `buildPdf(rows)` roda sem lançar exceção e retorna um documento com o número de páginas esperado para uma entrada grande o suficiente para forçar quebra de página.
- `ExportButtons.test.tsx`: clique em cada botão dispara a exportação correspondente (mock de `URL.createObjectURL`/`jsPDF.save`), botões desabilitados quando `disabled=true` ou lista vazia.
