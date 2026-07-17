import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

const README_CANDIDATES = ['README.md', 'readme.md', 'README'];

function readFirstExisting(dir: string, candidates: string[]): string {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

export interface IngestRepoInput {
  name: string;
  url: string;
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  const { fullPath } = resolveUniqueDir(config.reposDir, input.name);

  await simpleGit().clone(input.url, fullPath);

  const readme = readFirstExisting(fullPath, README_CANDIDATES);
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
