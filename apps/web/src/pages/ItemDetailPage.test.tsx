import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemDetailPage } from './ItemDetailPage.js';
import * as api from '../api/client.js';
import type { ItemDetail } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
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

  it('shows an error state when the item cannot be loaded', async () => {
    vi.spyOn(api, 'getItem').mockRejectedValue(new Error('not found'));
    renderWithRoute('999');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
