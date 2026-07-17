import { describe, it, expect } from 'vitest';
import { parseEnrichmentJson } from './parse.js';

describe('parseEnrichmentJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está o resultado:\n{"resumo": "Um resumo", "utilidade": "Serve para X", "categoria": "dev-tools", "tags": ["a", "b"]}\nFim.`;
    expect(parseEnrichmentJson(raw)).toEqual({
      summary: 'Um resumo',
      utility: 'Serve para X',
      category: 'dev-tools',
      tags: ['a', 'b'],
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseEnrichmentJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    expect(parseEnrichmentJson('{"resumo": "so isso"}')).toBeNull();
  });
});
