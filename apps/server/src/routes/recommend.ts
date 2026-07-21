import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ConsultasRepository } from '../db/repositories/consultas.js';
import { getRecommendations } from '../recommend/recommend.js';

const HISTORY_LIMIT = 10;

export function recommendRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);
    const consultasRepo = new ConsultasRepository(app.db);

    app.post<{ Body: { ideia: string } }>('/api/recommend', async (request, reply) => {
      const ideia = request.body?.ideia?.trim();
      if (!ideia) return reply.status(400).send({ error: 'ideia is required' });

      const result = await getRecommendations(config, itemsRepo, categoriesRepo, ideia);
      if (!result) {
        return reply
          .status(503)
          .send({ error: 'Não foi possível gerar recomendações no momento. Tente novamente.' });
      }

      consultasRepo.create(ideia, JSON.stringify(result));
      return result;
    });

    app.get('/api/consultas', async () => consultasRepo.listRecent(HISTORY_LIMIT));
  };
}
