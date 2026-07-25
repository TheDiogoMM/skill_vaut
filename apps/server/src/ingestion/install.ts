import fs from 'node:fs';
import path from 'node:path';
import type { SkillVaultConfig } from '../config.js';
import type { Item } from '../types.js';

export function installSkillGlobally(config: SkillVaultConfig, item: Item): void {
  const targetName = path.basename(item.localPath);
  fs.mkdirSync(config.claudeSkillsDir, { recursive: true });
  fs.cpSync(item.localPath, path.join(config.claudeSkillsDir, targetName), { recursive: true });
}

export function installMcpGlobally(config: SkillVaultConfig, item: Item): void {
  const mcpConfig = JSON.parse(fs.readFileSync(item.localPath, 'utf-8'));

  if (JSON.stringify(mcpConfig).includes('<REDACTED>')) {
    throw new Error('refusing to install an mcp config that contains a redacted secret');
  }

  let parsed: Record<string, unknown> = {};
  const configExists = fs.existsSync(config.claudeConfigPath);
  if (configExists) {
    try {
      parsed = JSON.parse(fs.readFileSync(config.claudeConfigPath, 'utf-8'));
    } catch {
      throw new Error('failed to parse CLAUDE_CONFIG_PATH');
    }
    const backupPath = `${config.claudeConfigPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(config.claudeConfigPath, backupPath);
  }

  const mcpServers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  parsed.mcpServers = { ...mcpServers, [item.name]: mcpConfig };

  fs.writeFileSync(config.claudeConfigPath, JSON.stringify(parsed, null, 2), 'utf-8');
}
