import { useNavigate } from 'react-router-dom';
import type { DiscoverResult } from '../types.js';
import { TypeBadge } from './ui/data-display/TypeBadge/TypeBadge.js';
import { Button } from './ui/core/Button/Button.js';

export interface DiscoverResultCardProps {
  result: DiscoverResult;
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(value);
}

function formatRating(result: DiscoverResult): string | null {
  if (result.rating.value === null) return null;
  if (result.rating.kind === 'stars') return `★ ${formatCompactNumber(result.rating.value)}`;
  if (result.rating.kind === 'use_count') return `${formatCompactNumber(result.rating.value)} usos`;
  return null;
}

export function DiscoverResultCard({ result }: DiscoverResultCardProps) {
  const navigate = useNavigate();
  const rating = formatRating(result);

  function handleAdd() {
    const params = new URLSearchParams({ type: result.itemType, name: result.name, url: result.url });
    navigate(`/add?${params.toString()}`);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-3)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={result.itemType} size="sm" />
        {result.source === 'mcp_registry' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>Oficial</span>
        )}
        {result.source === 'smithery' && result.verified && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>Verificado</span>
        )}
        {rating && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{rating}</span>}
      </div>
      <a href={result.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600 }}>
        {result.name}
      </a>
      {result.description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{result.description}</p>
      )}
      <div>
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          Adicionar ao vault
        </Button>
      </div>
    </div>
  );
}
