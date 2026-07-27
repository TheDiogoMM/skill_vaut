import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { loadConfig } from '../config.js';
import { ItemsRepository, type NewItem } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { getRecommendations } from './recommend.js';
import type { RecommendedItem } from '../types.js';
import type { GlobalStatus } from '../global-status.js';
import type { DiscoverResult } from '../discover/types.js';

vi.mock('../discover/aggregate.js', () => ({ discoverItems: vi.fn() }));

import { discoverItems } from '../discover/aggregate.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function baseNewItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    type: 'skill',
    name: 'PDF Parser',
    sourceType: 'manual',
    sourceValue: 'x',
    localPath: '/skillvault/skills/pdf-parser',
    categoryId: null,
    summary: 'Extrai texto de PDFs',
    utility: 'Útil para leitura de documentos',
    tags: ['pdf'],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    ...overrides,
  };
}

function fakeDiscoverResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/pdf-tool',
    description: null,
    url: 'https://github.com/someone/pdf-tool',
    rating: { kind: 'stars', value: 10 },
    verified: false,
    ...overrides,
  };
}

describe('getRecommendations', () => {
  let db: Database.Database;
  let itemsRepo: ItemsRepository;
  let categoriesRepo: CategoriesRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    itemsRepo = new ItemsRepository(db);
    categoriesRepo = new CategoriesRepository(db);
    vi.mocked(discoverItems).mockResolvedValue([]);
  });

  it('returns empty blocks without calling the LLM when the catalog is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toEqual({ skills: [], repos: [], mcps: [], plugins: [], externalSuggestions: [] });
    expect(discoverItems).not.toHaveBeenCalled();
  });

  it('resolves ids from the Ollama response into full items, discarding unknown ids and wrong-type ids', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));
    const repoItem = itemsRepo.create(baseNewItem({ type: 'repo', name: 'fastify-starter' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [
        { id: skill.id, motivo: 'Ajuda a extrair texto de PDFs' },
        { id: 999999, motivo: 'id inexistente' },
        { id: repoItem.id, motivo: 'tipo errado, deveria ser descartado' },
      ],
      repos: [{ id: repoItem.id, motivo: 'Bom ponto de partida' }],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      {
        ...skill,
        installedGlobally: false,
        hasRedactedSecret: null,
        installedPath: null,
        motivo: 'Ajuda a extrair texto de PDFs',
      },
    ]);
    expect(result?.repos).toEqual([
      { ...repoItem, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Bom ponto de partida' },
    ]);
    expect(result?.mcps).toEqual([]);
  });

  it('deduplicates repeated ids cited by the LLM within the same block', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [
        { id: skill.id, motivo: 'primeira menção' },
        { id: skill.id, motivo: 'segunda menção, deveria ser descartada' },
      ],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, installedPath: null, motivo: 'primeira menção' },
    ]);
  });

  it('includes computed global status fields on resolved items', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    const resolvedSkill = result?.skills[0] as (RecommendedItem & GlobalStatus) | undefined;

    expect(resolvedSkill).toHaveProperty('installedGlobally');
    expect(resolvedSkill).toHaveProperty('hasRedactedSecret');
    expect(resolvedSkill).toHaveProperty('installedPath');
    expect(resolvedSkill?.installedGlobally).toBe(false);
  });

  it('falls back to Gemini when Ollama fails', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'via gemini' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async (url: string) => {
      if (url.includes('generativelanguage')) {
        return fakeResponse({ candidates: [{ content: { parts: [{ text: raw }] } }] });
      }
      return fakeResponse(null, false);
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result?.skills[0]?.motivo).toBe('via gemini');
  });

  it('returns null when both Ollama and Gemini fail', async () => {
    itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toBeNull();
  });

  it('returns null when termo_busca is missing from the LLM response', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({ skills: [{ id: skill.id, motivo: 'x' }], repos: [], mcps: [], plugins: [] });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves plugin ids into full items, same as the other three buckets', async () => {
    const plugin = itemsRepo.create(baseNewItem({ type: 'plugin', name: 'My Plugin' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [{ id: plugin.id, motivo: 'Resolve isso' }],
      termo_busca: 'plugin',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);

    expect(result?.plugins).toEqual([
      { ...plugin, installedGlobally: null, hasRedactedSecret: null, installedPath: null, motivo: 'Resolve isso' },
    ]);
  });

  it('populates externalSuggestions from discoverItems, using the LLM-provided termo_busca', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'leitor de pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;
    vi.mocked(discoverItems).mockResolvedValue([fakeDiscoverResult()]);

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(discoverItems).toHaveBeenCalledWith('leitor de pdf', undefined, config, fetchImpl);
    expect(result?.externalSuggestions).toEqual([fakeDiscoverResult()]);
  });

  it('excludes an external suggestion whose url matches an item already in the catalog', async () => {
    const skill = itemsRepo.create(baseNewItem({ sourceValue: 'https://github.com/someone/pdf-tool' }));
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      termo_busca: 'pdf',
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;
    vi.mocked(discoverItems).mockResolvedValue([fakeDiscoverResult({ url: 'https://github.com/someone/pdf-tool' })]);

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.externalSuggestions).toEqual([]);
  });
});
