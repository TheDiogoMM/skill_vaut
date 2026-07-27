import type { DiscoverResult } from './types.js';

const REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';

interface McpRegistryServer {
  name: string;
  description?: string;
  repository?: { url?: string };
}

interface McpRegistryResponse {
  servers?: McpRegistryServer[];
}

export async function searchMcpRegistry(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const url = query.trim()
    ? `${REGISTRY_BASE_URL}/v0.1/servers?search=${encodeURIComponent(query.trim())}`
    : `${REGISTRY_BASE_URL}/v0.1/servers`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) return [];
    const data = (await response.json()) as McpRegistryResponse;
    return (data.servers ?? []).map((server) => ({
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
