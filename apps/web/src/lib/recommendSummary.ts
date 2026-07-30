import type { RecommendedItem, RecommendResult, DiscoverResult } from '../types.js';

const CATALOG_SECTIONS: { key: keyof Pick<RecommendResult, 'skills' | 'repos' | 'mcps' | 'plugins'>; title: string }[] = [
  { key: 'skills', title: 'Skills:' },
  { key: 'repos', title: 'Repos:' },
  { key: 'mcps', title: 'MCPs:' },
  { key: 'plugins', title: 'Plugins:' },
];

function catalogLine(item: RecommendedItem): string {
  return `- ${item.name} — ${item.localPath}`;
}

function externalLine(result: DiscoverResult): string {
  return `- ${result.name} — ${result.url}`;
}

export function buildRecommendSummary(ideia: string, result: RecommendResult): string {
  const lines: string[] = [`Recomendações do SkillVault para: "${ideia}"`];

  for (const section of CATALOG_SECTIONS) {
    const items = result[section.key];
    if (items.length === 0) continue;
    lines.push('', section.title, ...items.map(catalogLine));
  }

  if (result.externalSuggestions.length > 0) {
    lines.push('', 'Sugestões externas (não instaladas):', ...result.externalSuggestions.map(externalLine));
  }

  return lines.join('\n');
}
