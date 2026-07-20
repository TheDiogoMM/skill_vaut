export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 2,
        background: 'var(--color-bg-inset)',
        padding: 3,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            background: value === tab.value ? 'var(--color-surface)' : 'transparent',
            color: value === tab.value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            boxShadow: value === tab.value ? 'var(--shadow-sm)' : 'none',
            transition: 'all var(--duration-fast) var(--ease-out)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
