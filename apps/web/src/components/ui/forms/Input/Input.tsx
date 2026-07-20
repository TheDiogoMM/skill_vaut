import { useId, type InputHTMLAttributes, type CSSProperties } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  style?: CSSProperties;
}

export function Input({ label, hint, error, id, style, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '9px 12px',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
          transition: 'border-color var(--duration-fast)',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
        {...rest}
      />
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{hint}</span>}
      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--color-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
