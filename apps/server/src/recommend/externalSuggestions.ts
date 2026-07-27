import type { SkillVaultConfig } from '../config.js';
import type { Item } from '../types.js';
import { discoverItems } from '../discover/aggregate.js';
import type { DiscoverResult } from '../discover/types.js';

const MAX_SUGGESTIONS = 5;

export async function resolveExternalSuggestions(
  termoBusca: string,
  existingItems: Item[],
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const known = new Set(existingItems.map((item) => item.sourceValue));
  const results = await discoverItems(termoBusca, undefined, config, fetchImpl);
  return results
    .filter((result) => !known.has(result.url))
    .sort((a, b) => (b.rating.value ?? 0) - (a.rating.value ?? 0))
    .slice(0, MAX_SUGGESTIONS);
}
