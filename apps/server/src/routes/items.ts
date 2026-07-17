import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ingestRepo } from '../ingestion/repo.js';
import { regenerateIndex } from '../index/generate.js';

export function itemsRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);

    function regenerate() {
      regenerateIndex(itemsRepo, categoriesRepo, config.indexJsonPath, config.indexMdPath);
    }

    app.post('/api/items', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const type = body.type as string;
      const name = body.name as string;

      if (!type || !name) {
        return reply.status(400).send({ error: 'type and name are required' });
      }

      try {
        if (type === 'repo') {
          const url = body.url as string | undefined;
          if (!url) return reply.status(400).send({ error: 'url is required for type=repo' });
          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { name, url });
          regenerate();
          return reply.status(201).send(item);
        }

        return reply.status(400).send({ error: `unsupported type: ${type}` });
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });
  };
}
