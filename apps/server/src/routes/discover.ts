import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { discoverItems } from '../discover/aggregate.js';
import type { DiscoverItemType } from '../discover/types.js';

const VALID_TYPES: DiscoverItemType[] = ['skill', 'mcp', 'plugin'];

export function discoverRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    app.get('/api/discover', async (request, reply) => {
      const { q, type } = request.query as { q?: string; type?: string };

      if (type !== undefined && !VALID_TYPES.includes(type as DiscoverItemType)) {
        return reply.status(400).send({ error: `unsupported type: ${type}` });
      }

      return discoverItems(q ?? '', type as DiscoverItemType | undefined, config);
    });
  };
}
