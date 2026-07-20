import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemCard } from './ItemCard.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/skillvault/repos/repo-a',
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

describe('ItemCard', () => {
  it('links to the item detail page using the item name as the link text', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Repo A' })).toHaveAttribute('href', '/items/1');
  });

  it('renders summary, utility, tags, and local path when present', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ utility: 'Útil', tags: ['cli'] })} />
      </MemoryRouter>
    );
    expect(screen.getByText('Resumo A')).toBeInTheDocument();
    expect(screen.getByText('Útil')).toBeInTheDocument();
    expect(screen.getByText('cli')).toBeInTheDocument();
    expect(screen.getByText('/skillvault/repos/repo-a')).toBeInTheDocument();
  });

  it('shows the type badge for the item type', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ type: 'mcp' })} />
      </MemoryRouter>
    );
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });
});
