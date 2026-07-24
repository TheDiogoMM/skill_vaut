import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { downloadItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';

export interface RepoDownloadActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function RepoDownloadAction({ item, onUpdated }: RepoDownloadActionProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  if (item.type !== 'repo' || !item.downloadStatus) return null;

  if (item.downloadStatus === 'local') {
    return <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Local</span>;
  }

  if (item.downloadStatus === 'downloaded') {
    return <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Baixado</span>;
  }

  async function handleDownload() {
    setStatus('downloading');
    try {
      const updated = await downloadItem(item.id);
      setStatus('idle');
      onUpdated?.(updated);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleDownload} disabled={status === 'downloading'}>
        {status === 'downloading' ? 'Baixando...' : 'Baixar'}
      </Button>
      {status === 'error' && <StatusMessage kind="error">Erro ao baixar.</StatusMessage>}
    </div>
  );
}
