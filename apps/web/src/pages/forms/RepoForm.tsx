import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

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
    <form onSubmit={handleSubmit}>
      <label htmlFor="repo-name">Nome</label>
      <input id="repo-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="repo-url">URL do repositório</label>
      <input id="repo-url" value={url} onChange={(e) => setUrl(e.target.value)} required />

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar repositório
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
