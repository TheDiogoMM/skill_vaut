import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { enrichContent } from './enrich.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const validJson = JSON.stringify({
  resumo: 'Resumo',
  utilidade: 'Utilidade',
  categoria: 'dev-tools',
  tags: ['a'],
});

describe('enrichContent', () => {
  it('uses the Ollama result when available', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse({ response: validJson })) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result.source).toBe('ollama');
    expect(result.category).toBe('dev-tools');
  });

  it('falls back to Gemini when Ollama fails and a Gemini key is set', async () => {
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const fetchImpl = (async (url: string) => {
      if (url.includes('generativelanguage')) {
        return fakeResponse({ candidates: [{ content: { parts: [{ text: validJson }] } }] });
      }
      return fakeResponse(null, false);
    }) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result.source).toBe('gemini');
  });

  it('falls back to manual when both Ollama and Gemini fail', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const result = await enrichContent(config, 'repo', 'conteúdo', fetchImpl);
    expect(result).toEqual({ summary: '', utility: '', category: '', tags: [], source: 'manual' });
  });
});
