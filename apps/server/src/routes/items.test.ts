import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createDb } from '../db/connection.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { buildApp } from '../app.js';

// Stub enrichment for the multipart tests below so we can assert on exactly
// what content reached the enrichment call — echoing the received content
// back in `summary` lets the tests prove real file content was read (fix #3)
// rather than the fallback temp-path string, without depending on a live
// Ollama/Gemini backend.
vi.mock('../enrichment/enrich.js', () => ({
  enrichContent: vi.fn(async (_config: unknown, _itemType: string, content: string) => ({
    summary: `enriched:${content}`,
    utility: 'Utilidade',
    category: 'automacao',
    tags: ['skill'],
    source: 'manual' as const,
  })),
  buildEnrichmentPrompt: vi.fn(() => ''),
}));

function buildMultipartBody(
  boundary: string,
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; content: Buffer; contentType: string }
): Buffer {
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`)
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`
    )
  );
  parts.push(file.content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

const noDistPath = path.join(os.tmpdir(), `skillvault-no-dist-${Date.now()}`);

function createFixtureRepo(): string {
  const dir = path.join(os.tmpdir(), `skillvault-route-fixture-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('POST /api/items (type=repo)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('ingests a repo and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Fixture Repo', url: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe('repo');
    expect(fs.existsSync(path.join(config.indexJsonPath))).toBe(true);
  });

  it('rejects a repo without a url', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Sem URL' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('ingests a repo by local_path without cloning, and captures the git remote', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();
    execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/own/fixture.git'], { cwd: fixtureRepo });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Local', source_type: 'local_path', path: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.downloadStatus).toBe('local');
    expect(body.localPath).toBe(fixtureRepo);
    expect(body.sourceValue).toBe('https://example.com/own/fixture.git');
  });

  it('ingests a repo by url as not_downloaded (no permanent clone yet)', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Remoto', url: fixtureRepo },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.downloadStatus).toBe('not_downloaded');
    expect(fs.existsSync(body.localPath)).toBe(false);
  });

  it('includes installedGlobally=null and hasRedactedSecret=null on a repo item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Status', source_type: 'local_path', path: fixtureRepo },
    });

    const body = response.json();
    expect(body.installedGlobally).toBeNull();
    expect(body.hasRedactedSecret).toBeNull();
  });
});

describe('POST /api/items (type=skill, source_type=local_path)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-skill-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('copies the skill and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-route-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Skill de rota');

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Skill de Rota', source_type: 'local_path', path: sourceDir },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe('skill');
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });
});

describe('POST /api/items (type=skill, source_type=upload, real multipart request)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-skill-multipart-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('extracts an uploaded zip via a genuine multipart/form-data request', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('# Skill via multipart zip'));
    const zipBuffer = zip.toBuffer();

    const boundary = '----SkillVaultBoundaryZip';
    const payload = buildMultipartBody(
      boundary,
      { type: 'skill', name: 'Skill Multipart Zip', source_type: 'upload' },
      { fieldName: 'file', filename: 'skill.zip', content: zipBuffer, contentType: 'application/zip' }
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe('skill');
    expect(body.sourceType).toBe('upload');
    expect(fs.existsSync(path.join(body.localPath, 'SKILL.md'))).toBe(true);
    expect(body.summary).toContain('Skill via multipart zip');
  });

  it('reads a plain uploaded SKILL.md file for enrichment (not the temp path) and cleans up the temp file', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const fileContent = '# Minha Skill via Upload Direto\n\nConteudo real do arquivo.';
    const boundary = '----SkillVaultBoundaryFile';
    const payload = buildMultipartBody(
      boundary,
      { type: 'skill', name: 'Skill Multipart Arquivo', source_type: 'upload' },
      {
        fieldName: 'file',
        filename: 'SKILL.md',
        content: Buffer.from(fileContent),
        contentType: 'text/markdown',
      }
    );

    const tmpFilesBefore = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('skillvault-upload-'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe('skill');
    expect(fs.existsSync(path.join(body.localPath, 'SKILL.md'))).toBe(true);

    // Proves fix #3: enrichment received the real file content (copied under
    // its original filename), not the fallback temp-path string.
    expect(body.summary).toContain(fileContent);
    expect(body.summary).not.toContain(os.tmpdir());

    // Proves fix #4: the temp upload file was cleaned up after ingestion.
    const tmpFilesAfter = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('skillvault-upload-'));
    expect(tmpFilesAfter.length).toBe(tmpFilesBefore.length);
  });

  it('sanitizes a path-traversal filename instead of escaping the temp/skill directories', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const boundary = '----SkillVaultBoundaryTraversal';
    const payload = buildMultipartBody(
      boundary,
      { type: 'skill', name: 'Skill Maliciosa', source_type: 'upload' },
      {
        fieldName: 'file',
        filename: '../../../../evil.md',
        content: Buffer.from('# conteudo malicioso'),
        contentType: 'text/markdown',
      }
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    // The traversal segments must have been stripped down to the basename,
    // so the file lands inside the skill's own folder under a clean name —
    // never outside SKILLVAULT_HOME's skills directory.
    expect(fs.existsSync(path.join(body.localPath, 'evil.md'))).toBe(true);
    expect(body.localPath.startsWith(config.skillsDir)).toBe(true);
    expect(fs.existsSync(path.join(config.skillvaultHome, '..', 'evil.md'))).toBe(false);
  });
});

describe('POST /api/items (type=mcp)', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-mcp-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('saves the MCP config and returns the created item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'mcp',
        name: 'MCP de Rota',
        config: { mcpServers: { rota: { command: 'npx', args: ['rota-mcp'] } } },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe('mcp');
  });
});

describe('items list/detail/update/delete', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-crud-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  async function createMcpItem(app: ReturnType<typeof buildApp>, name: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name, config: { mcpServers: {} } },
    });
    return response.json();
  }

  it('lists items and filters by type', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    await createMcpItem(app, 'MCP Um');
    await createMcpItem(app, 'MCP Dois');

    const list = await app.inject({ method: 'GET', url: '/api/items?type=mcp' });
    expect(list.json()).toHaveLength(2);
  });

  it('returns 404 for a missing item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'GET', url: '/api/items/999' });
    expect(response.statusCode).toBe(404);
  });

  it('updates an item and regenerates the index', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const created = await createMcpItem(app, 'MCP a Editar');
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/items/${created.id}`,
      payload: { summary: 'Resumo editado' },
    });
    expect(update.json().summary).toBe('Resumo editado');
  });

  it('deletes an item and removes its local file', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const created = await createMcpItem(app, 'MCP a Apagar');
    expect(fs.existsSync(created.localPath)).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/api/items/${created.id}` });
    expect(del.statusCode).toBe(204);
    expect(fs.existsSync(created.localPath)).toBe(false);

    const getAfterDelete = await app.inject({ method: 'GET', url: `/api/items/${created.id}` });
    expect(getAfterDelete.statusCode).toBe(404);
  });

  it('deletes a local_path repo item WITHOUT touching the user\'s real directory on disk', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo Local a Apagar', source_type: 'local_path', path: fixtureRepo },
    });
    const item = created.json();
    expect(item.localPath).toBe(fixtureRepo);

    const del = await app.inject({ method: 'DELETE', url: `/api/items/${item.id}` });
    expect(del.statusCode).toBe(204);

    const getAfterDelete = await app.inject({ method: 'GET', url: `/api/items/${item.id}` });
    expect(getAfterDelete.statusCode).toBe(404);

    // The critical assertion: the user's real directory must still exist on disk.
    expect(fs.existsSync(fixtureRepo)).toBe(true);

    fs.rmSync(fixtureRepo, { recursive: true, force: true });
  });

  it('deletes a url-sourced repo item that has been downloaded, removing its vault-owned clone', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Repo URL a Apagar', url: fixtureRepo },
    });
    const item = created.json();
    expect(item.downloadStatus).toBe('not_downloaded');

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${item.id}/download`,
    });
    const downloaded = downloadResponse.json();
    expect(downloaded.downloadStatus).toBe('downloaded');
    expect(fs.existsSync(downloaded.localPath)).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/api/items/${item.id}` });
    expect(del.statusCode).toBe(204);

    // This is a vault-owned clone (not the user's real directory), so it must be removed.
    expect(fs.existsSync(downloaded.localPath)).toBe(false);

    fs.rmSync(fixtureRepo, { recursive: true, force: true });
  });

  it('returns 400 for PATCH with a missing/empty body', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const created = await createMcpItem(app, 'MCP Sem Body');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/items/${created.id}`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for PATCH with a nonexistent categoryId', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const created = await createMcpItem(app, 'MCP Categoria Invalida');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/items/${created.id}`,
      payload: { categoryId: 999999 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for PATCH on a nonexistent item id', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/items/999',
      payload: { summary: 'Novo resumo' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for DELETE on a nonexistent item id', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'DELETE', url: '/api/items/999' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 400 for GET /api/items?category= with a non-numeric value', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'GET', url: '/api/items?category=abc' });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/items/:id content field', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-content-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('includes the raw config content for an mcp item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        type: 'mcp',
        name: 'MCP com conteudo',
        config: { mcpServers: { x: { command: 'npx' } } },
      },
    });
    const item = created.json();

    const response = await app.inject({ method: 'GET', url: `/api/items/${item.id}` });
    const body = response.json();
    expect(body.content).toContain('"command": "npx"');
  });
});

