import Fastify, { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { categoriesRoutes } from './routes/categories.js';

export interface BuildAppOptions {
  db: Database.Database;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes);

  return app;
}
