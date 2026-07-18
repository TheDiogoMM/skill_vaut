import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';
import { simpleGit } from 'simple-git';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueDir } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import { assertSafeRepoUrl } from './repo.js';
import { readFirstExisting, SKILL_CONTENT_CANDIDATES } from '../content.js';
import type { Item, GlobalInstallStatus } from '../types.js';

const execFileAsync = promisify(execFile);

export type SkillSource =
  | { kind: 'local_path'; path: string }
  | { kind: 'upload'; tempFilePath: string; isZip: boolean; originalFilename?: string }
  | { kind: 'url'; url: string };

export interface IngestSkillInput {
  name: string;
  source: SkillSource;
}

export async function tryGlobalInstall(url: string): Promise<GlobalInstallStatus> {
  try {
    await execFileAsync('npx', ['skills', 'add', url], { timeout: 60_000 });
    return 'success';
  } catch {
    return 'failed';
  }
}

export async function ingestSkill(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  input: IngestSkillInput,
  enrich: typeof enrichContent = enrichContent,
  globalInstall: typeof tryGlobalInstall = tryGlobalInstall
): Promise<Item> {
  const { fullPath } = resolveUniqueDir(config.skillsDir, input.name);
  let sourceType: 'local_path' | 'upload' | 'url';
  let sourceValue: string;
  let globalInstallStatus: GlobalInstallStatus | null = null;

  if (input.source.kind === 'local_path') {
    fs.cpSync(input.source.path, fullPath, { recursive: true });
    sourceType = 'local_path';
    sourceValue = input.source.path;
  } else if (input.source.kind === 'upload') {
    sourceType = 'upload';
    sourceValue = input.source.tempFilePath;
    if (input.source.isZip) {
      const zip = new AdmZip(input.source.tempFilePath);
      zip.extractAllTo(fullPath, true);
    } else {
      fs.mkdirSync(fullPath, { recursive: true });
      const destName = input.source.originalFilename
        ? path.basename(input.source.originalFilename)
        : path.basename(input.source.tempFilePath);
      fs.copyFileSync(input.source.tempFilePath, path.join(fullPath, destName));
    }
  } else {
    sourceType = 'url';
    sourceValue = input.source.url;
    assertSafeRepoUrl(input.source.url);
    await simpleGit().clone(input.source.url, fullPath);
    globalInstallStatus = await globalInstall(input.source.url);
  }

  const content = readFirstExisting(fullPath, SKILL_CONTENT_CANDIDATES);
  const enrichment = await enrich(config, 'skill', content || sourceValue);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'skill',
    name: input.name,
    sourceType,
    sourceValue,
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus,
  };

  return itemsRepo.create(newItem);
}
