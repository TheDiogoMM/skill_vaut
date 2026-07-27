import type { DiscoverResult } from './types.js';

const REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';

interface McpRegistryServer {
  name: string;
  description?: string;
  repository?: { url?: string };
}

interface McpRegistryOfficialMeta {
  isLatest?: boolean;
}

interface McpRegistryEntryMeta {
  'io.modelcontextprotocol.registry/official'?: McpRegistryOfficialMeta;
}

interface McpRegistryEntry {
  server: McpRegistryServer;
  _meta?: McpRegistryEntryMeta;
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
    // The registry returns one entry per published version of a server, not one per server.
    // Only keep the latest version of each so a server doesn't appear multiple times in
    // results. If the isLatest flag is missing/malformed for an entry, default to treating
    // it as latest rather than crashing or silently dropping it.
    const latestEntries = (data.servers ?? []).filter(
      (entry) => entry._meta?.['io.modelcontextprotocol.registry/official']?.isLatest !== false
    );
    return latestEntries.map(({ server }) => ({
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
