import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  listCategories,
  createCategory,
  renameCategory,
  mergeCategory,
  getRecommendations,
  listConsultas,
} from './client.js';

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = ok ? 200 : 400 } = init;
  const mock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('listItems builds a query string from filters', async () => {
    const mock = mockFetchOnce([]);
    await listItems({ q: 'foo', type: 'repo', category: 2, tag: 'bar' });
    expect(mock).toHaveBeenCalledWith('/api/items?q=foo&type=repo&category=2&tag=bar', expect.anything());
  });

  it('listItems omits the query string when there are no filters', async () => {
    const mock = mockFetchOnce([]);
    await listItems();
    expect(mock).toHaveBeenCalledWith('/api/items', expect.anything());
  });

  it('getItem fetches a single item by id', async () => {
    mockFetchOnce({ id: 1, name: 'x', content: '# hi' });
    const item = await getItem(1);
    expect(item.content).toBe('# hi');
  });

  it('createItem sends a JSON body with a Content-Type header for repo type', async () => {
    const mock = mockFetchOnce({ id: 1 });
    await createItem({ type: 'repo', name: 'x', url: 'https://example.com/x.git' });
    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ type: 'repo', name: 'x', url: 'https://example.com/x.git' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('createItem sends FormData for skill upload without a JSON content-type header', async () => {
    const mock = mockFetchOnce({ id: 1 });
    const file = new File(['# Skill'], 'SKILL.md', { type: 'text/markdown' });
    await createItem({ type: 'skill', name: 'x', source_type: 'upload', file });
    const [, init] = mock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });

  it('updateItem sends a PATCH request to the item URL', async () => {
    const mock = mockFetchOnce({ id: 1, summary: 'novo' });
    await updateItem(1, { summary: 'novo' });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/items/1');
    expect(init.method).toBe('PATCH');
  });

  it('deleteItem sends a DELETE request and resolves on a 204 response', async () => {
    mockFetchOnce({}, { status: 204 });
    await expect(deleteItem(1)).resolves.toBeUndefined();
  });

  it('throws with the server error message on a failed request', async () => {
    mockFetchOnce({ error: 'item not found' }, { ok: false, status: 404 });
    await expect(getItem(999)).rejects.toThrow('item not found');
  });

  it('falls back to a descriptive message when the error body has no usable error field', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(getItem(999)).rejects.toThrow(/status 500/);
  });

  it('listCategories and createCategory hit the categories endpoint', async () => {
    mockFetchOnce([{ id: 1, name: 'dev-tools', createdAt: '' }]);
    const categories = await listCategories();
    expect(categories).toHaveLength(1);

    const mock = mockFetchOnce({ id: 2, name: 'automacao', createdAt: '' });
    await createCategory('automacao');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories');
    expect(JSON.parse(init.body)).toEqual({ name: 'automacao' });
  });

  it('renameCategory sends a PATCH with the new name', async () => {
    const mock = mockFetchOnce({ id: 1, name: 'novo-nome', createdAt: '' });
    await renameCategory(1, 'novo-nome');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories/1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'novo-nome' });
  });

  it('mergeCategory posts source and target ids', async () => {
    const mock = mockFetchOnce({}, { status: 204 });
    await mergeCategory(1, 2);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/categories/1/merge');
    expect(JSON.parse(init.body)).toEqual({ target_id: 2 });
  });

  it('getRecommendations posts the idea and returns the parsed result', async () => {
    const mock = mockFetchOnce({ skills: [], repos: [], mcps: [] });
    const result = await getRecommendations('app de leitura de PDFs');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/recommend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ideia: 'app de leitura de PDFs' });
    expect(result).toEqual({ skills: [], repos: [], mcps: [] });
  });

  it('listConsultas fetches the recent query history', async () => {
    mockFetchOnce([{ id: 1, ideia: 'x', createdAt: '' }]);
    const consultas = await listConsultas();
    expect(consultas).toHaveLength(1);
  });
});
