import fs from 'node:fs';
import path from 'node:path';
import type { SkillVaultConfig } from './config.js';
import type { Item } from './types.js';

type ClaudeLocations = Pick<SkillVaultConfig, 'claudeSkillsDir' | 'claudeConfigPath'>;

export function isSkillInstalledGlobally(config: ClaudeLocations, item: Item): boolean {
  const target = path.join(config.claudeSkillsDir, path.basename(item.localPath));
  return fs.existsSync(target);
}

export function isMcpInstalledGlobally(config: ClaudeLocations, item: Item): boolean {
  if (!fs.existsSync(config.claudeConfigPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(config.claudeConfigPath, 'utf-8'));
    return typeof parsed.mcpServers === 'object' && parsed.mcpServers !== null && item.name in parsed.mcpServers;
  } catch {
    return false;
  }
}

export function mcpHasRedactedSecret(item: Item): boolean {
  try {
    const raw = fs.readFileSync(item.localPath, 'utf-8');
    return raw.includes('REDACTED');
  } catch {
    return false;
  }
}

export interface GlobalStatus {
  installedGlobally: boolean | null;
  hasRedactedSecret: boolean | null;
  installedPath: string | null;
}

export function computeGlobalStatus(config: ClaudeLocations, item: Item): GlobalStatus {
  if (item.type === 'skill') {
    const installed = isSkillInstalledGlobally(config, item);
    return {
      installedGlobally: installed,
      hasRedactedSecret: null,
      installedPath: installed ? path.join(config.claudeSkillsDir, path.basename(item.localPath)) : null,
    };
  }
  if (item.type === 'mcp') {
    const installed = isMcpInstalledGlobally(config, item);
    return {
      installedGlobally: installed,
      hasRedactedSecret: mcpHasRedactedSecret(item),
      installedPath: installed ? config.claudeConfigPath : null,
    };
  }
  return { installedGlobally: null, hasRedactedSecret: null, installedPath: null };
}
