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
}

export interface Consulta {
  id: number;
  ideia: string;
  createdAt: string;
}
