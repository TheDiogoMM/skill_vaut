import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface SkillVaultConfig {
  skillvaultHome: string;
  dbPath: string;
  reposDir: string;
  skillsDir: string;
  mcpsDir: string;
  indexJsonPath: string;
  indexMdPath: string;
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  port: number;
  claudeSkillsDir: string;
  claudeConfigPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SkillVaultConfig {
  const skillvaultHome = env.SKILLVAULT_HOME || path.join(os.homedir(), 'skillvault');

  return {
    skillvaultHome,
    dbPath: path.join(skillvaultHome, 'skillvault.db'),
    reposDir: path.join(skillvaultHome, 'repos'),
    skillsDir: path.join(skillvaultHome, 'skills'),
    mcpsDir: path.join(skillvaultHome, 'mcps'),
    indexJsonPath: path.join(skillvaultHome, 'index.json'),
    indexMdPath: path.join(skillvaultHome, 'INDEX.md'),
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: env.OLLAMA_MODEL || 'llama3.2',
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiModel: env.GEMINI_MODEL || 'gemini-2.0-flash',
    port: Number(env.PORT) || 3001,
    claudeSkillsDir: env.CLAUDE_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills'),
    claudeConfigPath: env.CLAUDE_CONFIG_PATH || path.join(os.homedir(), '.claude.json'),
  };
}

export function ensureSkillVaultDirs(config: SkillVaultConfig): void {
  for (const dir of [config.skillvaultHome, config.reposDir, config.skillsDir, config.mcpsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
