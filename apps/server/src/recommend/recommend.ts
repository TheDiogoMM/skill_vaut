import type { SkillVaultConfig } from '../config.js';
import type { ItemsRepository } from '../db/repositories/items.js';
import type { CategoriesRepository } from '../db/repositories/categories.js';
import type { Item, RecommendedItem, RecommendResult } from '../types.js';
import { callOllama } from '../enrichment/ollama.js';
import { callGemini } from '../enrichment/gemini.js';
import { buildRecommendPrompt, type CatalogItemForPrompt } from './prompt.js';
import { parseRecommendJson, type ParsedRecommendation } from './parse.js';
import { computeGlobalStatus } from '../global-status.js';

function toCatalogEntry(item: Item, categoryNameById: Map<number, string>): CatalogItemForPrompt {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    summary: item.summary,
    utility: item.utility,
    category: item.categoryId !== null ? categoryNameById.get(item.categoryId) ?? null : null,
    tags: item.tags,
  };
}

function resolveList(
  entries: ParsedRecommendation[],
  expectedType: Item['type'],
  itemsRepo: ItemsRepository,
  config: SkillVaultConfig
): RecommendedItem[] {
  const resolved: RecommendedItem[] = [];
  const seenIds = new Set<number>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) continue;
    const item = itemsRepo.getById(entry.id);
    if (!item || item.type !== expectedType) continue;
    seenIds.add(entry.id);
    resolved.push({ ...item, ...computeGlobalStatus(config, item), motivo: entry.motivo });
  }
  return resolved;
}

export async function getRecommendations(
  config: SkillVaultConfig,
  itemsRepo: ItemsRepository,
  categoriesRepo: CategoriesRepository,
  ideia: string,
  fetchImpl: typeof fetch = fetch
): Promise<RecommendResult | null> {
  const allItems = itemsRepo.list();
  if (allItems.length === 0) {
    return { skills: [], repos: [], mcps: [] };
  }

  const categoryNameById = new Map(categoriesRepo.list().map((c) => [c.id, c.name]));
  const catalog = allItems.map((item) => toCatalogEntry(item, categoryNameById));
  const prompt = buildRecommendPrompt(ideia, catalog);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl);
  let parsed = ollamaRaw ? parseRecommendJson(ollamaRaw) : null;

  if (!parsed) {
    const geminiRaw = await callGemini(config, prompt, fetchImpl);
    parsed = geminiRaw ? parseRecommendJson(geminiRaw) : null;
  }

  if (!parsed) return null;

  return {
    skills: resolveList(parsed.skills, 'skill', itemsRepo, config),
    repos: resolveList(parsed.repos, 'repo', itemsRepo, config),
    mcps: resolveList(parsed.mcps, 'mcp', itemsRepo, config),
  };
}
