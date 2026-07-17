import type { FastifyInstance } from 'fastify';
import { CategoriesRepository } from '../db/repositories/categories.js';

export async function categoriesRoutes(app: FastifyInstance) {
  const repo = new CategoriesRepository(app.db);

  app.get('/api/categories', async () => repo.list());

  app.post<{ Body: { name: string } }>('/api/categories', async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: 'name is required' });
    return reply.status(201).send(repo.create(name));
  });

  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/categories/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const category = repo.rename(id, request.body.name.trim());
      if (!category) return reply.status(404).send({ error: 'category not found' });
      return category;
    }
  );

  app.post<{ Params: { id: string }; Body: { target_id: number } }>(
    '/api/categories/:id/merge',
    async (request, reply) => {
      const sourceId = Number(request.params.id);
      repo.merge(sourceId, request.body.target_id);
      return reply.status(204).send();
    }
  );
}
