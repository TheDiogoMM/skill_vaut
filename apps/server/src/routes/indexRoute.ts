import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { SkillVaultConfig } from '../config.js';

export function indexRoute(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    app.get('/api/index', async (_request, reply) => {
      if (!fs.existsSync(config.indexJsonPath)) {
        return reply.send([]);
      }
      const raw = fs.readFileSync(config.indexJsonPath, 'utf-8');
      reply.header('Content-Type', 'application/json');
      return reply.send(raw);
    });
  };
}
