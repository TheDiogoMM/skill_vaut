import type { SkillVaultConfig } from '../config.js';
import { callOllama } from '../enrichment/ollama.js';
import { callGemini } from '../enrichment/gemini.js';
import type { DiscoverResult } from './types.js';

// Passed as Ollama's `format` field (grammar-constrained decoding) so small
// local models reliably return exactly one string per input description,
// same rationale as ENRICHMENT_JSON_SCHEMA/RECOMMEND_JSON_SCHEMA.
const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    traducoes: { type: 'array', items: { type: 'string' } },
  },
  required: ['traducoes'],
};

function buildTranslationPrompt(descriptions: string[]): string {
  const numbered = descriptions.map((description, index) => `${index + 1}. ${description}`).join('\n');
  return `Traduza cada uma das descrições numeradas abaixo para português do Brasil, mantendo o sentido técnico e sem adicionar comentários extras.

${numbered}

Responda APENAS com um JSON no formato: {"traducoes": ["tradução 1", "tradução 2", ...]}, na mesma ordem e quantidade das descrições acima.`;
}

// Some models echo the "N. " list marker from the prompt back into the
// translated string itself despite being asked for a bare JSON array —
// strip a leaked leading marker defensively rather than let it leak into
// the description shown to the user.
function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\d+[.)-]\s*/, '');
}

function parseTranslations(raw: string, expectedCount: number): string[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const traducoes = parsed.traducoes;
    if (!Array.isArray(traducoes) || traducoes.length !== expectedCount) return null;
    if (!traducoes.every((t) => typeof t === 'string')) return null;
    return (traducoes as string[]).map(stripLeadingNumber);
  } catch {
    return null;
  }
}

export async function translateDescriptions(
  results: DiscoverResult[],
  config: SkillVaultConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DiscoverResult[]> {
  const descriptions = results
    .map((result) => result.description)
    .filter((description): description is string => description !== null);

  if (descriptions.length === 0) return results;

  const prompt = buildTranslationPrompt(descriptions);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl, TRANSLATION_SCHEMA);
  let translations = ollamaRaw ? parseTranslations(ollamaRaw, descriptions.length) : null;

  if (!translations) {
    const geminiRaw = await callGemini(config, prompt, fetchImpl);
    translations = geminiRaw ? parseTranslations(geminiRaw, descriptions.length) : null;
  }

  if (!translations) return results;

  let index = 0;
  const finalTranslations = translations;
  return results.map((result) => {
    if (result.description === null) return result;
    return { ...result, description: finalTranslations[index++] };
  });
}
