import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from './CatalogPage.js';
import * as api from '../api/client.js';
import type { Item } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: 'x',
    categoryId: null,
    summary: 'Resumo A',
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('CatalogPage', () => {
  it('groups items by category and renders them', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([
      sampleItem({ id: 1, name: 'Repo A', categoryId: 1 }),
      sampleItem({ id: 2, type: 'mcp', name: 'MCP B', categoryId: null }),
    ]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([{ id: 1, name: 'dev-tools', createdAt: '' }]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('dev-tools')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repo A' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MCP B' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no items', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum item cadastrado ainda.')).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.spyOn(api, 'listItems').mockRejectedValue(new Error('network error'));
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
