import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { regenerateIndex } from '../index/generate.js';

export function categoriesRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const repo = new CategoriesRepository(app.db);
    const itemsRepo = new ItemsRepository(app.db);

    function regenerate() {
      regenerateIndex(itemsRepo, repo, config, config.indexJsonPath, config.indexMdPath);
    }

    app.get('/api/categories', async () => repo.list());

    app.post<{ Body: { name: string } }>('/api/categories', async (request, reply) => {
      const name = request.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });
      const category = repo.create(name);
      try {
        regenerate();
      } catch (err) {
        app.log.error(err, 'failed to regenerate index after category creation');
      }
      return reply.status(201).send(category);
    });

    app.patch<{ Params: { id: string }; Body: { name: string } }>(
      '/api/categories/:id',
      async (request, reply) => {
        const id = Number(request.params.id);
        const name = request.body?.name?.trim();
        if (!name) return reply.status(400).send({ error: 'name is required' });
        const category = repo.rename(id, name);
        if (!category) return reply.status(404).send({ error: 'category not found' });
        try {
          regenerate();
        } catch (err) {
          app.log.error(err, 'failed to regenerate index after category rename');
        }
        return category;
      }
    );

    app.post<{ Params: { id: string }; Body: { target_id: number } }>(
      '/api/categories/:id/merge',
      async (request, reply) => {
        const sourceId = Number(request.params.id);
        const targetId = Number(request.body?.target_id);

        if (sourceId === targetId) {
          return reply.status(400).send({ error: 'source and target must differ' });
        }
        if (!repo.findById(sourceId)) {
          return reply.status(404).send({ error: 'source category not found' });
        }
        if (!repo.findById(targetId)) {
          return reply.status(404).send({ error: 'target category not found' });
        }

        repo.merge(sourceId, targetId);
        try {
          regenerate();
        } catch (err) {
          app.log.error(err, 'failed to regenerate index after category merge');
        }
        return reply.status(204).send();
      }
    );
  };
}
