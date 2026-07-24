import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations, listConsultas } from '../api/client.js';
import type { Consulta, Item, RecommendedItem, RecommendResult } from '../types.js';
import { Textarea } from '../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';

const EMPTY_MESSAGES = {
  skills: 'Nenhuma skill do catálogo cobre essa necessidade.',
  repos: 'Nenhum repositório do catálogo cobre essa necessidade.',
  mcps: 'Nenhum MCP do catálogo cobre essa necessidade.',
};

interface ResultColumnProps {
  title: string;
  items: RecommendedItem[];
  emptyMessage: string;
  onItemUpdated: (item: Item) => void;
}

function ResultColumn({ title, items, emptyMessage, onItemUpdated }: ResultColumnProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1, minWidth: 220 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--fw-title)',
          color: 'var(--color-text)',
        }}
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>{emptyMessage}</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 'var(--space-3)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Link to={`/items/${item.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              {item.name}
            </Link>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{item.motivo}</p>
            <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {item.localPath}
            </code>
            <RepoDownloadAction item={item} onUpdated={onItemUpdated} />
          </div>
        ))
      )}
    </section>
  );
}

export function RecommendPage() {
  const [ideia, setIdeia] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [consultas, setConsultas] = useState<Consulta[]>([]);

  useEffect(() => {
    listConsultas()
      .then(setConsultas)
      .catch(() => {});
  }, [result]);

  function handleItemUpdated(updated: Item) {
    setResult((prev) => {
      if (!prev) return prev;
      const patch = (list: RecommendedItem[]) =>
        list.map((it) => (it.id === updated.id ? { ...it, ...updated } : it));
      return { skills: patch(prev.skills), repos: patch(prev.repos), mcps: patch(prev.mcps) };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    setError('');
    setResult(null);
    try {
      const data = await getRecommendations(ideia);
      setResult(data);
      setStatus('idle');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          letterSpacing: 'var(--ls-display)',
          color: 'var(--color-text)',
        }}
      >
        Recomendar
      </h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
        <Textarea label="Ideia do projeto" value={ideia} onChange={(e) => setIdeia(e.target.value)} required />
        <div>
          <Button type="submit" disabled={status === 'submitting'}>
            Recomendar
          </Button>
        </div>
        {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
      </form>

      {result && (
        <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          <ResultColumn
            title="Skills"
            items={result.skills}
            emptyMessage={EMPTY_MESSAGES.skills}
            onItemUpdated={handleItemUpdated}
          />
          <ResultColumn
            title="Repos"
            items={result.repos}
            emptyMessage={EMPTY_MESSAGES.repos}
            onItemUpdated={handleItemUpdated}
          />
          <ResultColumn
            title="MCPs"
            items={result.mcps}
            emptyMessage={EMPTY_MESSAGES.mcps}
            onItemUpdated={handleItemUpdated}
          />
        </div>
      )}

      {consultas.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>Histórico</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {consultas.map((consulta) => (
              <li key={consulta.id} style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                {consulta.ideia} — {new Date(consulta.createdAt).toLocaleString('pt-BR')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
