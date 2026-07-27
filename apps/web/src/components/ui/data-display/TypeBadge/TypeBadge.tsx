import type { ItemType } from '../../../../types.js';
import { Icon, type IconName } from '../../core/Icon/Icon.js';

interface TypeBadgeConfig {
  label: string;
  color: string;
  bg: string;
  icon: IconName;
}

const CONFIG: Record<ItemType, TypeBadgeConfig> = {
  skill: { label: 'Skill', color: 'var(--color-type-skill)', bg: 'var(--color-type-skill-bg)', icon: 'sparkles' },
  repo: { label: 'Repo', color: 'var(--color-type-repo)', bg: 'var(--color-type-repo-bg)', icon: 'git-branch' },
  mcp: { label: 'MCP', color: 'var(--color-type-mcp)', bg: 'var(--color-type-mcp-bg)', icon: 'plug' },
  plugin: { label: 'Plugin', color: 'var(--color-type-plugin)', bg: 'var(--color-type-plugin-bg)', icon: 'puzzle' },
};

export interface TypeBadgeProps {
  type: ItemType;
  size?: 'sm' | 'md';
}

export function TypeBadge({ type, size = 'md' }: TypeBadgeProps) {
  const c = CONFIG[type];
  const pad = size === 'sm' ? '3px 8px' : '4px 10px';
  const font = size === 'sm' ? 11 : 12;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: pad,
        borderRadius: 'var(--radius-full)',
        background: c.bg,
        color: c.color,
        border: `1px solid color-mix(in oklch, ${c.color} 45%, transparent)`,
        fontFamily: 'var(--font-sans)',
        fontSize: font,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
      }}
    >
      <Icon name={c.icon} size={font + 2} />
      {c.label}
    </span>
  );
}
