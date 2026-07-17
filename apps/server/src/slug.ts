import fs from 'node:fs';
import path from 'node:path';

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

export function resolveUniqueDir(parentDir: string, name: string): { slug: string; fullPath: string } {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return { slug: candidate, fullPath: path.join(parentDir, candidate) };
}

export function resolveUniqueFile(
  parentDir: string,
  name: string,
  extension: string
): { slug: string; fullPath: string } {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(path.join(parentDir, `${candidate}${extension}`))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return { slug: candidate, fullPath: path.join(parentDir, `${candidate}${extension}`) };
}
