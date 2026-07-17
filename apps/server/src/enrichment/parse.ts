export interface ParsedEnrichment {
  summary: string;
  utility: string;
  category: string;
  tags: string[];
}

export function parseEnrichmentJson(raw: string): ParsedEnrichment | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    const summary = typeof parsed.resumo === 'string' ? parsed.resumo : null;
    const utility = typeof parsed.utilidade === 'string' ? parsed.utilidade : null;
    const category = typeof parsed.categoria === 'string' ? parsed.categoria : null;
    const tags = Array.isArray(parsed.tags) ? parsed.tags : null;

    if (!summary || !utility || !category || !tags) return null;
    if (!tags.every((t) => typeof t === 'string')) return null;

    return { summary, utility, category, tags: tags as string[] };
  } catch {
    return null;
  }
}
