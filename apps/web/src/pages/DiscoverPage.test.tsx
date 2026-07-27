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

function mockTranslateAsEcho() {
  return vi.spyOn(api, 'translateDiscoverResults').mockImplementation((results) => Promise.resolve(results));
}

describe('DiscoverPage', () => {
  it('loads highlighted results (empty query) on mount, grouped by source', async () => {
    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValue([
      sampleResult({ source: 'github' }),
      sampleResult({ source: 'mcp_registry', name: 'io.example/pdf' }),
    ]);
    mockTranslateAsEcho();

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
    mockTranslateAsEcho();

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
    mockTranslateAsEcho();

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
    mockTranslateAsEcho();

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

  it('shows results immediately in their original language, then swaps in the translated version once it arrives', async () => {
    const original = sampleResult({ description: 'An awesome MCP server' });
    const translated = { ...original, description: 'Um servidor MCP incrível' };
    vi.spyOn(api, 'discoverItems').mockResolvedValue([original]);
    let resolveTranslate!: (value: DiscoverResult[]) => void;
    vi.spyOn(api, 'translateDiscoverResults').mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve;
      })
    );

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('An awesome MCP server')).toBeInTheDocument();
    expect(screen.queryByText('Um servidor MCP incrível')).not.toBeInTheDocument();

    resolveTranslate([translated]);

    expect(await screen.findByText('Um servidor MCP incrível')).toBeInTheDocument();
    expect(screen.queryByText('An awesome MCP server')).not.toBeInTheDocument();
  });

  it('discards a stale translation for an old query once a newer query already has results', async () => {
    const user = userEvent.setup();
    const resultA = sampleResult({ name: 'result-a', description: 'Description A', url: 'https://example.com/a' });
    const resultB = sampleResult({ name: 'result-b', description: 'Description B', url: 'https://example.com/b' });
    const translatedA = { ...resultA, description: 'Tradução A (não deveria aparecer)' };
    const translatedB = { ...resultB, description: 'Tradução B' };

    const discoverSpy = vi.spyOn(api, 'discoverItems').mockResolvedValueOnce([resultA]);
    let resolveTranslateA!: (value: DiscoverResult[]) => void;
    const translateSpy = vi.spyOn(api, 'translateDiscoverResults').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTranslateA = resolve;
      })
    );

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Description A')).toBeInTheDocument();

    discoverSpy.mockResolvedValueOnce([resultB]);
    translateSpy.mockResolvedValueOnce([translatedB]);

    await user.type(screen.getByLabelText('Buscar'), 'x');

    expect(await screen.findByText('Tradução B')).toBeInTheDocument();

    resolveTranslateA([translatedA]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText('Tradução A (não deveria aparecer)')).not.toBeInTheDocument();
    expect(screen.getByText('Tradução B')).toBeInTheDocument();
  });

  it('keeps showing the original description if translateDiscoverResults fails', async () => {
    vi.spyOn(api, 'discoverItems').mockResolvedValue([sampleResult({ description: 'An awesome MCP server' })]);
    vi.spyOn(api, 'translateDiscoverResults').mockRejectedValue(new Error('translation unavailable'));

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('An awesome MCP server')).toBeInTheDocument();
  });
});
