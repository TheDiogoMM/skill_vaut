import type { SkillVaultConfig } from '../config.js';
import type { EnrichmentResult } from '../types.js';
import { callOllama } from './ollama.js';
import { callGemini } from './gemini.js';
import { parseEnrichmentJson } from './parse.js';

export function buildEnrichmentPrompt(itemType: string, content: string): string {
  return `Você está catalogando um item do tipo "${itemType}" para uma biblioteca pessoal de skills, repositórios e MCPs.
Analise o conteúdo abaixo e responda APENAS com um JSON no formato:
{"resumo": "1-2 frases", "utilidade": "para que serve", "categoria": "uma categoria curta (ex: dev-tools, automação, design, dados, IA/agents, docs, produtividade, integrações)", "tags": ["tag1", "tag2"]}

Conteúdo:
"""
${content.slice(0, 6000)}
"""`;
}

// Passed as Ollama's `format` field (grammar-constrained decoding) so small
// local models reliably include every required key instead of dropping ones
// they consider optional (format:"json" alone only guarantees valid JSON
// syntax, not that this exact shape is followed).
export const ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    utilidade: { type: 'string' },
    categoria: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'utilidade', 'categoria', 'tags'],
};

export async function enrichContent(
  config: SkillVaultConfig,
  itemType: string,
  content: string,
  fetchImpl: typeof fetch = fetch
): Promise<EnrichmentResult> {
  const prompt = buildEnrichmentPrompt(itemType, content);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl, ENRICHMENT_JSON_SCHEMA);
  if (ollamaRaw) {
    const parsed = parseEnrichmentJson(ollamaRaw);
    if (parsed) return { ...parsed, source: 'ollama' };
  }

  const geminiRaw = await callGemini(config, prompt, fetchImpl);
  if (geminiRaw) {
    const parsed = parseEnrichmentJson(geminiRaw);
    if (parsed) return { ...parsed, source: 'gemini' };
  }

  return { summary: '', utility: '', category: '', tags: [], source: 'manual' };
}
