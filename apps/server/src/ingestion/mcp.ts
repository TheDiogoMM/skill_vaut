import fs from 'node:fs';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueFile } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

export interface IngestMcpInput {
  name: string;
  config: Record<string, unknown>;
  description?: string;
}

export async function ingestMcp(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestMcpInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  const { fullPath } = resolveUniqueFile(config.mcpsDir, input.name, '.json');
  fs.writeFileSync(fullPath, JSON.stringify(input.config, null, 2), 'utf-8');

  const content = `${input.description ?? ''}\n${JSON.stringify(input.config, null, 2)}`;
  const enrichment = await enrich(config, 'mcp', content);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'mcp',
    name: input.name,
    sourceType: 'manual',
    sourceValue: JSON.stringify(input.config),
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
  };

  return itemsRepo.create(newItem);
}
