import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import { readFirstExisting, REPO_CONTENT_CANDIDATES } from '../content.js';
import type { Item } from '../types.js';

export type RepoSource = { kind: 'local_path'; path: string } | { kind: 'url'; url: string };

export interface IngestRepoInput {
  type: 'repo' | 'plugin';
  name: string;
  source: RepoSource;
}

export function assertSafeRepoUrl(url: string): void {
  if (url.startsWith('-')) {
    throw new Error('invalid repository url');
  }
}

async function resolveRemoteUrl(localRepoPath: string): Promise<string | null> {
  try {
    const url = await simpleGit(localRepoPath).remote(['get-url', 'origin']);
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

async function probeRemoteReadme(url: string): Promise<string> {
  const tmpDir = path.join(
    os.tmpdir(),
    `skillvault-repo-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  try {
    await simpleGit().clone(url, tmpDir, ['--depth', '1']);
    return readFirstExisting(tmpDir, REPO_CONTENT_CANDIDATES);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function ingestRepo(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestRepoInput,
  enrich: typeof enrichContent = enrichContent
): Promise<Item> {
  let localPath: string;
  let sourceValue: string;
  let downloadStatus: NewItem['downloadStatus'];
  let readme: string;

  if (input.source.kind === 'local_path') {
    localPath = input.source.path;
    readme = readFirstExisting(localPath, REPO_CONTENT_CANDIDATES);
    sourceValue = (await resolveRemoteUrl(localPath)) ?? localPath;
    downloadStatus = 'local';
  } else {
    assertSafeRepoUrl(input.source.url);
    readme = await probeRemoteReadme(input.source.url);
    localPath = resolveUniqueDir(config.reposDir, input.name).fullPath;
    sourceValue = input.source.url;
    downloadStatus = 'not_downloaded';
  }

  const enrichment = await enrich(config, input.type, readme || sourceValue);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: input.type,
    name: input.name,
    sourceType: input.source.kind,
    sourceValue,
    localPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
    downloadStatus,
  };

  return itemsRepo.create(newItem);
}
