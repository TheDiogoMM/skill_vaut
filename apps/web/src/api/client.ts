import type { Category, Item, ItemDetail, ItemFilters, ItemUpdate, RecommendResult, Consulta } from '../types.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isJsonBody = typeof init?.body === 'string';
  const response = await fetch(path, {
    ...init,
    headers: isJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorBody.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQuery(filters: ItemFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.category !== undefined) params.set('category', String(filters.category));
  if (filters.tag) params.set('tag', filters.tag);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listItems(filters?: ItemFilters): Promise<Item[]> {
  return request<Item[]>(`/api/items${buildQuery(filters)}`);
}

export function getItem(id: number): Promise<ItemDetail> {
  return request<ItemDetail>(`/api/items/${id}`);
}

export function updateItem(id: number, patch: ItemUpdate): Promise<Item> {
  return request<Item>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteItem(id: number): Promise<void> {
  return request<void>(`/api/items/${id}`, { method: 'DELETE' });
}

export function downloadItem(id: number): Promise<Item> {
  return request<Item>(`/api/items/${id}/download`, { method: 'POST' });
}

export function installItem(id: number): Promise<Item> {
  return request<Item>(`/api/items/${id}/install`, { method: 'POST' });
}

export interface CreateRepoInput {
  type: 'repo';
  name: string;
  url: string;
}

export interface CreatePluginInput {
  type: 'plugin';
  name: string;
  url: string;
}

export interface CreateMcpInput {
  type: 'mcp';
  name: string;
  config: Record<string, unknown>;
  description?: string;
}

export type CreateSkillInput =
  | { type: 'skill'; name: string; source_type: 'local_path'; path: string }
  | { type: 'skill'; name: string; source_type: 'url'; url: string }
  | { type: 'skill'; name: string; source_type: 'upload'; file: File };

export type CreateItemInput = CreateRepoInput | CreateMcpInput | CreateSkillInput | CreatePluginInput;

export function createItem(input: CreateItemInput): Promise<Item> {
  if (input.type === 'skill' && input.source_type === 'upload') {
    const formData = new FormData();
    formData.set('type', input.type);
    formData.set('name', input.name);
    formData.set('source_type', input.source_type);
    formData.set('file', input.file);
    return request<Item>('/api/items', { method: 'POST', body: formData });
  }
  return request<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) });
}

export function listCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories');
}

export function createCategory(name: string): Promise<Category> {
  return request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
}

export function renameCategory(id: number, name: string): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function mergeCategory(sourceId: number, targetId: number): Promise<void> {
  return request<void>(`/api/categories/${sourceId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId }),
  });
}

export function getRecommendations(ideia: string): Promise<RecommendResult> {
  return request<RecommendResult>('/api/recommend', {
    method: 'POST',
    body: JSON.stringify({ ideia }),
  });
}

export function listConsultas(): Promise<Consulta[]> {
  return request<Consulta[]>('/api/consultas');
}
