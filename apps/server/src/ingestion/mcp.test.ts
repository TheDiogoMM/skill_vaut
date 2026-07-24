import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { ingestMcp, redactSecrets } from './mcp.js';
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

describe('redactSecrets', () => {
  it('redacts keys whose name looks sensitive, including nested objects', async () => {
    const { redactSecrets } = await import('./mcp.js');
    const result = redactSecrets({
      command: 'npx',
      env: {
        STRIPE_SECRET_KEY: 'sk_test_abc123',
        PLAIN_VALUE: 'keep-me',
      },
      headers: {
        Authorization: 'Bearer abc123',
      },
      args: ['-y', '@stripe/mcp'],
    });

    expect(result).toEqual({
      command: 'npx',
      env: {
        STRIPE_SECRET_KEY: '<REDACTED>',
        PLAIN_VALUE: 'keep-me',
      },
      headers: {
        Authorization: '<REDACTED>',
      },
      args: ['-y', '@stripe/mcp'],
    });
  });

  it('does not touch keys with no sensitive-looking name', () => {
    const result = redactSecrets({ type: 'http', url: 'https://mcp.supabase.com/mcp?project_ref=abc' });
    expect(result).toEqual({ type: 'http', url: 'https://mcp.supabase.com/mcp?project_ref=abc' });
  });

  it('redacts a sensitive-looking query parameter embedded in a URL value, even under a non-sensitive key', () => {
    const result = redactSecrets({
      type: 'http',
      url: 'https://mcp.21st.dev/api?apiKey=an_sk_cfbdd997eedd180a951429f6febe42afa39565d25bb352fac9aca2519eee8622',
    });
    expect(result).toEqual({
      type: 'http',
      url: 'https://mcp.21st.dev/api?apiKey=%3CREDACTED%3E',
    });
  });

  it('leaves URL values with no sensitive query parameters untouched', () => {
    const result = redactSecrets({ url: 'https://mcp.supabase.com/mcp?project_ref=belbkhugpcfiiloqvrnd' });
    expect(result).toEqual({ url: 'https://mcp.supabase.com/mcp?project_ref=belbkhugpcfiiloqvrnd' });
  });

  it('leaves non-URL strings untouched', () => {
    const result = redactSecrets({ description: 'connects to the internal API' });
    expect(result).toEqual({ description: 'connects to the internal API' });
  });
});

describe('ingestMcp secret redaction', () => {
  const home = path.join(os.tmpdir(), `skillvault-mcp-redact-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('never writes the real secret to disk or to sourceValue', async () => {
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
        name: 'Stripe',
        config: { command: 'npx', env: { STRIPE_SECRET_KEY: 'sk_test_verysecret' } },
      },
      stubEnrich
    );

    const savedConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));
    expect(savedConfig.env.STRIPE_SECRET_KEY).toBe('<REDACTED>');
    expect(item.sourceValue).not.toContain('verysecret');
  });
});
