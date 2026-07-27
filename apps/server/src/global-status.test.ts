import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isSkillInstalledGlobally,
  isMcpInstalledGlobally,
  mcpHasRedactedSecret,
  computeGlobalStatus,
} from './global-status.js';
import type { Item } from './types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'my-skill',
    sourceType: 'local_path',
    sourceValue: '/tmp/does-not-matter',
    localPath: '/tmp/does-not-matter',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isSkillInstalledGlobally', () => {
  const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-global-status-skills-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
  });

  it('returns true when a folder with the same basename exists', () => {
    fs.mkdirSync(path.join(claudeSkillsDir, 'my-skill'), { recursive: true });
    const item = sampleItem({ localPath: '/wherever/my-skill' });
    expect(isSkillInstalledGlobally({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item)).toBe(true);
  });

  it('returns false when no matching folder exists', () => {
    const item = sampleItem({ localPath: '/wherever/missing-skill' });
    expect(isSkillInstalledGlobally({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item)).toBe(false);
  });
});

describe('isMcpInstalledGlobally', () => {
  const claudeConfigPath = path.join(os.tmpdir(), `skillvault-global-status-config-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('returns true when the item name is a key in mcpServers', () => {
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { stripe: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(true);
  });

  it('returns false when the config file does not exist', () => {
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(
      isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/does/not/exist.json' }, item)
    ).toBe(false);
  });

  it('returns false when the config file is not valid JSON', () => {
    fs.writeFileSync(claudeConfigPath, 'not json');
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(false);
  });

  it('returns false when the item name is not a key in mcpServers', () => {
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { supabase: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    expect(isMcpInstalledGlobally({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item)).toBe(false);
  });
});

describe('mcpHasRedactedSecret', () => {
  const mcpFilePath = path.join(os.tmpdir(), `skillvault-global-status-mcp-${Date.now()}.json`);

  afterEach(() => {
    fs.rmSync(mcpFilePath, { force: true });
  });

  it('returns true when the file contains <REDACTED>', () => {
    fs.writeFileSync(mcpFilePath, JSON.stringify({ env: { KEY: '<REDACTED>' } }));
    const item = sampleItem({ type: 'mcp', localPath: mcpFilePath });
    expect(mcpHasRedactedSecret(item)).toBe(true);
  });

  it('returns false when the file has no redacted values', () => {
    fs.writeFileSync(mcpFilePath, JSON.stringify({ type: 'http', url: 'https://example.com' }));
    const item = sampleItem({ type: 'mcp', localPath: mcpFilePath });
    expect(mcpHasRedactedSecret(item)).toBe(false);
  });

  it('returns true when the file contains a URL-encoded redacted placeholder (%3CREDACTED%3E)', () => {
    fs.writeFileSync(mcpFilePath, JSON.stringify({ type: 'http', url: 'https://example.com/api?apiKey=%3CREDACTED%3E' }));
    const item = sampleItem({ type: 'mcp', localPath: mcpFilePath });
    expect(mcpHasRedactedSecret(item)).toBe(true);
  });
});

describe('computeGlobalStatus', () => {
  it('returns nulls for repo items', () => {
    const item = sampleItem({ type: 'repo' });
    expect(computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item)).toEqual({
      installedGlobally: null,
      hasRedactedSecret: null,
      installedPath: null,
    });
  });

  it('returns installedGlobally=false, hasRedactedSecret=null and installedPath=null for a skill not yet installed', () => {
    const item = sampleItem({ type: 'skill', localPath: '/nonexistent-skill-path' });
    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item);
    expect(status).toEqual({ installedGlobally: false, hasRedactedSecret: null, installedPath: null });
  });

  it('returns installedPath pointing at claudeSkillsDir/<basename> for an installed skill', () => {
    const claudeSkillsDir = path.join(os.tmpdir(), `skillvault-global-status-installpath-${Date.now()}`);
    fs.mkdirSync(path.join(claudeSkillsDir, 'my-skill'), { recursive: true });
    const item = sampleItem({ type: 'skill', localPath: '/wherever/my-skill' });

    const status = computeGlobalStatus({ claudeSkillsDir, claudeConfigPath: '/nonexistent' }, item);

    expect(status.installedGlobally).toBe(true);
    expect(status.installedPath).toBe(path.join(claudeSkillsDir, 'my-skill'));

    fs.rmSync(claudeSkillsDir, { recursive: true, force: true });
  });

  it('returns installedPath equal to claudeConfigPath for an installed mcp', () => {
    const claudeConfigPath = path.join(os.tmpdir(), `skillvault-global-status-installpath-mcp-${Date.now()}.json`);
    fs.writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { stripe: {} } }));
    const item = sampleItem({ type: 'mcp', name: 'stripe' });

    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath }, item);

    expect(status.installedGlobally).toBe(true);
    expect(status.installedPath).toBe(claudeConfigPath);

    fs.rmSync(claudeConfigPath, { force: true });
  });

  it('returns installedPath=null for an mcp not yet installed', () => {
    const item = sampleItem({ type: 'mcp', name: 'stripe' });
    const status = computeGlobalStatus({ claudeSkillsDir: '/nonexistent', claudeConfigPath: '/nonexistent' }, item);
    expect(status.installedPath).toBeNull();
  });
});
