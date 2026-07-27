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
  createdAt: string;
  updatedAt: string;
}

export interface EnrichmentResult {
  summary: string;
  utility: string;
  category: string;
  tags: string[];
  source: EnrichmentSource;
}

export interface Consulta {
  id: number;
  ideia: string;
  createdAt: string;
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
