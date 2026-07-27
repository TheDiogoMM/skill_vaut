import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../core/Icon/Icon.js';

export type AvailabilityTone = 'positive' | 'neutral';

export interface AvailabilityBadgeProps {
  tone: AvailabilityTone;
  icon: IconName;
  title?: string;
  children: ReactNode;
}

const TONE_STYLE: Record<AvailabilityTone, { color: string; background: string; border: string }> = {
  positive: {
    color: 'var(--color-success)',
    background: 'color-mix(in oklch, var(--color-success) 16%, var(--color-surface))',
    border: '1px solid color-mix(in oklch, var(--color-success) 45%, transparent)',
  },
  neutral: {
    color: 'var(--color-text-tertiary)',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
  },
};

export function AvailabilityBadge({ tone, icon, title, children }: AvailabilityBadgeProps) {
  const style = TONE_STYLE[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 600,
        color: style.color,
        background: style.background,
        border: style.border,
      }}
    >
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}
