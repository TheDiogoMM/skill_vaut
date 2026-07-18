import fs from 'node:fs';
import path from 'node:path';
import type { Item } from './types.js';

export const REPO_CONTENT_CANDIDATES = ['README.md', 'readme.md', 'README'];
export const SKILL_CONTENT_CANDIDATES = ['SKILL.md', 'README.md', 'readme.md'];

export function readFirstExisting(dir: string, candidates: string[]): string {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

export function readItemContent(item: Item): string {
  try {
    if (item.type === 'mcp') {
      return fs.existsSync(item.localPath) ? fs.readFileSync(item.localPath, 'utf-8') : '';
    }
    const candidates = item.type === 'skill' ? SKILL_CONTENT_CANDIDATES : REPO_CONTENT_CANDIDATES;
    return readFirstExisting(item.localPath, candidates);
  } catch {
    return '';
  }
}
