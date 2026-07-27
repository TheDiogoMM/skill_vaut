import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalInstallAction } from './GlobalInstallAction.js';
import * as client from '../../../../api/client.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'skill',
    name: 'Minha Skill',
    sourceType: 'local_path',
    sourceValue: '/skillvault/skills/minha-skill',
    localPath: '/skillvault/skills/minha-skill',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: false,
    hasRedactedSecret: null,
    installedPath: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('GlobalInstallAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing for repo items', () => {
    const { container } = render(
      <GlobalInstallAction item={sampleItem({ type: 'repo', installedGlobally: null, downloadStatus: 'local' })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an "Instalado" badge when installedGlobally is true', () => {
    render(<GlobalInstallAction item={sampleItem({ installedGlobally: true })} />);
    expect(screen.getByText('Instalado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a redacted-secret message with no button when hasRedactedSecret is true', () => {
    render(<GlobalInstallAction item={sampleItem({ type: 'mcp', installedGlobally: false, hasRedactedSecret: true })} />);
    expect(screen.getByText('Segredo redigido — instale manualmente')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('installs the item and calls onUpdated when not installed and has no redacted secret', async () => {
    const updatedItem = sampleItem({ installedGlobally: true });
    vi.spyOn(client, 'installItem').mockResolvedValue(updatedItem);
    const onUpdated = vi.fn();

    render(<GlobalInstallAction item={sampleItem({ installedGlobally: false })} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar globalmente' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedItem));
    expect(client.installItem).toHaveBeenCalledWith(1);
  });

  it('shows the real install path as a tooltip on the "Instalado" badge', () => {
    render(
      <GlobalInstallAction
        item={sampleItem({ installedGlobally: true, installedPath: 'C:\\Users\\me\\.claude\\skills\\minha-skill' })}
      />
    );
    expect(screen.getByText('Instalado')).toHaveAttribute('title', 'C:\\Users\\me\\.claude\\skills\\minha-skill');
  });
});
