import fs from 'node:fs';
import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository, NewItem } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import { resolveUniqueFile } from '../slug.js';
import { enrichContent } from '../enrichment/enrich.js';
import type { Item } from '../types.js';

const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization|bearer/i;

function redactSensitiveQueryParams(text: string): string {
  try {
    const url = new URL(text);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, '<REDACTED>');
        changed = true;
      }
    }
    return changed ? url.toString() : text;
  } catch {
    return text;
  }
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '<REDACTED>' : redactSecrets(val);
    }
    return result;
  }
  if (typeof value === 'string') {
    return redactSensitiveQueryParams(value);
  }
  return value;
}

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
  const redactedConfig = redactSecrets(input.config) as Record<string, unknown>;
  const { fullPath } = resolveUniqueFile(config.mcpsDir, input.name, '.json');
  fs.writeFileSync(fullPath, JSON.stringify(redactedConfig, null, 2), 'utf-8');

  const content = `${input.description ?? ''}\n${JSON.stringify(redactedConfig, null, 2)}`;
  const enrichment = await enrich(config, 'mcp', content);
  const category = enrichment.category ? categoriesRepo.findOrCreate(enrichment.category) : null;

  const newItem: NewItem = {
    type: 'mcp',
    name: input.name,
    sourceType: 'manual',
    sourceValue: JSON.stringify(redactedConfig),
    localPath: fullPath,
    categoryId: category ? category.id : null,
    summary: enrichment.summary || null,
    utility: enrichment.utility || null,
    tags: enrichment.tags,
    enrichmentSource: enrichment.source,
    globalInstallStatus: null,
    downloadStatus: null,
  };

  return itemsRepo.create(newItem);
}
