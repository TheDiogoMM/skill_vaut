import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);
  app.register(multipart, { attachFieldsToBody: 'keyValues' });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);
  app.register(itemsRoutes(options.config));

  return app;
}
