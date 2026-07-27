import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Tabs } from '../../components/ui/forms/Tabs/Tabs.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface SkillFormProps {
  onCreated: (item: Item) => void;
  initialName?: string;
  initialUrl?: string;
}

type SourceTab = 'local_path' | 'upload' | 'url';

const TABS: { value: SourceTab; label: string }[] = [
  { value: 'local_path', label: 'Caminho local' },
  { value: 'upload', label: 'Upload' },
  { value: 'url', label: 'URL' },
];

export function SkillForm({ onCreated, initialName = '', initialUrl = '' }: SkillFormProps) {
  const [name, setName] = useState(initialName);
  const [tab, setTab] = useState<SourceTab>(initialUrl ? 'url' : 'local_path');
  const [localPath, setLocalPath] = useState('');
  const [url, setUrl] = useState(initialUrl);
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
      <Input id="skill-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />

      <Tabs tabs={TABS} value={tab} onChange={(value) => setTab(value as SourceTab)} />

      {tab === 'local_path' && (
        <Input
          id="skill-path"
          label="Caminho local da pasta"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
          required
        />
      )}

      {tab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
          <label htmlFor="skill-file" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Arquivo (SKILL.md ou .zip)
          </label>
          <input id="skill-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      )}

      {tab === 'url' && (
        <Input
          id="skill-url"
          label="URL do repositório da skill"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      )}

      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar skill
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
