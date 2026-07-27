import type { SkillVaultConfig } from '../config.js';
import type { DiscoverResult } from './types.js';

interface SmitheryServer {
  qualifiedName: string;
  displayName?: string;
  description?: string;
  useCount?: number;
  verified?: boolean;
  // The Smithery API exposes the server's link as a flat `homepage` string field,
  // not a nested `repository.url` field. Confirmed against Smithery's own docs
  // (https://smithery.ai/docs/concepts/registry_search_servers), which enumerate
  // exactly 15 fields per server entry with no `repository` field present.
  homepage?: string;
}

interface SmitheryResponse {
  servers?: SmitheryServer[];
}

export async function searchSmithery(
  query: string,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  if (!config.smitheryApiKey) return [];

  const url = query.trim()
    ? `https://api.smithery.ai/servers?q=${encodeURIComponent(query.trim())}`
    : 'https://api.smithery.ai/servers';

  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${config.smitheryApiKey}` },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as SmitheryResponse;
    return (data.servers ?? []).map((server) => ({
      source: 'smithery' as const,
      itemType: 'mcp' as const,
      name: server.displayName ?? server.qualifiedName,
      description: server.description ?? null,
      url: server.homepage ?? `https://smithery.ai/server/${encodeURIComponent(server.qualifiedName)}`,
      rating: { kind: 'use_count' as const, value: server.useCount ?? null },
      verified: server.verified ?? false,
    }));
  } catch {
    return [];
  }
}
