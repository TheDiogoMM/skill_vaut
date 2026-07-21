import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecommendPage } from './RecommendPage.js';
import * as api from '../api/client.js';
import type { Item } from '../types.js';

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
});
