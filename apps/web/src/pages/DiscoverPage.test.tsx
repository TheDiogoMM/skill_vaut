import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverPage } from './DiscoverPage.js';
import * as api from '../api/client.js';
import type { DiscoverResult } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleResult(overrides: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    source: 'github',
    itemType: 'mcp',
    name: 'someone/awesome-mcp',
    description: 'An awesome MCP server',
    url: 'https://github.com/someone/awesome-mcp',
    rating: { kind: 'stars', value: 1234 },
    verified: false,
    ...overrides,
  };
}

describe('DiscoverPage', () => {
  it('loads highlighted results (empty query) on mount, grouped by source', async () => {
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([
      sampleResult({ source: 'github' }),
      sampleResult({ source: 'mcp_registry', name: 'io.example/pdf' }),
    ]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registro oficial de MCP' })).toBeInTheDocument();
    expect(discoverSpy).toHaveBeenCalledWith('', undefined);
  });

  it('shows an empty state when no source returns results', async () => {
    vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.spyOn(api, 'discoverItems').mockRejectedValue(new Error('network error'));

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('refetches with the typed query after the debounce delay', async () => {
    const user = userEvent.setup();
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum resultado encontrado.');
    discoverSpy.mockClear();

    await user.type(screen.getByLabelText('Buscar'), 'pdf');

    await vi.waitFor(() => {
      expect(discoverSpy).toHaveBeenCalledWith('pdf', undefined);
    });
  });

  it('refetches when the type filter changes', async () => {
    const user = userEvent.setup();
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    await screen.findByText('Nenhum resultado encontrado.');
    discoverSpy.mockClear();

    await user.selectOptions(screen.getByLabelText('Tipo'), 'plugin');

    await vi.waitFor(() => {
      expect(discoverSpy).toHaveBeenCalledWith('', 'plugin');
    });
  });
});
