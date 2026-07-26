# Exportação do catálogo (Markdown e PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela de Catálogo ganha dois botões, "Baixar .md" e "Baixar .pdf", que exportam exatamente os itens filtrados/visíveis no momento (nome, link, breve descrição, agrupados por categoria).

**Architecture:** Módulos puros e testáveis separados por responsabilidade (`export.ts` mapeia `Item`→linha de exportação e gera o Markdown; `exportPdf.ts` gera o PDF via `jspdf`; `download.ts` faz o download de texto no navegador), consumidos por um componente `ExportButtons` novo, plugado na `CatalogPage` já existente — sem nenhuma mudança no backend.

**Tech Stack:** React + TypeScript (frontend já existente), `jspdf` (nova dependência, único pacote adicionado).

---

### Task 1: `export.ts` — mapeamento de dados e renderização em Markdown

**Files:**
- Create: `apps/web/src/lib/export.ts`
- Test: `apps/web/src/lib/export.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExportRows, renderExportMarkdown } from './export.js';
import type { Item, Category } from '../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Item A',
    sourceType: 'url',
    sourceValue: 'https://example.com/repo.git',
    localPath: '/local/path',
    categoryId: null,
    summary: 'Resumo A',
    utility: 'Utilidade A',
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const category: Category = { id: 1, name: 'dev-tools', createdAt: '' };

describe('buildExportRows', () => {
  it('uses sourceValue as the link when it looks like a URL', () => {
    const rows = buildExportRows([sampleItem({ sourceValue: 'https://example.com/repo.git' })], []);
    expect(rows[0].link).toBe('https://example.com/repo.git');
  });

  it('falls back to localPath when sourceValue is not a URL', () => {
    const rows = buildExportRows(
      [sampleItem({ sourceValue: '/local/source', localPath: '/local/vault-copy' })],
      []
    );
    expect(rows[0].link).toBe('/local/vault-copy');
  });

  it('uses summary as the description, falling back to utility, then a placeholder', () => {
    const [withSummary] = buildExportRows([sampleItem({ summary: 'Resumo', utility: 'Utilidade' })], []);
    expect(withSummary.description).toBe('Resumo');

    const [withUtilityOnly] = buildExportRows([sampleItem({ summary: null, utility: 'Utilidade' })], []);
    expect(withUtilityOnly.description).toBe('Utilidade');

    const [withNeither] = buildExportRows([sampleItem({ summary: null, utility: null })], []);
    expect(withNeither.description).toBe('sem descrição');
  });

  it('resolves the category name, defaulting to "Sem categoria"', () => {
    const [withCategory] = buildExportRows([sampleItem({ categoryId: 1 })], [category]);
    expect(withCategory.category).toBe('dev-tools');

    const [withoutCategory] = buildExportRows([sampleItem({ categoryId: null })], [category]);
    expect(withoutCategory.category).toBe('Sem categoria');
  });
});

describe('renderExportMarkdown', () => {
  it('groups rows by category, sorted alphabetically, with name/description/link', () => {
    const md = renderExportMarkdown([
      { category: 'design', name: 'Item B', link: 'https://example.com/b', description: 'Descrição B' },
      { category: 'dev-tools', name: 'Item A', link: '/local/a', description: 'Descrição A' },
    ]);

    const devToolsIndex = md.indexOf('## dev-tools');
    const designIndex = md.indexOf('## design');
    expect(devToolsIndex).toBeGreaterThanOrEqual(0);
    expect(designIndex).toBeGreaterThan(devToolsIndex);

    expect(md).toContain('- **Item A** — Descrição A');
    expect(md).toContain('Link: `/local/a`');
    expect(md).toContain('- **Item B** — Descrição B');
    expect(md).toContain('Link: https://example.com/b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/export.test.ts`
Expected: FAIL — `./export.js` does not exist.

- [ ] **Step 3: Implement `export.ts`**

Create `apps/web/src/lib/export.ts`:

