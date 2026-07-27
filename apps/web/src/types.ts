export type ItemType = 'skill' | 'repo' | 'mcp' | 'plugin';
export type SourceType = 'local_path' | 'upload' | 'url' | 'manual';
export type EnrichmentSource = 'ollama' | 'gemini' | 'manual';
export type GlobalInstallStatus = 'success' | 'failed';
export type DownloadStatus = 'local' | 'not_downloaded' | 'downloaded';

export interface Category {
  id: number;
  name: string;
  createdAt: string;
}

export interface Item {
  id: number;
  type: ItemType;
  name: string;
  sourceType: SourceType;
  sourceValue: string;
  localPath: string;
  categoryId: number | null;
  summary: string | null;
  utility: string | null;
  tags: string[];
  enrichmentSource: EnrichmentSource | null;
  globalInstallStatus: GlobalInstallStatus | null;
  downloadStatus: DownloadStatus | null;
  installedGlobally: boolean | null;
  hasRedactedSecret: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDetail extends Item {
  content: string;
}

export interface ItemFilters {
  q?: string;
  type?: ItemType;
  category?: number;
  tag?: string;
}

export interface ItemUpdate {
  categoryId?: number | null;
  summary?: string | null;
  utility?: string | null;
  tags?: string[];
}

export interface RecommendedItem extends Item {
  motivo: string;
}

export interface RecommendResult {
  skills: RecommendedItem[];
  repos: RecommendedItem[];
  mcps: RecommendedItem[];
  plugins: RecommendedItem[];
}

export interface Consulta {
  id: number;
  ideia: string;
  createdAt: string;
}

export type DiscoverItemType = 'skill' | 'mcp' | 'plugin';
export type DiscoverSource = 'github' | 'mcp_registry' | 'smithery';

export interface DiscoverResult {
  source: DiscoverSource;
  itemType: DiscoverItemType;
  name: string;
  description: string | null;
  url: string;
  rating: { kind: 'stars' | 'use_count' | 'official'; value: number | null };
  verified: boolean;
}
