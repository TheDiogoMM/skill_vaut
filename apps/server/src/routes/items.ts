import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ingestRepo } from '../ingestion/repo.js';
import { ingestSkill, type SkillSource } from '../ingestion/skill.js';
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
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(item);
        }

        if (type === 'skill') {
          const sourceType = body.source_type as string;
          let source: SkillSource;

          if (sourceType === 'local_path') {
            const localPath = body.path as string;
            if (!localPath) return reply.status(400).send({ error: 'path is required' });
            source = { kind: 'local_path', path: localPath };
          } else if (sourceType === 'url') {
            const url = body.url as string;
            if (!url) return reply.status(400).send({ error: 'url is required' });
            source = { kind: 'url', url };
          } else if (sourceType === 'upload') {
            const file = body.file as MultipartFile | undefined;
            if (!file) return reply.status(400).send({ error: 'file is required for upload' });
            const buffer = await file.toBuffer();
            const tempPath = path.join(os.tmpdir(), `skillvault-upload-${Date.now()}-${file.filename}`);
            fs.writeFileSync(tempPath, buffer);
            source = {
              kind: 'upload',
              tempFilePath: tempPath,
              isZip: file.filename.toLowerCase().endsWith('.zip'),
            };
          } else {
            return reply.status(400).send({ error: `unsupported source_type: ${sourceType}` });
          }

          const item = await ingestSkill(config, itemsRepo, categoriesRepo, { name, source });
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(item);
        }

        return reply.status(400).send({ error: `unsupported type: ${type}` });
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });
  };
}
