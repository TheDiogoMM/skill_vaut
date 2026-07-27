import type { SkillVaultConfig } from '../config.js';
import type { DiscoverItemType, DiscoverResult } from './types.js';
import { searchGitHub } from './github.js';
import { searchMcpRegistry } from './mcpRegistry.js';
import { searchSmithery } from './smithery.js';

const ALL_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

async function discoverForType(
  query: string,
  itemType: DiscoverItemType,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch
): Promise<DiscoverResult[]> {
  const sources: Promise<DiscoverResult[]>[] = [searchGitHub(query, itemType, config, fetchImpl)];
  if (itemType === 'mcp') {
    sources.push(searchMcpRegistry(query, fetchImpl), searchSmithery(query, config, fetchImpl));
  }
  const results = await Promise.all(sources);
  return results.flat();
}

export async function discoverItems(
  query: string,
  itemType: DiscoverItemType | undefined,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const types = itemType ? [itemType] : ALL_TYPES;
  const perType = await Promise.all(types.map((type) => discoverForType(query, type, config, fetchImpl)));
  return perType.flat();
}
