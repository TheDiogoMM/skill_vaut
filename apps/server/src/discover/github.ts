import type { SkillVaultConfig } from '../config.js';
import type { DiscoverItemType, DiscoverResult } from './types.js';

const TOPICS: Record<DiscoverItemType, string[]> = {
  skill: ['claude-skill', 'claude-skills'],
  mcp: ['mcp-server', 'model-context-protocol'],
  plugin: ['claude-code-plugin', 'claude-plugin'],
};

interface GitHubRepoItem {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
}

interface GitHubSearchResponse {
  items?: GitHubRepoItem[];
}

async function searchGitHubByTopic(
  query: string,
  itemType: DiscoverItemType,
  topic: string,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch
): Promise<DiscoverResult[]> {
  const topicFilter = `topic:${topic}`;
  const q = query.trim() ? `${query.trim()} ${topicFilter}` : topicFilter;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}),
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as GitHubSearchResponse;
    return (data.items ?? []).map((repo) => ({
      source: 'github' as const,
      itemType,
      name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      rating: { kind: 'stars' as const, value: repo.stargazers_count },
      verified: false,
    }));
  } catch {
    return [];
  }
}

export async function searchGitHub(
  query: string,
  itemType: DiscoverItemType,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const resultsByTopic = await Promise.all(
    TOPICS[itemType].map((topic) => searchGitHubByTopic(query, itemType, topic, config, fetchImpl))
  );

  const byUrl = new Map<string, DiscoverResult>();
  for (const results of resultsByTopic) {
    for (const result of results) {
      if (!byUrl.has(result.url)) byUrl.set(result.url, result);
    }
  }

  return Array.from(byUrl.values()).sort((a, b) => (b.rating.value ?? 0) - (a.rating.value ?? 0));
}
