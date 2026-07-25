import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { downloadItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';
import { AvailabilityBadge } from '../AvailabilityBadge/AvailabilityBadge.js';

export interface RepoDownloadActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function RepoDownloadAction({ item, onUpdated }: RepoDownloadActionProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  if (item.type !== 'repo' || !item.downloadStatus) return null;

  if (item.downloadStatus === 'local') {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Local
      </AvailabilityBadge>
    );
  }

  if (item.downloadStatus === 'downloaded') {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Baixado
      </AvailabilityBadge>
    );
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
