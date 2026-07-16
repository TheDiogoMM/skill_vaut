export type ItemType = 'skill' | 'repo' | 'mcp';
export type SourceType = 'local_path' | 'upload' | 'url' | 'manual';
export type EnrichmentSource = 'ollama' | 'gemini' | 'manual';
export type GlobalInstallStatus = 'success' | 'failed';

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
