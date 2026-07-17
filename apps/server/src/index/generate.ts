import fs from 'node:fs';
import type { Item, Category } from '../types.js';

export interface IndexEntry {
  id: number;
  type: string;
  name: string;
  category: string | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  localPath: string;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*_`[\]]/g, '\\$&');
}

export function buildIndexEntries(items: Item[], categories: Category[]): IndexEntry[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    category: item.categoryId !== null ? categoryNameById.get(item.categoryId) ?? null : null,
    summary: item.summary,
    utility: item.utility,
    tags: item.tags,
    localPath: item.localPath,
  }));
}

export function renderIndexMarkdown(entries: IndexEntry[]): string {
  const byCategory = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    const key = entry.category ?? 'Sem categoria';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(entry);
  }

  const lines: string[] = ['# SkillVault Index', ''];
  for (const [category, categoryEntries] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${category}`, '');
    for (const entry of categoryEntries) {
      const escapedName = escapeMarkdown(entry.name);
      const escapedSummary = escapeMarkdown(entry.summary ?? 'sem resumo');
      const escapedUtility = escapeMarkdown(entry.utility ?? 'n/a');
      const escapedPath = escapeMarkdown(entry.localPath);
      lines.push(`- **${escapedName}** (${entry.type}) — ${escapedSummary}`);
      lines.push(`  - Utilidade: ${escapedUtility}`);
      lines.push(`  - Caminho: \`${escapedPath}\``);
      lines.push(`  - Tags: ${entry.tags.join(', ') || 'nenhuma'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function writeIndexFiles(entries: IndexEntry[], jsonPath: string, mdPath: string): void {
  fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, renderIndexMarkdown(entries), 'utf-8');
}

export function regenerateIndex(
  itemsRepo: { list(): Item[] },
  categoriesRepo: { list(): Category[] },
  jsonPath: string,
  mdPath: string
): void {
  const entries = buildIndexEntries(itemsRepo.list(), categoriesRepo.list());
  writeIndexFiles(entries, jsonPath, mdPath);
}
