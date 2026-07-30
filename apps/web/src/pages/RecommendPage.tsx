import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations, listConsultas, translateDiscoverResults } from '../api/client.js';
import type { Consulta, Item, RecommendedItem, RecommendResult } from '../types.js';
import { Textarea } from '../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { Icon } from '../components/ui/core/Icon/Icon.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';
import { GlobalInstallAction } from '../components/ui/data-display/GlobalInstallAction/GlobalInstallAction.js';
import { DiscoverResultCard } from '../components/DiscoverResultCard.js';
import { buildRecommendSummary } from '../lib/recommendSummary.js';

const EMPTY_MESSAGES = {
  skills: 'Nenhuma skill do catálogo cobre essa necessidade.',
  repos: 'Nenhum repositório do catálogo cobre essa necessidade.',
  mcps: 'Nenhum MCP do catálogo cobre essa necessidade.',
  plugins: 'Nenhum plugin do catálogo cobre essa necessidade.',
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
            <GlobalInstallAction item={item} onUpdated={onItemUpdated} />
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
  const [copied, setCopied] = useState(false);

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
      return {
        skills: patch(prev.skills),
        repos: patch(prev.repos),
        mcps: patch(prev.mcps),
        plugins: patch(prev.plugins),
        externalSuggestions: prev.externalSuggestions,
      };
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
      if (data.externalSuggestions.length > 0) {
        translateDiscoverResults(data.externalSuggestions)
          .then((translated) => {
            setResult((prev) => (prev === data ? { ...prev, externalSuggestions: translated } : prev));
          })
          .catch(() => {});
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  async function handleCopySummary() {
    if (!result) return;
    await navigator.clipboard.writeText(buildRecommendSummary(ideia, result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
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
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name={copied ? 'check' : 'copy'} size={13} />}
              onClick={handleCopySummary}
            >
              {copied ? 'Copiado!' : 'Copiar resumo'}
            </Button>
          </div>
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
            <ResultColumn
              title="Plugins"
              items={result.plugins}
              emptyMessage={EMPTY_MESSAGES.plugins}
              onItemUpdated={handleItemUpdated}
            />
          </div>

          {result.externalSuggestions.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-title)',
                  fontWeight: 'var(--fw-title)',
                  color: 'var(--color-text)',
                }}
              >
                Sugestões externas
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {result.externalSuggestions.map((suggestion) => (
                  <DiscoverResultCard key={`${suggestion.source}-${suggestion.url}`} result={suggestion} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {consultas.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>Histórico</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {consultas.map((consulta) => (
              <li
                key={consulta.id}
                style={{ display: 'flex', gap: 4, minWidth: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}
              >
                <span
                  title={consulta.ideia}
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {consulta.ideia}
                </span>
                <span style={{ flexShrink: 0 }}>— {new Date(consulta.createdAt).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
