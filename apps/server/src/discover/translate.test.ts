import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { translateDescriptions } from './translate.js';
import type { DiscoverResult } from './types.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function sampleResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/repo',
    description: 'An awesome tool',
    url: 'https://github.com/someone/repo',
    rating: { kind: 'stars', value: 10 },
    verified: false,
    ...overrides,
  };
}

describe('translateDescriptions', () => {
  it('replaces each description with its translation, preserving order and other fields', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [
      sampleResult({ url: 'https://a', description: 'An awesome tool' }),
      sampleResult({ url: 'https://b', description: 'Handles PDFs' }),
    ];
    const fetchImpl = (async () =>
      fakeResponse({ response: JSON.stringify({ traducoes: ['Uma ferramenta incrível', 'Lida com PDFs'] }) })) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated[0]).toEqual({ ...results[0], description: 'Uma ferramenta incrível' });
    expect(translated[1]).toEqual({ ...results[1], description: 'Lida com PDFs' });
  });

  it('short-circuits without calling the LLM when every result has a null description', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [sampleResult({ url: 'https://a', description: null })];
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return fakeResponse({ response: JSON.stringify({ traducoes: [] }) });
    }) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated).toEqual(results);
    expect(called).toBe(false);
  });

  it('returns an empty array unchanged without calling the LLM', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;

    const translated = await translateDescriptions([], config, fetchImpl);

    expect(translated).toEqual([]);
  });

  it('falls back to Gemini when Ollama fails', async () => {
    const config = loadConfig({ GEMINI_API_KEY: 'key' } as NodeJS.ProcessEnv);
    const results = [sampleResult({ description: 'Handles PDFs' })];
    const fetchImpl = (async (url: string) => {
      if (url.includes('generativelanguage')) {
        return fakeResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ traducoes: ['Lida com PDFs'] }) }] } }],
        });
      }
      return fakeResponse(null, false);
    }) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated[0].description).toBe('Lida com PDFs');
  });

  it('keeps the original descriptions when both providers fail', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [sampleResult({ description: 'Handles PDFs' })];
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated).toEqual(results);
  });

  it('strips a leaked leading number (e.g. "1. ") from a translated string', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [sampleResult({ description: 'Handles PDFs' })];
    const fetchImpl = (async () =>
      fakeResponse({ response: JSON.stringify({ traducoes: ['1. Lida com PDFs'] }) })) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated[0].description).toBe('Lida com PDFs');
  });

  it('only sends non-null descriptions to the LLM and leaves null ones untouched, in a mixed batch', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [
      sampleResult({ url: 'https://a', description: null }),
      sampleResult({ url: 'https://b', description: 'Handles PDFs' }),
    ];
    let capturedPrompt = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedPrompt = JSON.parse(init!.body as string).prompt as string;
      return fakeResponse({ response: JSON.stringify({ traducoes: ['Lida com PDFs'] }) });
    }) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(capturedPrompt).toContain('Handles PDFs');
    expect(capturedPrompt).not.toContain('1. Handles PDFs\n2.');
    expect(translated[0]).toEqual(results[0]);
    expect(translated[1].description).toBe('Lida com PDFs');
  });

  it('keeps the original descriptions when the LLM returns a mismatched translation count', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const results = [sampleResult({ description: 'Handles PDFs' }), sampleResult({ url: 'https://b', description: 'Another one' })];
    const fetchImpl = (async () =>
      fakeResponse({ response: JSON.stringify({ traducoes: ['Só uma tradução'] }) })) as typeof fetch;

    const translated = await translateDescriptions(results, config, fetchImpl);

    expect(translated).toEqual(results);
  });
});