describe('POST /api/items/:id/download', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-download-route-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('clones a not_downloaded repo item and flips it to downloaded', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Para Baixar', url: fixtureRepo },
    });
    const created = createResponse.json();
    expect(created.downloadStatus).toBe('not_downloaded');

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${created.id}/download`,
    });

    expect(downloadResponse.statusCode).toBe(200);
    const downloaded = downloadResponse.json();
    expect(downloaded.downloadStatus).toBe('downloaded');
    expect(fs.existsSync(path.join(downloaded.localPath, 'README.md'))).toBe(true);
  });

  it('returns 409 when the item is not pending download', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });
    const fixtureRepo = createFixtureRepo();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Local', source_type: 'local_path', path: fixtureRepo },
    });
    const created = createResponse.json();
    expect(created.downloadStatus).toBe('local');

    const downloadResponse = await app.inject({
      method: 'POST',
      url: `/api/items/${created.id}/download`,
    });

    expect(downloadResponse.statusCode).toBe(409);
  });

  it('returns 404 for a nonexistent item', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const response = await app.inject({ method: 'POST', url: '/api/items/999/download' });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/items includes global status for skill and mcp items', () => {
  const home = path.join(os.tmpdir(), `skillvault-items-global-status-${Date.now()}`);
  const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-claude-skills-${Date.now()}`);
  const claudeConfigPath = path.join(os.tmpdir(), `skillvault-claude-config-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('reflects installedGlobally=true once a skill folder exists at claudeSkillsDir', async () => {
    const config = loadConfig({
      SKILLVAULT_HOME: home,
      CLAUDE_SKILLS_DIR: claudeSkillsDir,
      CLAUDE_CONFIG_PATH: claudeConfigPath,
    } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-status-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Minha Skill');

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'skill', name: 'Minha Skill', source_type: 'local_path', path: sourceDir },
    });
    const created = create.json();
    expect(created.installedGlobally).toBe(false);

    fs.mkdirSync(path.join(claudeSkillsDir, path.basename(created.localPath)), { recursive: true });

    const getResponse = await app.inject({ method: 'GET', url: `/api/items/${created.id}` });
    expect(getResponse.json().installedGlobally).toBe(true);
  });

  it('reflects hasRedactedSecret=true for an mcp whose config was redacted', async () => {
    const config = loadConfig({
      SKILLVAULT_HOME: home,
      CLAUDE_SKILLS_DIR: claudeSkillsDir,
      CLAUDE_CONFIG_PATH: claudeConfigPath,
    } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const app = buildApp({ db: createDb(':memory:'), config, webDistPath: noDistPath });

    const create = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'mcp', name: 'Meu MCP', config: { env: { STRIPE_SECRET_KEY: 'sk_test_real' } } },
    });

    expect(create.json().hasRedactedSecret).toBe(true);
  });
});