```ts
import type { Item, Category } from '../types.js';

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

export function renderExportMarkdown(rows: ExportRow[]): string {
  const byCategory = new Map<string, ExportRow[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const lines: string[] = ['# SkillVault — Catálogo', ''];
  for (const [category, categoryRows] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${category}`, '');
    for (const row of categoryRows) {
      const isUrl = /^https?:\/\//i.test(row.link);
      const linkText = isUrl ? row.link : `\`${row.link}\``;
      lines.push(`- **${row.name}** — ${row.description}`);
      lines.push(`  Link: ${linkText}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/export.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/export.ts apps/web/src/lib/export.test.ts
git commit -m "feat: add catalog export data mapping and Markdown rendering"
```

---

### Task 2: `download.ts` — disparar download de arquivo de texto no navegador

**Files:**
- Create: `apps/web/src/lib/download.ts`
- Test: `apps/web/src/lib/download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/download.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile } from './download.js';

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a Blob with the given content/type, triggers an anchor download, and revokes the object URL', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('conteúdo', 'arquivo.md', 'text/markdown');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('text/markdown');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/download.test.ts`
Expected: FAIL — `./download.js` does not exist.

- [ ] **Step 3: Implement `download.ts`**

Create `apps/web/src/lib/download.ts`:

```ts
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/download.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/download.ts apps/web/src/lib/download.test.ts
git commit -m "feat: add browser text-file download helper"
```

---

### Task 3: `exportPdf.ts` — geração de PDF com `jspdf`

**Files:**
- Modify: `apps/web/package.json` (nova dependência)
- Create: `apps/web/src/lib/exportPdf.ts`
- Test: `apps/web/src/lib/exportPdf.test.ts`

- [ ] **Step 1: Install the new dependency**

Run: `cd apps/web && npm install jspdf`
Expected: `jspdf` added to `apps/web/package.json`'s `dependencies`. No `@types/jspdf` needed — the package ships its own types.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/exportPdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPdf } from './exportPdf.js';
import type { ExportRow } from './export.js';

function manyRows(count: number): ExportRow[] {
  return Array.from({ length: count }, (_, i) => ({
    category: 'dev-tools',
    name: `Item ${i}`,
    link: `/local/item-${i}`,
    description: 'Uma descrição razoavelmente longa para ocupar espaço vertical na página do PDF gerado.',
  }));
}

describe('buildPdf', () => {
  it('builds a single-page PDF for a small number of rows', () => {
    const doc = buildPdf(manyRows(2));
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('adds new pages once content overflows a single page', () => {
    const doc = buildPdf(manyRows(60));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/exportPdf.test.ts`
Expected: FAIL — `./exportPdf.js` does not exist.

- [ ] **Step 4: Implement `exportPdf.ts`**

Create `apps/web/src/lib/exportPdf.ts`:

```ts
import { jsPDF } from 'jspdf';
import type { ExportRow } from './export.js';

const PAGE_MARGIN = 15;
const LINE_HEIGHT = 6;
const TITLE_SIZE = 18;
const CATEGORY_SIZE = 13;
const NAME_SIZE = 11;
const BODY_SIZE = 9;

export function buildPdf(rows: ExportRow[]): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  function ensureSpace(height: number) {
    if (y + height > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(TITLE_SIZE);
  doc.text('SkillVault — Catálogo', PAGE_MARGIN, y);
  y += LINE_HEIGHT * 2;

  const byCategory = new Map<string, ExportRow[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }
  const sortedCategories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  for (const category of sortedCategories) {
    ensureSpace(LINE_HEIGHT * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CATEGORY_SIZE);
    doc.text(category, PAGE_MARGIN, y);
    y += LINE_HEIGHT * 1.5;

    for (const row of byCategory.get(category)!) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_SIZE);
      const descriptionLines = doc.splitTextToSize(row.description, contentWidth) as string[];
      const blockHeight = LINE_HEIGHT * 2 + descriptionLines.length * (LINE_HEIGHT * 0.8);
      ensureSpace(blockHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_SIZE);
      doc.text(row.name, PAGE_MARGIN, y);
      y += LINE_HEIGHT * 0.9;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(BODY_SIZE);
      doc.text(row.link, PAGE_MARGIN, y);
      y += LINE_HEIGHT * 0.8;

      doc.text(descriptionLines, PAGE_MARGIN, y);
      y += descriptionLines.length * (LINE_HEIGHT * 0.8) + LINE_HEIGHT * 0.5;
    }
    y += LINE_HEIGHT * 0.5;
  }

  return doc;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/exportPdf.test.ts`
Expected: PASS (both tests — 2 rows fit on one page, 60 rows force at least a second page).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/exportPdf.ts apps/web/src/lib/exportPdf.test.ts
git commit -m "feat: add PDF export via jspdf"
```

---

### Task 4: Componente `ExportButtons`

**Files:**
- Create: `apps/web/src/components/ExportButtons.tsx`
- Test: `apps/web/src/components/ExportButtons.test.tsx`

First, look at `apps/web/src/components/ui/core/Button/Button.tsx` for the existing `Button` component's props (`variant`, `size`, `disabled`, `onClick`, `children`) — this task reuses it exactly as-is, no new UI primitives.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/ExportButtons.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButtons } from './ExportButtons.js';
import * as downloadLib from '../lib/download.js';
import * as exportPdfLib from '../lib/exportPdf.js';
import type { Item } from '../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Item A',
    sourceType: 'url',
    sourceValue: 'https://example.com',
    localPath: '/local',
    categoryId: null,
    summary: 'Resumo',
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('ExportButtons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a Markdown file when "Baixar .md" is clicked', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(downloadLib, 'downloadTextFile').mockImplementation(() => {});

    render(<ExportButtons items={[sampleItem()]} categories={[]} />);
    await user.click(screen.getByRole('button', { name: 'Baixar .md' }));

    expect(downloadSpy).toHaveBeenCalledWith(expect.stringContaining('Item A'), 'catalogo.md', 'text/markdown');
  });

  it('generates and saves a PDF when "Baixar .pdf" is clicked', async () => {
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    vi.spyOn(exportPdfLib, 'buildPdf').mockReturnValue({ save: saveSpy } as unknown as ReturnType<
      typeof exportPdfLib.buildPdf
    >);

    render(<ExportButtons items={[sampleItem()]} categories={[]} />);
    await user.click(screen.getByRole('button', { name: 'Baixar .pdf' }));

    expect(saveSpy).toHaveBeenCalledWith('catalogo.pdf');
  });

  it('disables both buttons when disabled is true', () => {
    render(<ExportButtons items={[]} categories={[]} disabled />);
    expect(screen.getByRole('button', { name: 'Baixar .md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baixar .pdf' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/ExportButtons.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/ExportButtons.tsx`:

```tsx
import type { Item, Category } from '../types.js';
import { buildExportRows, renderExportMarkdown } from '../lib/export.js';
import { downloadTextFile } from '../lib/download.js';
import { buildPdf } from '../lib/exportPdf.js';
import { Button } from './ui/core/Button/Button.js';

export interface ExportButtonsProps {
  items: Item[];
  categories: Category[];
  disabled?: boolean;
}

export function ExportButtons({ items, categories, disabled }: ExportButtonsProps) {
  function handleExportMarkdown() {
    const rows = buildExportRows(items, categories);
    downloadTextFile(renderExportMarkdown(rows), 'catalogo.md', 'text/markdown');
  }

  function handleExportPdf() {
    const rows = buildExportRows(items, categories);
    buildPdf(rows).save('catalogo.pdf');
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleExportMarkdown} disabled={disabled}>
        Baixar .md
      </Button>
      <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={disabled}>
        Baixar .pdf
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/ExportButtons.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ExportButtons.tsx apps/web/src/components/ExportButtons.test.tsx
git commit -m "feat: add ExportButtons component"
```

---

### Task 5: Ligar `ExportButtons` à `CatalogPage`

**Files:**
- Modify: `apps/web/src/pages/CatalogPage.tsx`
- Modify: `apps/web/src/pages/CatalogPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/pages/CatalogPage.test.tsx`, inside `describe('CatalogPage', ...)`:

```tsx
  it('shows the export buttons once the catalog has loaded', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([sampleItem()]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Baixar .md' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar .pdf' })).toBeInTheDocument();
  });

  it('disables the export buttons while the catalog is empty', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum item cadastrado ainda.');
    expect(screen.getByRole('button', { name: 'Baixar .md' })).toBeDisabled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/CatalogPage.test.tsx`
Expected: FAIL — no "Baixar .md"/"Baixar .pdf" buttons rendered yet.

- [ ] **Step 3: Wire `ExportButtons` into `CatalogPage`**

In `apps/web/src/pages/CatalogPage.tsx`, add the import:

```tsx
import { ExportButtons } from '../components/ExportButtons.js';
```

Add the component right after `<SearchFilterBar categories={categories} onChange={setFilters} />`:

```tsx
      <SearchFilterBar categories={categories} onChange={setFilters} />
      <ExportButtons items={items} categories={categories} disabled={status !== 'ready' || items.length === 0} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/CatalogPage.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full frontend suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/CatalogPage.tsx apps/web/src/pages/CatalogPage.test.tsx
git commit -m "feat: show export buttons on the catalog page"
```

---

### Task 6: Rebuild do frontend + verificação final

**Files:** nenhum (apenas build/verificação)

- [ ] **Step 1: Rebuild**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run build --workspace apps/web`
Expected: build finishes with no errors (confirms `jspdf` bundles correctly with Vite).

- [ ] **Step 2: Full workspace test run**

Run: `cd C:\Users\Diogo\Projetos\SkillVault && npm run test`
Expected: PASS — both `apps/server` and `apps/web` suites green.

- [ ] **Step 3: Manual smoke test in the browser**

The local server doesn't hot-reload — restart it so the rebuilt frontend is served:

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill //PID <pid-from-above> //F
wscript.exe run-server-hidden.vbs
```

Open `http://localhost:3001`, go to Catálogo, click "Baixar .md" and confirm a `catalogo.md` file downloads with the expected content (name/link/description per item, grouped by category). Click "Baixar .pdf" and confirm a `catalogo.pdf` downloads and opens correctly, with readable text and — if the catalog has enough items — more than one page.

No commit for this task.
