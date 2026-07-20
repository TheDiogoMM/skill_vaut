import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface RepoFormProps {
  onCreated: (item: Item) => void;
}

export function RepoForm({ onCreated }: RepoFormProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    try {
      const item = await createItem({ type: 'repo', name, url });
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
      <Input id="repo-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="repo-url"
        label="URL do repositório"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar repositório
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
