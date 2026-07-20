import { Link } from 'react-router-dom';
import type { Item } from '../../../../types.js';
import { TypeBadge } from '../TypeBadge/TypeBadge.js';
import { Tag } from '../Tag/Tag.js';

export interface ItemCardProps {
  item: Item;
}

export function ItemCard({ item }: ItemCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-4)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        fontFamily: 'var(--font-sans)',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <Link
          to={`/items/${item.id}`}
          style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}
        >
          {item.name}
        </Link>
        <TypeBadge type={item.type} size="sm" />
      </div>
      {item.summary && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.summary}</p>
      )}
      {item.utility && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{item.utility}</p>}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {item.localPath && (
        <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {item.localPath}
        </code>
      )}
    </div>
  );
}
