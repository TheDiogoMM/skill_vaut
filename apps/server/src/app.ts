import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';
import { indexRoute } from './routes/indexRoute.js';
import { recommendRoutes } from './routes/recommend.js';
import { discoverRoutes } from './routes/discover.js';

const defaultWebDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/dist',
);

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
  webDistPath?: string;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);
  app.register(multipart, { attachFieldsToBody: true });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes(options.config));
  app.register(itemsRoutes(options.config));
  app.register(indexRoute(options.config));
  app.register(recommendRoutes(options.config));
  app.register(discoverRoutes(options.config));

  const webDistPath = options.webDistPath ?? defaultWebDistPath;
  const indexHtmlPath = path.join(webDistPath, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.register(fastifyStatic, { root: webDistPath });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'Not found' });
        return;
      }
      reply.type('text/html').send(fs.readFileSync(indexHtmlPath));
    });
  }

  return app;
}
