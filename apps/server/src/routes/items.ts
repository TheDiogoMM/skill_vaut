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

// With @fastify/multipart's `attachFieldsToBody: true`, every plain field on a
// multipart request arrives as `{ value: <actual value>, ... }` instead of the
// raw value, while file fields keep their real MultipartFile shape. Plain JSON
// requests are untouched by the multipart plugin, so fields arrive as-is. This
// helper normalizes both cases so route code can read fields uniformly.
function fieldValue(field: unknown): string | undefined {
  if (field && typeof field === 'object' && 'value' in (field as Record<string, unknown>)) {
    return (field as { value: unknown }).value as string | undefined;
  }
  return field as string | undefined;
}

export function itemsRoutes(config: SkillVaultConfig) {
  return async function (app: FastifyInstance) {
    const itemsRepo = new ItemsRepository(app.db);
    const categoriesRepo = new CategoriesRepository(app.db);

    function regenerate() {
      regenerateIndex(itemsRepo, categoriesRepo, config.indexJsonPath, config.indexMdPath);
    }

    app.post('/api/items', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const type = fieldValue(body.type);
      const name = fieldValue(body.name);

      if (!type || !name) {
        return reply.status(400).send({ error: 'type and name are required' });
      }

      try {
        if (type === 'repo') {
          const url = fieldValue(body.url);
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
          const sourceType = fieldValue(body.source_type);
          let source: SkillSource;

          if (sourceType === 'local_path') {
            const localPath = fieldValue(body.path);
            if (!localPath) return reply.status(400).send({ error: 'path is required' });
            source = { kind: 'local_path', path: localPath };
          } else if (sourceType === 'url') {
            const url = fieldValue(body.url);
            if (!url) return reply.status(400).send({ error: 'url is required' });
            source = { kind: 'url', url };
          } else if (sourceType === 'upload') {
            const file = body.file as MultipartFile | undefined;
            if (!file) return reply.status(400).send({ error: 'file is required for upload' });
            // file.filename is client-controlled; strip any directory components
            // before it ever touches a filesystem path (prevents path traversal).
            const originalFilename = path.basename(file.filename);
            const buffer = await file.toBuffer();
            const tempPath = path.join(
              os.tmpdir(),
              `skillvault-upload-${Date.now()}-${originalFilename}`
            );
            fs.writeFileSync(tempPath, buffer);
            source = {
              kind: 'upload',
              tempFilePath: tempPath,
              isZip: originalFilename.toLowerCase().endsWith('.zip'),
              originalFilename,
            };
          } else {
            return reply.status(400).send({ error: `unsupported source_type: ${sourceType}` });
          }

          let item;
          try {
            item = await ingestSkill(config, itemsRepo, categoriesRepo, { name, source });
          } finally {
            if (source.kind === 'upload') {
              try {
                fs.rmSync(source.tempFilePath, { force: true });
              } catch (cleanupErr) {
                app.log.error(cleanupErr, 'failed to clean up temp upload file');
              }
            }
          }

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
