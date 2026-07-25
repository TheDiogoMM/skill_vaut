import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { loadConfig } from '../config.js';
import { ItemsRepository, type NewItem } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { getRecommendations } from './recommend.js';
import type { RecommendedItem } from '../types.js';
import type { GlobalStatus } from '../global-status.js';

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

describe('getRecommendations', () => {
  let db: Database.Database;
  let itemsRepo: ItemsRepository;
  let categoriesRepo: CategoriesRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    itemsRepo = new ItemsRepository(db);
    categoriesRepo = new CategoriesRepository(db);
  });

  it('returns empty blocks without calling the LLM when the catalog is empty', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'ideia', fetchImpl);
    expect(result).toEqual({ skills: [], repos: [], mcps: [] });
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
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, motivo: 'Ajuda a extrair texto de PDFs' },
    ]);
    expect(result?.repos).toEqual([
      { ...repoItem, installedGlobally: null, hasRedactedSecret: null, motivo: 'Bom ponto de partida' },
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
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    expect(result?.skills).toEqual([
      { ...skill, installedGlobally: false, hasRedactedSecret: null, motivo: 'primeira menção' },
    ]);
  });

  it('includes computed global status fields on resolved items', async () => {
    const skill = itemsRepo.create(baseNewItem({ type: 'skill', name: 'PDF Parser' }));

    const config = loadConfig({} as NodeJS.ProcessEnv);
    const raw = JSON.stringify({
      skills: [{ id: skill.id, motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
    });
    const fetchImpl = (async () => fakeResponse({ response: raw })) as typeof fetch;

    const result = await getRecommendations(config, itemsRepo, categoriesRepo, 'app de PDFs', fetchImpl);

    const resolvedSkill = result?.skills[0] as (RecommendedItem & GlobalStatus) | undefined;

    expect(resolvedSkill).toHaveProperty('installedGlobally');
    expect(resolvedSkill).toHaveProperty('hasRedactedSecret');
    expect(resolvedSkill?.installedGlobally).toBe(false);
  });

  it('falls back to Gemini when Ollama fails', async () => {
    const skill = itemsRepo.create(baseNewItem());
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const raw = JSON.stringify({ skills: [{ id: skill.id, motivo: 'via gemini' }], repos: [], mcps: [] });
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
});
