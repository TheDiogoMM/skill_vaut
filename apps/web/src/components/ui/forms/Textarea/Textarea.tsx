import { useId, type TextareaHTMLAttributes, type CSSProperties } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  label?: string;
  /** Monospace, for JSON config */
  mono?: boolean;
  style?: CSSProperties;
}

export function Textarea({ label, id, mono, style, rows = 6, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
      {label && (
        <label htmlFor={textareaId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        style={{
          background: 'var(--color-bg-inset)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          fontSize: mono ? 13 : 14,
          lineHeight: 1.5,
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          outline: 'none',
          resize: 'vertical',
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
    </div>
  );
}
