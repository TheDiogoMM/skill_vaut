import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { callOllama } from './ollama.js';

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('callOllama', () => {
  it('requests JSON-formatted output from Ollama to avoid malformed/off-schema responses', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    let capturedBody: Record<string, unknown> | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return fakeResponse({ response: '{}' });
    }) as typeof fetch;

    await callOllama(config, 'algum prompt', fetchImpl);

    expect(capturedBody).toMatchObject({
      model: config.ollamaModel,
      prompt: 'algum prompt',
      stream: false,
      format: 'json',
    });
  });

  it('still returns the response text when the call succeeds', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse({ response: '{"a":1}' })) as typeof fetch;

    const result = await callOllama(config, 'prompt', fetchImpl);

    expect(result).toBe('{"a":1}');
  });

  it('returns null when the request fails', async () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const fetchImpl = (async () => fakeResponse(null, false)) as typeof fetch;

    const result = await callOllama(config, 'prompt', fetchImpl);

    expect(result).toBeNull();
  });
});
