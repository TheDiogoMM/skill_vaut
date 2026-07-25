import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { SkillVaultConfig } from '../config.js';
import { ItemsRepository, type NewItem, type ItemUpdate } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { ingestRepo, type RepoSource } from '../ingestion/repo.js';
import { downloadRepo } from '../ingestion/download.js';
import { ingestSkill, type SkillSource } from '../ingestion/skill.js';
import { ingestMcp } from '../ingestion/mcp.js';
import { regenerateIndex } from '../index/generate.js';
import { readItemContent } from '../content.js';
import { computeGlobalStatus } from '../global-status.js';
import { installSkillGlobally, installMcpGlobally } from '../ingestion/install.js';
import type { Item } from '../types.js';

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

    function withGlobalStatus(item: Item) {
      return { ...item, ...computeGlobalStatus(config, item) };
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
          const sourceType = fieldValue(body.source_type);
          let source: RepoSource;

          if (sourceType === 'local_path') {
            const localPath = fieldValue(body.path);
            if (!localPath) return reply.status(400).send({ error: 'path is required for source_type=local_path' });
            source = { kind: 'local_path', path: localPath };
          } else {
            const url = fieldValue(body.url);
            if (!url) return reply.status(400).send({ error: 'url is required for type=repo' });
            source = { kind: 'url', url };
          }

          const item = await ingestRepo(config, itemsRepo, categoriesRepo, { name, source });
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(withGlobalStatus(item));
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
          return reply.status(201).send(withGlobalStatus(item));
        }

        if (type === 'mcp') {
          const mcpConfig = body.config as Record<string, unknown> | undefined;
          if (!mcpConfig) return reply.status(400).send({ error: 'config is required for type=mcp' });
          const description = body.description as string | undefined;
          const item = await ingestMcp(config, itemsRepo, categoriesRepo, {
            name,
            config: mcpConfig,
            description,
          });
          try {
            regenerate();
          } catch (err) {
            app.log.error(err, 'failed to regenerate index after item creation');
          }
          return reply.status(201).send(withGlobalStatus(item));
        }

        return reply.status(400).send({ error: `unsupported type: ${type}` });
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });

    app.get('/api/items', async (request, reply) => {
      const { q, type, category, tag } = request.query as {
        q?: string;
        type?: string;
        category?: string;
        tag?: string;
      };

      let categoryId: number | undefined;
      if (category !== undefined) {
        categoryId = Number(category);
        if (Number.isNaN(categoryId)) {
          return reply.status(400).send({ error: 'category must be a number' });
        }
      }

      const items = itemsRepo.list({
        q,
        type: type as NewItem['type'] | undefined,
        categoryId,
        tag,
      });
      return items.map(withGlobalStatus);
    });

    app.get('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      return { ...withGlobalStatus(item), content: readItemContent(item) };
    });

    app.patch('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({ error: 'body is required' });
      }

      let item;
      try {
        item = itemsRepo.update(Number(id), request.body as ItemUpdate);
      } catch (err) {
        if (err instanceof Database.SqliteError && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
          return reply.status(400).send({ error: 'categoryId does not reference an existing category' });
        }
        throw err;
      }

      if (!item) return reply.status(404).send({ error: 'item not found' });
      try {
        regenerate();
      } catch (err) {
        app.log.error(err, 'failed to regenerate index after item update');
      }
      return withGlobalStatus(item);
    });

    app.delete('/api/items/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });

      if (!(item.type === 'repo' && item.sourceType === 'local_path') && fs.existsSync(item.localPath)) {
        fs.rmSync(item.localPath, { recursive: true, force: true });
      }
      itemsRepo.delete(item.id);
      try {
        regenerate();
      } catch (err) {
        app.log.error(err, 'failed to regenerate index after item deletion');
      }
      return reply.status(204).send();
    });

    app.post('/api/items/:id/download', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      if (item.type !== 'repo' || item.downloadStatus !== 'not_downloaded') {
        return reply.status(409).send({ error: 'item is not pending download' });
      }

      try {
        const updated = await downloadRepo(itemsRepo, item);
        try {
          regenerate();
        } catch (err) {
          app.log.error(err, 'failed to regenerate index after item download');
        }
        return withGlobalStatus(updated);
      } catch (err) {
        return reply.status(422).send({ error: (err as Error).message });
      }
    });

    app.post('/api/items/:id/install', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = itemsRepo.getById(Number(id));
      if (!item) return reply.status(404).send({ error: 'item not found' });
      if (item.type === 'repo') return reply.status(409).send({ error: 'use /download for repo items' });

      const globalStatus = computeGlobalStatus(config, item);
      if (globalStatus.installedGlobally) {
        return reply.status(409).send({ error: 'item is already installed globally' });
      }
      if (globalStatus.hasRedactedSecret) {
        return reply
          .status(409)
          .send({ error: 'mcp config has a redacted secret; add it manually to CLAUDE_CONFIG_PATH' });
      }

      try {
        if (item.type === 'skill') {
          installSkillGlobally(config, item);
        } else {
          installMcpGlobally(config, item);
        }
      } catch (err) {
        return reply.status(500).send({ error: (err as Error).message });
      }

      try {
        regenerate();
      } catch (err) {
        app.log.error(err, 'failed to regenerate index after item install');
      }

      return withGlobalStatus(item);
    });
  };
}
