import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemDetailPage } from './ItemDetailPage.js';
import * as api from '../api/client.js';
import type { ItemDetail } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(api, 'listCategories').mockResolvedValue([]);
});

function sampleDetail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/tmp/repo-a',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    installedPath: null,
    createdAt: '',
    updatedAt: '',
    content: '',
    ...overrides,
  };
}

function renderWithRoute(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/items/${id}`]}>
      <Routes>
        <Route path="/items/:id" element={<ItemDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ItemDetailPage', () => {
  it('renders markdown content for a repo item', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ summary: 'Resumo', utility: 'Utilidade', tags: ['a'], content: '# Título\n\nTexto' })
    );

    renderWithRoute('1');

    expect(await screen.findByRole('heading', { name: 'Repo A', level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Título', level: 1 })).toBeInTheDocument();
  });

  it('renders raw JSON for an mcp item', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ id: 2, type: 'mcp', name: 'MCP B', localPath: '/tmp/mcp-b.json', content: '{"mcpServers":{}}' })
    );

    renderWithRoute('2');

    expect(await screen.findByText('{"mcpServers":{}}')).toBeInTheDocument();
  });

  it('copies the local path to the clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail());
    const writeText = vi.fn().mockResolvedValue(undefined);
    // @testing-library/user-event >=14.5 attaches a getter-only navigator.clipboard stub
    // as soon as userEvent.setup() runs, so Object.assign (a [[Set]]) throws
    // "Cannot set property clipboard of #<Navigator> which has only a getter".
    // The stub property is configurable, so redefine it instead of assigning to it.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderWithRoute('1');

    const button = await screen.findByRole('button', { name: 'Copiar caminho' });
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith('/tmp/repo-a');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
    });
  });

  it('shows a download action for a repo pending download', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail({ downloadStatus: 'not_downloaded' }));

    renderWithRoute('1');

    expect(await screen.findByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });

  it('downloads a repo and updates the UI in place without remounting the page', async () => {
    const user = userEvent.setup();
    const detail = sampleDetail({
      downloadStatus: 'not_downloaded',
      content: '# Repo A\n\nConteúdo do README.',
    });
    const getItemSpy = vi.spyOn(api, 'getItem').mockResolvedValue(detail);
    // The real downloadItem endpoint returns a plain Item, which has no
    // `content` field (only ItemDetail does) — mirror that here instead of
    // spreading `detail`, so the mock can't accidentally leak `content`
    // into `updated` and mask a regression in the setItem merge.
    const { content: _content, ...itemWithoutContent } = detail;
    vi.spyOn(api, 'downloadItem').mockResolvedValue({ ...itemWithoutContent, downloadStatus: 'downloaded' });

    renderWithRoute('1');

    expect(await screen.findByRole('heading', { name: 'Repo A', level: 2 })).toBeInTheDocument();

    const button = await screen.findByRole('button', { name: 'Baixar' });
    await user.click(button);

    expect(await screen.findByText('Baixado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Repo A', level: 2 })).toBeInTheDocument();

    // `content` is only present on ItemDetail, not on the plain Item the
    // download endpoint returns. Asserting it survives proves the merge
    // still spreads the previous state rather than replacing it wholesale.
    expect(screen.getByRole('heading', { name: 'Repo A', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do README.')).toBeInTheDocument();

    // The page must not remount/refetch after the download completes.
    expect(getItemSpy).toHaveBeenCalledTimes(1);
  });

  it('shows an error state when the item cannot be loaded', async () => {
    vi.spyOn(api, 'getItem').mockRejectedValue(new Error('not found'));
    renderWithRoute('999');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('edits category and tags and saves them', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getItem').mockResolvedValue(sampleDetail({ tags: ['a', 'b'] }));
    vi.spyOn(api, 'listCategories').mockResolvedValue([{ id: 5, name: 'dev-tools', createdAt: '' }]);
    const updateItemSpy = vi.spyOn(api, 'updateItem').mockResolvedValue({
      ...sampleDetail({ categoryId: 5, tags: ['novo'] }),
    });

    renderWithRoute('1');

    const categorySelect = await screen.findByLabelText('Categoria');
    await user.selectOptions(categorySelect, '5');

    const tagsInput = screen.getByLabelText('Tags (separadas por vírgula)');
    await user.clear(tagsInput);
    await user.type(tagsInput, 'novo');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateItemSpy).toHaveBeenCalledWith(1, { categoryId: 5, tags: ['novo'] });
    });
    expect(await screen.findByText('Salvo!')).toBeInTheDocument();
  });

  it('resets save status when navigating to a different item', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getItem').mockImplementation((id: number) =>
      Promise.resolve(sampleDetail({ id, name: `Item ${id}` }))
    );
    vi.spyOn(api, 'updateItem').mockResolvedValue(sampleDetail({ id: 1 }));

    // ItemDetailPage is mounted once at the /items/:id route; React Router
    // re-renders it with a new useParams() value on navigation rather than
    // remounting it, so this must navigate via a real <Link> click within the
    // same MemoryRouter instance (not a separate render/renderWithRoute call)
    // to reproduce the bug.
    render(
      <MemoryRouter initialEntries={['/items/1']}>
        <Routes>
          <Route
            path="/items/:id"
            element={
              <>
                <Link to="/items/2">Ir para item 2</Link>
                <ItemDetailPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Item 1', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Salvo!')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ir para item 2' }));

    expect(await screen.findByRole('heading', { name: 'Item 2', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('Salvo!')).not.toBeInTheDocument();
  });

  it('shows a global install action for a skill pending install', async () => {
    vi.spyOn(api, 'getItem').mockResolvedValue(
      sampleDetail({ type: 'skill', downloadStatus: null, installedGlobally: false })
    );

    renderWithRoute('1');

    expect(await screen.findByRole('button', { name: 'Instalar globalmente' })).toBeInTheDocument();
  });
});
