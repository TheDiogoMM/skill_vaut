import type { Item } from '../types.js';

export interface CatalogItemForPrompt {
  id: number;
  type: Item['type'];
  name: string;
  summary: string | null;
  utility: string | null;
  category: string | null;
  tags: string[];
}

export function buildRecommendPrompt(ideia: string, catalog: CatalogItemForPrompt[]): string {
  const catalogLines = catalog
    .map(
      (item) =>
        `- id=${item.id} tipo=${item.type} nome="${item.name}" categoria="${item.category ?? 'sem categoria'}" resumo="${item.summary ?? ''}" utilidade="${item.utility ?? ''}" tags=[${item.tags.join(', ')}]`
    )
    .join('\n');

  return `Você é um assistente que recomenda itens de um catálogo pessoal de skills, repositórios de código, MCPs (Model Context Protocol servers) e plugins do Claude Code para uma ideia de projeto.

Ideia do usuário: "${ideia}"

Catálogo disponível (só pode recomendar itens desta lista, citando o id exato):
${catalogLines || '(catálogo vazio)'}

Responda APENAS com um JSON no formato:
{"skills": [{"id": N, "motivo": "por que esse item ajuda nessa ideia"}], "repos": [...], "mcps": [...], "plugins": [...]}

Cite apenas ids que aparecem na lista acima. Se nada do catálogo servir para um tipo, retorne um array vazio para esse tipo.`;
}

// Passed as Ollama's `format` field (grammar-constrained decoding) so small
// local models are forced to include the required "motivo" key on every
// entry — format:"json" alone only guarantees valid JSON syntax, not that
// the model actually follows this exact shape.
const RECOMMENDATION_LIST_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { id: { type: 'integer' }, motivo: { type: 'string' } },
    required: ['id', 'motivo'],
  },
};

export const RECOMMEND_JSON_SCHEMA = {
  type: 'object',
  properties: {
    skills: RECOMMENDATION_LIST_SCHEMA,
    repos: RECOMMENDATION_LIST_SCHEMA,
    mcps: RECOMMENDATION_LIST_SCHEMA,
    plugins: RECOMMENDATION_LIST_SCHEMA,
  },
  required: ['skills', 'repos', 'mcps', 'plugins'],
};
