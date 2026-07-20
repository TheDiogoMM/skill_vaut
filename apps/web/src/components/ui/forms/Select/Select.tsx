import { useId, type SelectHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  label?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function Select({ label, id, children, style, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
      {label && (
        <label htmlFor={selectId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '9px 12px',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
