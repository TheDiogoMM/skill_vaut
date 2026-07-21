import { describe, it, expect } from 'vitest';
import { buildRecommendPrompt } from './prompt.js';

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
});
