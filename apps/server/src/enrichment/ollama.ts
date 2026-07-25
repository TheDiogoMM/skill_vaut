import type { SkillVaultConfig } from '../config.js';

export async function callOllama(
  config: SkillVaultConfig,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
  format: 'json' | Record<string, unknown> = 'json'
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, prompt, stream: false, format }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}
