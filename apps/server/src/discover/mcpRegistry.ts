import type { DiscoverResult } from './types.js';

const REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';

interface McpRegistryServer {
  name: string;
  description?: string;
  repository?: { url?: string };
}

interface McpRegistryEntry {
  server: McpRegistryServer;
}

interface McpRegistryResponse {
  servers?: McpRegistryEntry[];
}

export async function searchMcpRegistry(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  // The registry's `search` param only substring-matches against `name`, not `description`.
  // Registry names follow a reverse-DNS/hyphenated convention (e.g. "io.example/pdf-tools")
  // with no spaces, so natural multi-word queries (e.g. "pdf tools") will rarely match. This
  // is a limitation of the live API's own search semantics, not something we work around here.
  const url = query.trim()
    ? `${REGISTRY_BASE_URL}/v0.1/servers?search=${encodeURIComponent(query.trim())}`
    : `${REGISTRY_BASE_URL}/v0.1/servers`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) return [];
    const data = (await response.json()) as McpRegistryResponse;
    return (data.servers ?? []).map(({ server }) => ({
      source: 'mcp_registry' as const,
      itemType: 'mcp' as const,
      name: server.name,
      description: server.description ?? null,
      url: server.repository?.url ?? `${REGISTRY_BASE_URL}/servers/${encodeURIComponent(server.name)}`,
      rating: { kind: 'official' as const, value: null },
      verified: true,
    }));
  } catch {
    return [];
  }
}
