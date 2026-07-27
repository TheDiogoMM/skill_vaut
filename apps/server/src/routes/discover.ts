import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { discoverItems } from '../discover/aggregate.js';
import { translateDescriptions } from '../discover/translate.js';
import type { DiscoverItemType, DiscoverResult } from '../discover/types.js';

const VALID_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

// Only checks what translateDescriptions actually reads (`description`) —
// enough to prevent a malformed element from crashing the route with a 500
// instead of a clean 400, without re-validating the whole DiscoverResult shape.
function looksLikeDiscoverResult(value: unknown): value is DiscoverResult {
  if (!value || typeof value !== 'object') return false;
  const description = (value as Record<string, unknown>).description;
  return description === null || typeof description === 'string';
}

export function discoverRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    app.get('/api/discover', async (request, reply) => {
      const { q, type } = request.query as { q?: string | string[]; type?: string };

      if (type !== undefined && !VALID_TYPES.includes(type as DiscoverItemType)) {
        return reply.status(400).send({ error: `unsupported type: ${type}` });
      }

      // Fastify returns an array when a query param is repeated (e.g. ?q=a&q=b).
      // Normalize to a plain string so discoverItems/downstream `.trim()` calls never see an array.
      const rawQuery = Array.isArray(q) ? q[0] : q;

      return discoverItems(rawQuery ?? '', type as DiscoverItemType | undefined, config);
    });

    // Kept separate from GET /api/discover so the main search stays fast: the
    // frontend shows results immediately (English descriptions) and calls
    // this endpoint afterward to fill in translations without blocking the
    // initial render.
    app.post('/api/discover/translate', async (request, reply) => {
      if (!Array.isArray(request.body) || !request.body.every(looksLikeDiscoverResult)) {
        return reply.status(400).send({ error: 'body must be an array of discover results' });
      }

      return translateDescriptions(request.body, config);
    });
  };
}
