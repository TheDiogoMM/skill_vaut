import { describe, it, expect } from 'vitest';
import { buildRecommendPrompt, RECOMMEND_JSON_SCHEMA } from './prompt.js';

describe('buildRecommendPrompt', () => {
  it('includes the idea and each catalog item with its id', () => {
    const prompt = buildRecommendPrompt('app de leitura de PDFs', [
      {
        id: 3,
        type: 'skill',
        name: 'PDF Parser',
        summary: 'Extrai texto',
        utility: 'Leitura',
        category: 'dev-tools',
        tags: ['pdf'],
      },
    ]);

    expect(prompt).toContain('app de leitura de PDFs');
    expect(prompt).toContain('id=3');
    expect(prompt).toContain('PDF Parser');
  });

  it('marks the catalog as empty when there are no items', () => {
    const prompt = buildRecommendPrompt('ideia', []);
    expect(prompt).toContain('(catálogo vazio)');
  });

  it('asks for a short termo_busca in the prompt text', () => {
    const prompt = buildRecommendPrompt('ideia', []);
    expect(prompt).toContain('termo_busca');
  });

  it('includes termo_busca as a required string field in the JSON schema', () => {
    expect(RECOMMEND_JSON_SCHEMA.required).toContain('termo_busca');
    expect(RECOMMEND_JSON_SCHEMA.properties.termo_busca).toEqual({ type: 'string' });
  });
});
