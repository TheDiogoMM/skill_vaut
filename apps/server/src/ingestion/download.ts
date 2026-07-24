import { simpleGit } from 'simple-git';
import type { ItemsRepository } from '../db/repositories/items.js';
import type { Item } from '../types.js';
import { assertSafeRepoUrl } from './repo.js';

export async function downloadRepo(itemsRepo: ItemsRepository, item: Item): Promise<Item> {
  assertSafeRepoUrl(item.sourceValue);
  await simpleGit().clone(item.sourceValue, item.localPath);
  return itemsRepo.markDownloaded(item.id);
}
