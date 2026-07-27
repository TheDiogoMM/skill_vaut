import { useEffect, useState } from 'react';
import { discoverItems } from '../api/client.js';
import { DiscoverResultCard } from '../components/DiscoverResultCard.js';
import { Input } from '../components/ui/forms/Input/Input.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import type { DiscoverResult, DiscoverItemType } from '../types.js';

const SOURCE_LABELS: Record<DiscoverResult['source'], string> = {
  github: 'GitHub',
  mcp_registry: 'Registro oficial de MCP',
  smithery: 'Smithery',
};

function groupBySource(results: DiscoverResult[]): [DiscoverResult['source'], DiscoverResult[]][] {
  const groups = new Map<DiscoverResult['source'], DiscoverResult[]>();
  for (const result of results) {
    if (!groups.has(result.source)) groups.set(result.source, []);
    groups.get(result.source)!.push(result);
  }
  return [...groups.entries()];
}

export function DiscoverPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DiscoverItemType | ''>('');
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      discoverItems(q, type || undefined)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [q, type]);

  const groups = groupBySource(results);

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
        Descobrir
      </h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input
          type="search"
          placeholder="Buscar skills, MCPs, plugins..."
          aria-label="Buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          aria-label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as DiscoverItemType | '')}
          style={{ width: 160 }}
        >
          <option value="">Todos os tipos</option>
          <option value="skill">Skill</option>
          <option value="mcp">MCP</option>
          <option value="plugin">Plugin</option>
        </Select>
      </div>
      {status === 'loading' && <p>Buscando...</p>}
      {status === 'error' && <StatusMessage kind="error">Não foi possível buscar fontes externas.</StatusMessage>}
      {status === 'ready' && results.length === 0 && <p>Nenhum resultado encontrado.</p>}
      {status === 'ready' &&
        groups.map(([source, sourceResults]) => (
          <section key={source} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--fw-title)',
                color: 'var(--color-text)',
              }}
            >
              {SOURCE_LABELS[source]}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {sourceResults.map((result) => (
                <DiscoverResultCard key={`${result.source}-${result.url}`} result={result} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
