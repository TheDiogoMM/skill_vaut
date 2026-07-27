import { useState } from 'react';
import type { Item } from '../../../../types.js';
import { installItem } from '../../../../api/client.js';
import { Button } from '../../core/Button/Button.js';
import { StatusMessage } from '../../feedback/StatusMessage/StatusMessage.js';
import { AvailabilityBadge } from '../AvailabilityBadge/AvailabilityBadge.js';

export interface GlobalInstallActionProps {
  item: Item;
  onUpdated?: (item: Item) => void;
}

export function GlobalInstallAction({ item, onUpdated }: GlobalInstallActionProps) {
  const [status, setStatus] = useState<'idle' | 'installing' | 'error'>('idle');

  if (item.type !== 'skill' && item.type !== 'mcp') return null;
  if (item.installedGlobally === null) return null;

  if (item.installedGlobally) {
    return (
      <AvailabilityBadge tone="positive" icon="check-circle-2" title={item.installedPath ?? undefined}>
        Instalado
      </AvailabilityBadge>
    );
  }

  if (item.hasRedactedSecret) {
    return (
      <AvailabilityBadge tone="neutral" icon="alert-circle">
        Segredo redigido — instale manualmente
      </AvailabilityBadge>
    );
  }

  async function handleInstall() {
    setStatus('installing');
    try {
      const updated = await installItem(item.id);
      setStatus('idle');
      onUpdated?.(updated);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleInstall} disabled={status === 'installing'}>
        {status === 'installing' ? 'Instalando...' : 'Instalar globalmente'}
      </Button>
      {status === 'error' && <StatusMessage kind="error">Erro ao instalar.</StatusMessage>}
    </div>
  );
}
