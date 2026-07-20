import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  style?: CSSProperties;
}

const SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '6px 10px', fontSize: 13 },
  md: { padding: '9px 14px', fontSize: 14 },
  lg: { padding: '11px 18px', fontSize: 15 },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid transparent' },
  secondary: {
    background: 'var(--color-surface-hover)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border-strong)',
  },
  ghost: { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' },
  danger: { background: 'var(--color-danger)', color: '#fff', border: '1px solid transparent' },
};

const HOVER_BG: Record<ButtonVariant, string> = {
  primary: 'var(--color-accent-hover)',
  secondary: 'var(--color-surface-raised)',
  ghost: 'var(--color-surface-hover)',
  danger: 'var(--color-danger-hover)',
};

export function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled,
  children,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--duration-fast) var(--ease-out), transform var(--duration-fast)',
        ...SIZES[size],
        ...VARIANTS[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = HOVER_BG[variant];
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = VARIANTS[variant].background as string;
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(.97)';
      }}
      onMouseUp={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(1)';
      }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
