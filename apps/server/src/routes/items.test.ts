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
    const app = buildApp({ db: createDb(':memory:'), config });
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
    const app = buildApp({ db: createDb(':memory:'), config });

    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { type: 'repo', name: 'Sem URL' },
    });

    expect(response.statusCode).toBe(400);
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
    const app = buildApp({ db: createDb(':memory:'), config });

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
    const app = buildApp({ db: createDb(':memory:'), config });

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
    const app = buildApp({ db: createDb(':memory:'), config });

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
    const app = buildApp({ db: createDb(':memory:'), config });

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
