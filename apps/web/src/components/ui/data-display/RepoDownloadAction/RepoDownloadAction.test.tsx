import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RepoDownloadAction } from './RepoDownloadAction.js';
import * as client from '../../../../api/client.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'https://example.com/repo-a.git',
    localPath: '/skillvault/repos/repo-a',
    categoryId: null,
    summary: null,
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: 'not_downloaded',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('RepoDownloadAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing for non-repo items', () => {
    const { container } = render(<RepoDownloadAction item={sampleItem({ type: 'skill', downloadStatus: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a "Local" label when downloadStatus is local', () => {
    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'local' })} />);
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a "Baixado" label when downloadStatus is downloaded', () => {
    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'downloaded' })} />);
    expect(screen.getByText('Baixado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('downloads the item and calls onUpdated when downloadStatus is not_downloaded', async () => {
    const updatedItem = sampleItem({ downloadStatus: 'downloaded' });
    vi.spyOn(client, 'downloadItem').mockResolvedValue(updatedItem);
    const onUpdated = vi.fn();

    render(<RepoDownloadAction item={sampleItem({ downloadStatus: 'not_downloaded' })} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedItem));
    expect(client.downloadItem).toHaveBeenCalledWith(1);
  });
});
