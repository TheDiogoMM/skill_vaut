import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, ensureSkillVaultDirs } from './config.js';

describe('loadConfig', () => {
  it('falls back to ~/skillvault when SKILLVAULT_HOME is not set', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.skillvaultHome).toBe(path.join(os.homedir(), 'skillvault'));
    expect(config.dbPath).toBe(path.join(config.skillvaultHome, 'skillvault.db'));
    expect(config.reposDir).toBe(path.join(config.skillvaultHome, 'repos'));
    expect(config.port).toBe(3001);
  });

  it('honors overrides', () => {
    const config = loadConfig({
      SKILLVAULT_HOME: '/tmp/custom-home',
      OLLAMA_MODEL: 'qwen2.5',
      GEMINI_API_KEY: 'abc123',
      PORT: '4000',
    } as NodeJS.ProcessEnv);
    expect(config.skillvaultHome).toBe('/tmp/custom-home');
    expect(config.ollamaModel).toBe('qwen2.5');
    expect(config.geminiApiKey).toBe('abc123');
    expect(config.port).toBe(4000);
  });

  it('defaults claudeSkillsDir and claudeConfigPath to the standard Claude Code locations', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.claudeSkillsDir).toBe(path.join(os.homedir(), '.claude', 'skills'));
    expect(config.claudeConfigPath).toBe(path.join(os.homedir(), '.claude.json'));
  });

  it('honors CLAUDE_SKILLS_DIR and CLAUDE_CONFIG_PATH overrides', () => {
    const config = loadConfig({
      CLAUDE_SKILLS_DIR: '/tmp/custom-skills',
      CLAUDE_CONFIG_PATH: '/tmp/custom-claude.json',
    } as NodeJS.ProcessEnv);
    expect(config.claudeSkillsDir).toBe('/tmp/custom-skills');
    expect(config.claudeConfigPath).toBe('/tmp/custom-claude.json');
  });
});

describe('ensureSkillVaultDirs', () => {
  const tempHome = path.join(os.tmpdir(), `skillvault-config-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('creates the home, repos, skills, and mcps directories', () => {
    const config = loadConfig({ SKILLVAULT_HOME: tempHome } as NodeJS.ProcessEnv);
    ensureSkillVaultDirs(config);
    expect(fs.existsSync(config.reposDir)).toBe(true);
    expect(fs.existsSync(config.skillsDir)).toBe(true);
    expect(fs.existsSync(config.mcpsDir)).toBe(true);
  });
});
