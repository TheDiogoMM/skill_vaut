import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createDb } from '../db/connection.js';
import { ItemsRepository } from '../db/repositories/items.js';
import { CategoriesRepository } from '../db/repositories/categories.js';
import { loadConfig, ensureSkillVaultDirs } from '../config.js';
import { ingestSkill } from './skill.js';
import type { EnrichmentResult } from '../types.js';

const stubEnrich = async (): Promise<EnrichmentResult> => ({
  summary: 'Resumo',
  utility: 'Utilidade',
  category: 'automacao',
  tags: ['skill'],
  source: 'ollama',
});

describe('ingestSkill', () => {
  const home = path.join(os.tmpdir(), `skillvault-skill-ingest-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('copies a skill from a local path', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const sourceDir = path.join(os.tmpdir(), `skillvault-skill-source-${Date.now()}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Minha Skill');

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Minha Skill', source: { kind: 'local_path', path: sourceDir } },
      stubEnrich
    );

    expect(item.sourceType).toBe('local_path');
    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('extracts a skill from an uploaded zip', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('# Skill zipada'));
    const zipPath = path.join(os.tmpdir(), `skillvault-skill-upload-${Date.now()}.zip`);
    zip.writeZip(zipPath);

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Skill Zipada', source: { kind: 'upload', tempFilePath: zipPath, isZip: true } },
      stubEnrich
    );

    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
    fs.rmSync(zipPath, { force: true });
  });

  it('clones a skill from a URL and records the global install result', async () => {
    const config = loadConfig({ SKILLVAULT_HOME: home } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    const db = createDb(':memory:');
    const itemsRepo = new ItemsRepository(db);
    const categoriesRepo = new CategoriesRepository(db);

    const { execFileSync } = await import('node:child_process');
    const fixtureRepo = path.join(os.tmpdir(), `skillvault-skill-fixture-${Date.now()}`);
    fs.mkdirSync(fixtureRepo, { recursive: true });
    execFileSync('git', ['init'], { cwd: fixtureRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: fixtureRepo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: fixtureRepo });
    fs.writeFileSync(path.join(fixtureRepo, 'SKILL.md'), '# Skill via URL');
    execFileSync('git', ['add', '.'], { cwd: fixtureRepo });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: fixtureRepo });

    const item = await ingestSkill(
      config,
      itemsRepo,
      categoriesRepo,
      { name: 'Skill via URL', source: { kind: 'url', url: fixtureRepo } },
      stubEnrich,
      async () => 'success'
    );

    expect(item.globalInstallStatus).toBe('success');
    expect(fs.existsSync(path.join(item.localPath, 'SKILL.md'))).toBe(true);
  });
});
