import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface PluginFormProps {
  onCreated: (item: Item) => void;
  initialName?: string;
  initialUrl?: string;
}

export function PluginForm({ onCreated, initialName = '', initialUrl = '' }: PluginFormProps) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    try {
      const item = await createItem({ type: 'plugin', name, url });
      setName('');
      setUrl('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="plugin-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="plugin-url"
        label="URL do repositório"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar plugin
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
