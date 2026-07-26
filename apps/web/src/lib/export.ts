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
  for (const [category, categoryRows] of [...byCategory.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
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
