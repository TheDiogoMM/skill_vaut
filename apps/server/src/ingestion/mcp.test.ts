import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { ingestMcp } from './mcp.js';
import type { EnrichmentResult } from '../types.js';

const stubEnrich = async (): Promise<EnrichmentResult> => ({
  summary: 'Resumo do MCP',
  utility: 'Conecta com X',
  category: 'integracoes',
  tags: ['mcp'],
  source: 'ollama',
});

describe('ingestMcp', () => {
  const home = path.join(os.tmpdir(), `skillvault-mcp-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('writes the config JSON and saves the item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const item = await ingestMcp(
      config,
      itemsRepo,
      categoriesRepo,
      {
        name: 'Meu MCP',
        config: { mcpServers: { meuMcp: { command: 'npx', args: ['meu-mcp'] } } },
        description: 'Conector para X',
      },
      stubEnrich
    );

    expect(item.type).toBe('mcp');
    expect(fs.existsSync(item.localPath)).toBe(true);
    const savedConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));
    expect(savedConfig.mcpServers.meuMcp.command).toBe('npx');
    expect(item.summary).toBe('Resumo do MCP');
  });
});
