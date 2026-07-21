import { describe, it, expect } from 'vitest';
import { parseRecommendJson } from './parse.js';

describe('parseRecommendJson', () => {
  it('extracts a valid JSON block surrounded by prose', () => {
    const raw = `Aqui está:\n{"skills":[{"id":1,"motivo":"Serve para X"}],"repos":[],"mcps":[{"id":5,"motivo":"Y"}]}\nFim.`;
    expect(parseRecommendJson(raw)).toEqual({
      skills: [{ id: 1, motivo: 'Serve para X' }],
      repos: [],
      mcps: [{ id: 5, motivo: 'Y' }],
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseRecommendJson('não há JSON aqui')).toBeNull();
  });

  it('returns null when a list entry is missing motivo', () => {
    expect(parseRecommendJson('{"skills":[{"id":1}],"repos":[],"mcps":[]}')).toBeNull();
  });

  it('returns null when a required array is missing', () => {
    expect(parseRecommendJson('{"skills":[],"repos":[]}')).toBeNull();
  });

  it('returns null when id is not a number', () => {
    expect(parseRecommendJson('{"skills":[{"id":"1","motivo":"x"}],"repos":[],"mcps":[]}')).toBeNull();
  });
});
