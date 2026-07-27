import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverResultCard } from './DiscoverResultCard.js';
import type { DiscoverResult } from '../types.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
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

describe('DiscoverResultCard', () => {
  it('formats star ratings compactly', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard result={sampleResult()} />
      </MemoryRouter>
    );
    expect(screen.getByText('★ 1.2k')).toBeInTheDocument();
  });

  it('formats use_count ratings', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'smithery', rating: { kind: 'use_count', value: 500 } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('500 usos')).toBeInTheDocument();
  });

  it('shows an "Oficial" badge for mcp_registry results without a numeric rating', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'mcp_registry', verified: true, rating: { kind: 'official', value: null } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Oficial')).toBeInTheDocument();
  });

  it('shows a "Verificado" badge for verified Smithery results', () => {
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({ source: 'smithery', verified: true, rating: { kind: 'use_count', value: 10 } })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Verificado')).toBeInTheDocument();
  });

  it('navigates to /add with the result data as query params when "Adicionar ao vault" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DiscoverResultCard
          result={sampleResult({
            itemType: 'plugin',
            name: 'someone/my-plugin',
            url: 'https://github.com/someone/my-plugin',
          })}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar ao vault' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/add?type=plugin&name=someone%2Fmy-plugin&url=https%3A%2F%2Fgithub.com%2Fsomeone%2Fmy-plugin'
    );
  });
});
