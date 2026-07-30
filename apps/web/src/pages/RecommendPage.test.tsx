import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecommendPage } from './RecommendPage.js';
import * as api from '../api/client.js';
import type { DiscoverResult, Item } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'PDF Parser',
    sourceType: 'local_path',
    sourceValue: 'x',
    localPath: '/skillvault/skills/pdf-parser',
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
    ...overrides,
  };
}

describe('RecommendPage', () => {
  it('submits an idea and renders the recommended items', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem(), motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('link', { name: 'PDF Parser' })).toHaveAttribute('href', '/items/1');
    expect(screen.getByText('Ajuda a extrair texto de PDFs')).toBeInTheDocument();
    expect(screen.getByText('Nenhum repositório do catálogo cobre essa necessidade.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum MCP do catálogo cobre essa necessidade.')).toBeInTheDocument();
  });

  it('shows an error message when the API call fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockRejectedValue(
      new Error('Não foi possível gerar recomendações no momento. Tente novamente.')
    );

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar recomendações no momento. Tente novamente.'
    );
  });

  it('clears a previous error once a later submission succeeds', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    const getRecommendations = vi.spyOn(api, 'getRecommendations');
    getRecommendations.mockRejectedValueOnce(
      new Error('Não foi possível gerar recomendações no momento. Tente novamente.')
    );

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    const textarea = screen.getByLabelText('Ideia do projeto');
    const submit = screen.getByRole('button', { name: 'Recomendar' });

    await user.type(textarea, 'app de leitura de PDFs');
    await user.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar recomendações no momento. Tente novamente.'
    );

    getRecommendations.mockResolvedValueOnce({
      skills: [{ ...sampleItem(), motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });
    await user.click(submit);

    expect(await screen.findByRole('link', { name: 'PDF Parser' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the query history', async () => {
    vi.spyOn(api, 'listConsultas').mockResolvedValue([
      { id: 1, ideia: 'app de leitura de PDFs', createdAt: '2026-07-20T10:00:00.000Z' },
    ]);

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/app de leitura de PDFs/)).toBeInTheDocument();
  });

  it('truncates a long history entry to a single line, keeping the full text available on hover', async () => {
    const longIdeia = 'Uma ideia muito longa. '.repeat(50);
    vi.spyOn(api, 'listConsultas').mockResolvedValue([
      { id: 1, ideia: longIdeia, createdAt: '2026-07-20T10:00:00.000Z' },
    ]);

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await screen.findByText(/Histórico/);

    // @testing-library/dom's getByTitle/queryByTitle exact-matcher doesn't
    // reliably match extremely long attribute values, so read the attribute
    // directly instead of relying on the title-matching queries here.
    const entry = document.querySelector('li span[title]');
    expect(entry).not.toBeNull();
    expect(entry).toHaveAttribute('title', longIdeia);
    expect(entry).toHaveStyle({ overflow: 'hidden', whiteSpace: 'nowrap' });
  });

  it('shows a download action for a repo result pending download', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [
        {
          ...sampleItem({ type: 'repo', downloadStatus: 'not_downloaded' }),
          motivo: 'Já resolve o que você precisa',
        },
      ],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });

  it('downloads a repo result and updates it in place while preserving the motivo', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [
        {
          ...sampleItem({ type: 'repo', downloadStatus: 'not_downloaded' }),
          motivo: 'Já resolve o que você precisa',
        },
      ],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });
    vi.spyOn(api, 'downloadItem').mockResolvedValue(sampleItem({ type: 'repo', downloadStatus: 'downloaded' }));

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    await user.click(await screen.findByRole('button', { name: 'Baixar' }));

    expect(await screen.findByText('Baixado')).toBeInTheDocument();
    expect(screen.getByText('Já resolve o que você precisa')).toBeInTheDocument();
  });

  it('shows a global install action for a skill result not yet installed', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem({ installedGlobally: false }), motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('button', { name: 'Instalar globalmente' })).toBeInTheDocument();
  });

  it('renders a Plugins column with recommended plugin items', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [{ ...sampleItem({ type: 'plugin', name: 'Meu Plugin' }), motivo: 'Ajuda nisso' }],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu Plugin' })).toBeInTheDocument();
  });

  it('renders the "Sugestões externas" section with a card per result', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [
        {
          source: 'github',
          itemType: 'mcp',
          name: 'someone/pdf-tool',
          description: 'Handles PDFs',
          url: 'https://github.com/someone/pdf-tool',
          rating: { kind: 'stars', value: 42 },
          verified: false,
        },
      ],
    });
    vi.spyOn(api, 'translateDiscoverResults').mockImplementation((results) => Promise.resolve(results));

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByRole('heading', { name: 'Sugestões externas' })).toBeInTheDocument();
    expect(screen.getByText('someone/pdf-tool')).toBeInTheDocument();
  });

  it('does not render the "Sugestões externas" section when there are none', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem(), motivo: 'x' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    await screen.findByRole('link', { name: 'PDF Parser' });
    expect(screen.queryByRole('heading', { name: 'Sugestões externas' })).not.toBeInTheDocument();
  });

  it('translates external suggestion descriptions in a second pass after the recommendation loads', async () => {
    const user = userEvent.setup();
    const original: DiscoverResult = {
      source: 'github',
      itemType: 'mcp',
      name: 'someone/pdf-tool',
      description: 'Handles PDFs',
      url: 'https://github.com/someone/pdf-tool',
      rating: { kind: 'stars', value: 42 },
      verified: false,
    };
    const translated: DiscoverResult = { ...original, description: 'Lida com PDFs' };
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [original],
    });
    let resolveTranslate!: (value: DiscoverResult[]) => void;
    vi.spyOn(api, 'translateDiscoverResults').mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve;
      })
    );

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));

    expect(await screen.findByText('Handles PDFs')).toBeInTheDocument();

    resolveTranslate([translated]);

    expect(await screen.findByText('Lida com PDFs')).toBeInTheDocument();
    expect(screen.queryByText('Handles PDFs')).not.toBeInTheDocument();
  });

  it('copies a text summary of the recommendation to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // @testing-library/user-event >=14.5 attaches a getter-only navigator.clipboard stub
    // as soon as userEvent.setup() runs, so Object.assign (a [[Set]]) throws
    // "Cannot set property clipboard of #<Navigator> which has only a getter".
    // The stub property is configurable, so redefine it instead of assigning to it.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.spyOn(api, 'listConsultas').mockResolvedValue([]);
    vi.spyOn(api, 'getRecommendations').mockResolvedValue({
      skills: [{ ...sampleItem(), motivo: 'Ajuda a extrair texto de PDFs' }],
      repos: [],
      mcps: [],
      plugins: [],
      externalSuggestions: [],
    });

    render(
      <MemoryRouter>
        <RecommendPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Ideia do projeto'), 'app de leitura de PDFs');
    await user.click(screen.getByRole('button', { name: 'Recomendar' }));
    await screen.findByRole('link', { name: 'PDF Parser' });

    await user.click(screen.getByRole('button', { name: 'Copiar resumo' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('PDF Parser — /skillvault/skills/pdf-parser'));
    expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
  });
});
