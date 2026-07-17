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

export async function enrichContent(
  config: SkillVaultConfig,
  itemType: string,
  content: string,
  fetchImpl: typeof fetch = fetch
): Promise<EnrichmentResult> {
  const prompt = buildEnrichmentPrompt(itemType, content);

  const ollamaRaw = await callOllama(config, prompt, fetchImpl);
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
