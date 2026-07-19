import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

interface SkillFormProps {
  onCreated: (item: Item) => void;
}

type SourceTab = 'local_path' | 'upload' | 'url';

export function SkillForm({ onCreated }: SkillFormProps) {
  const [name, setName] = useState('');
  const [tab, setTab] = useState<SourceTab>('local_path');
  const [localPath, setLocalPath] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (tab === 'upload' && !file) {
      setError('Selecione um arquivo para enviar.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      let item: Item;
      if (tab === 'local_path') {
        item = await createItem({ type: 'skill', name, source_type: 'local_path', path: localPath });
      } else if (tab === 'url') {
        item = await createItem({ type: 'skill', name, source_type: 'url', url });
      } else {
        item = await createItem({ type: 'skill', name, source_type: 'upload', file: file! });
      }
      setName('');
      setLocalPath('');
      setUrl('');
      setFile(null);
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="skill-name">Nome</label>
      <input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <div role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'local_path'} onClick={() => setTab('local_path')}>
          Caminho local
        </button>
        <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}>
          Upload
        </button>
        <button type="button" role="tab" aria-selected={tab === 'url'} onClick={() => setTab('url')}>
          URL
        </button>
      </div>

      {tab === 'local_path' && (
        <div>
          <label htmlFor="skill-path">Caminho local da pasta</label>
          <input id="skill-path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} required />
        </div>
      )}

      {tab === 'upload' && (
        <div>
          <label htmlFor="skill-file">Arquivo (SKILL.md ou .zip)</label>
          <input id="skill-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      )}

      {tab === 'url' && (
        <div>
          <label htmlFor="skill-url">URL do repositório da skill</label>
          <input id="skill-url" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
      )}

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar skill
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
