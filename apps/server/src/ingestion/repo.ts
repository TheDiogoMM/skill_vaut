import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import { readFirstExisting, REPO_CONTENT_CANDIDATES } from '../content.js';
import type { Item } from '../types.js';

export interface IngestRepoInput {
  name: string;
  url: string;
}

export function assertSafeRepoUrl(url: string): void {
  if (url.startsWith('-')) {
    throw new Error('invalid repository url');
  }
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  assertSafeRepoUrl(input.url);

  const { fullPath } = resolveUniqueDir(config.reposDir, input.name);

  await simpleGit().clone(input.url, fullPath);

  const readme = readFirstExisting(fullPath, REPO_CONTENT_CANDIDATES);
  const enrichment = await enrich(config, 'repo', readme || input.url);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'repo',
    name: input.name,
    sourceType: 'url',
    sourceValue: input.url,
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
