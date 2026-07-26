import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('CatalogPage', () => {
  it('groups items by category and renders them', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([
      sampleItem({
        id: 1,
        name: 'Repo A',
        categoryId: 1,
        utility: 'Útil para automação de testes',
        tags: ['cli', 'testing'],
        localPath: '/skillvault/repos/repo-a',
      }),
      sampleItem({ id: 2, type: 'mcp', name: 'MCP B', categoryId: null }),
    ]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([{ id: 1, name: 'dev-tools', createdAt: '' }]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'dev-tools' })).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repo A' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MCP B' })).toBeInTheDocument();
    expect(screen.getByText('Útil para automação de testes')).toBeInTheDocument();
    expect(screen.getByText('cli')).toBeInTheDocument();
    expect(screen.getByText('testing')).toBeInTheDocument();
    expect(screen.getByText('/skillvault/repos/repo-a')).toBeInTheDocument();
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

  it('refetches items when the filter changes', async () => {
    const user = userEvent.setup();
    const listItemsSpy = vi.spyOn(api, 'listItems').mockResolvedValue([]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum item cadastrado ainda.');
    listItemsSpy.mockClear();

    await user.type(screen.getByLabelText('Buscar'), 'ollama');

    await waitFor(
      () => {
        expect(listItemsSpy).toHaveBeenCalledWith({ q: 'ollama' });
      },
      { timeout: 2000 }
    );
  });

  it('refetches after a category change is reported by CategoryManager', async () => {
    const user = userEvent.setup();
    const listItemsSpy = vi.spyOn(api, 'listItems').mockResolvedValue([]);
    const listCategoriesSpy = vi
      .spyOn(api, 'listCategories')
      .mockResolvedValue([{ id: 1, name: 'dev-tools', createdAt: '' }]);
    vi.spyOn(api, 'renameCategory').mockResolvedValue({ id: 1, name: 'ferramentas', createdAt: '' });

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Renomear' });
    listCategoriesSpy.mockClear();
    listItemsSpy.mockClear();

    await user.click(screen.getByRole('button', { name: 'Renomear' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(listCategoriesSpy).toHaveBeenCalled();
    });
  });

  it('updates the card in place after a repo download, without refetching the list', async () => {
    const user = userEvent.setup();
    const repoItem = sampleItem({
      id: 1,
      name: 'Repo A',
      downloadStatus: 'not_downloaded',
    });
    const listItemsSpy = vi.spyOn(api, 'listItems').mockResolvedValue([repoItem]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);
    vi.spyOn(api, 'downloadItem').mockResolvedValue({ ...repoItem, downloadStatus: 'downloaded' });

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Baixar' }));

    expect(await screen.findByText('Baixado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    expect(listItemsSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the export buttons once the catalog has loaded', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([sampleItem()]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Baixar .md' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar .pdf' })).toBeInTheDocument();
  });

  it('disables the export buttons while the catalog is empty', async () => {
    vi.spyOn(api, 'listItems').mockResolvedValue([]);
    vi.spyOn(api, 'listCategories').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum item cadastrado ainda.');
    expect(screen.getByRole('button', { name: 'Baixar .md' })).toBeDisabled();
  });
});
