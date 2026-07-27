import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { discoverItems } from '../discover/aggregate.js';
import type { DiscoverItemType } from '../discover/types.js';

const VALID_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

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
  };
}
