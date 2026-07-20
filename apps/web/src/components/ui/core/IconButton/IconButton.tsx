import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Icon, type IconName } from '../Icon/Icon.js';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  name: IconName;
  size?: number;
  label: string;
  active?: boolean;
  style?: CSSProperties;
}

export function IconButton({ name, size = 18, label, active, style, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--color-surface-hover)' : 'transparent',
        border: '1px solid transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'background var(--duration-fast) var(--ease-out)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'var(--color-surface-hover)' : 'transparent';
      }}
      {...rest}
    >
      <Icon name={name} size={size} />
    </button>
  );
}
