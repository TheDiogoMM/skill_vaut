import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../core/Icon/Icon.js';

export type StatusKind = 'success' | 'error' | 'info';

interface StatusKindConfig {
  color: string;
  icon: IconName;
}

const KIND: Record<StatusKind, StatusKindConfig> = {
  success: { color: 'var(--color-success)', icon: 'check-circle-2' },
  error: { color: 'var(--color-danger)', icon: 'alert-circle' },
  info: { color: 'var(--color-text-secondary)', icon: 'info' },
};

export interface StatusMessageProps {
  kind?: StatusKind;
  children: ReactNode;
}

export function StatusMessage({ kind = 'info', children }: StatusMessageProps) {
  const c = KIND[kind];
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: 0,
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: c.color,
      }}
    >
      <Icon name={c.icon} size={15} />
      {children}
    </p>
  );
}
