export interface ParsedRecommendation {
  id: number;
  motivo: string;
}

export interface ParsedRecommendResult {
  skills: ParsedRecommendation[];
  repos: ParsedRecommendation[];
  mcps: ParsedRecommendation[];
  plugins: ParsedRecommendation[];
}

function parseList(value: unknown): ParsedRecommendation[] | null {
  if (!Array.isArray(value)) return null;
  const result: ParsedRecommendation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const id = (entry as Record<string, unknown>).id;
    const motivo = (entry as Record<string, unknown>).motivo;
    if (typeof id !== 'number' || typeof motivo !== 'string') return null;
    result.push({ id, motivo });
  }
  return result;
}

export function parseRecommendJson(raw: string): ParsedRecommendResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const skills = parseList(parsed.skills);
    const repos = parseList(parsed.repos);
    const mcps = parseList(parsed.mcps);
    const plugins = parseList(parsed.plugins);
    if (!skills || !repos || !mcps || !plugins) return null;
    return { skills, repos, mcps, plugins };
  } catch {
    return null;
  }
}
