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

export async function searchGitHub(
  query: string,
  itemType: DiscoverItemType,
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const topicFilters = TOPICS[itemType].map((topic) => `topic:${topic}`).join(' ');
  const q = query.trim() ? `${query.trim()} ${topicFilters}` : topicFilters;
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
