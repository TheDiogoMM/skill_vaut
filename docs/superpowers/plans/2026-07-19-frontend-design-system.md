# Frontend Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the externally-generated SkillVault design system (tokens, brand assets, 11 reference components) to the real `apps/web` frontend — full visual identity across every existing screen — without changing routes, API contracts, or currently-tested behavior.

**Architecture:** Design tokens (colors/typography/spacing/effects) are consolidated into the existing `apps/web/src/theme.css` (single file, matching current project convention). Fonts (Inter, JetBrains Mono) and icons (Lucide) are npm-bundled via Vite — not CDN — so the catalog keeps working offline. Eleven reusable UI components are ported from the design system's `.jsx` prototypes into typed `.tsx` files under `apps/web/src/components/ui/`, preserving their inline-style/hover-handler implementation approach ("quase literal" port) but as real JSX with typed props. Every existing screen (`Layout`, `CatalogPage`, `ItemDetailPage`, `AddPage` + 3 forms, `CategoryManager`, `SearchFilterBar`) is restyled to use these components. Careful component design (documented per-task below) means **zero existing test files require changes** — this was verified line-by-line against every current test file while writing this plan.

**Tech Stack:** React 18 + TypeScript + Vite (existing), `lucide-react` (new), `@fontsource/inter` + `@fontsource/jetbrains-mono` (new), Vitest + React Testing Library (existing).

---

## Scope boundaries (read before starting)

This plan restyles **existing** screens/behavior only. The design system's reference mockups (`ui_kits/skillvault-web/*.jsx`) include some elements that go beyond what's in the app today — these are **deliberately excluded** from every task below, to stay a pure restyle and keep every existing test passing unchanged:

- No "Voltar ao catálogo" back-button on the item detail page (not present today).
- No "Enriquecido via {fonte}" text on the item detail page (not rendered today, even though the API returns it).
- No collapsible "Gerenciar categorias" toggle on the catalog page (`CategoryManager` stays always-visible, as today).
- No drag-and-drop styled box for the skill upload tab (stays a native `<input type="file">`, just label-styled).
- No per-action loading-text button variants ("Clonando...", "Enviando...", "Salvando...") — buttons stay disabled-with-same-label while submitting, as today.
- No Recommend screen/nav item (that feature doesn't exist yet — out of scope per the design spec).
- No PWA manifest/service worker (separate, not-yet-built feature).

If any of these are wanted later, they're new feature work for a separate plan, not part of this restyle.

---

### Task 1: Install design system dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the packages**

Run: `npm install lucide-react @fontsource/inter @fontsource/jetbrains-mono -w apps/web`

Expected: npm reports the packages added, and `apps/web/package.json` now lists `lucide-react`, `@fontsource/inter`, `@fontsource/jetbrains-mono` under `"dependencies"`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore: add lucide-react and @fontsource packages for the design system"
```

---

### Task 2: Design tokens and base styles

**Files:**
- Modify: `apps/web/src/theme.css`

- [ ] **Step 1: Replace the full contents of `theme.css`**

Replace the full contents of `apps/web/src/theme.css` with:

```css
:root {
  color-scheme: dark;

  --blue-400: #8ea3ff;
  --blue-500: #6d8dff;
  --blue-600: #4f6bdb;
  --violet-500: #a78bfa;
  --green-500: #34d399;
  --amber-500: #f5a623;
  --red-400: #f87171;
  --red-500: #ef4444;
  --gray-950: #0b0d12;
  --gray-900: #0f1115;
  --gray-800: #1a1d24;
  --gray-750: #20242e;
  --gray-700: #232733;
  --gray-600: #2e3340;
  --gray-500: #3a4152;
  --gray-300: #767f92;
  --gray-200: #9aa2b1;
  --gray-50: #e6e8ec;

  --color-bg: var(--gray-900);
  --color-bg-inset: var(--gray-950);
  --color-surface: var(--gray-800);
  --color-surface-raised: var(--gray-750);
  --color-surface-hover: var(--gray-700);
  --color-border: var(--gray-600);
  --color-border-strong: var(--gray-500);
  --color-text: var(--gray-50);
  --color-text-secondary: var(--gray-200);
  --color-text-tertiary: var(--gray-300);
  --color-text-on-accent: var(--gray-950);
  --color-accent: var(--blue-500);
  --color-accent-hover: var(--blue-400);
  --color-accent-active: var(--blue-600);
  --color-danger: var(--red-500);
  --color-danger-hover: var(--red-400);
  --color-success: var(--green-500);

  --color-type-skill: var(--violet-500);
  --color-type-skill-bg: color-mix(in oklch, var(--violet-500) 16%, var(--color-surface));
  --color-type-repo: var(--green-500);
  --color-type-repo-bg: color-mix(in oklch, var(--green-500) 16%, var(--color-surface));
  --color-type-mcp: var(--amber-500);
  --color-type-mcp-bg: color-mix(in oklch, var(--amber-500) 18%, var(--color-surface));

  --focus-ring: 0 0 0 3px color-mix(in oklch, var(--color-accent) 45%, transparent);

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;

  --text-display: 28px;
  --fw-display: 700;
  --ls-display: -0.01em;
  --text-title: 20px;
  --fw-title: 600;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --sidebar-width: 248px;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 120ms;
  --duration-base: 180ms;
}

:root[data-theme='light'] {
  color-scheme: light;
  --color-bg: #f4f5f8;
  --color-bg-inset: #e9ebf1;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-surface-hover: #eef0f4;
  --color-border: #d8dbe2;
  --color-border-strong: #b9bfcb;
  --color-text: #14161a;
  --color-text-secondary: #4a5063;
  --color-text-tertiary: #6b7280;
  --color-text-on-accent: #ffffff;
  --color-accent: #3355dd;
  --color-accent-hover: #2745c4;
  --color-accent-active: #1f379e;
  --color-danger: #d92d20;
  --color-danger-hover: #b42318;
  --color-success: #15803d;
  --color-type-skill-bg: color-mix(in oklch, var(--violet-500) 12%, white);
  --color-type-repo-bg: color-mix(in oklch, var(--green-500) 12%, white);
  --color-type-mcp-bg: color-mix(in oklch, var(--amber-500) 14%, white);
  --shadow-sm: 0 1px 2px rgba(20, 22, 26, 0.08);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
}

a {
  color: var(--color-accent);
  text-decoration: none;
}

a:hover {
  color: var(--color-accent-hover);
  text-decoration: underline;
}

code,
pre {
  font-family: var(--font-mono);
}

:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.layout {
  display: flex;
  min-height: 100vh;
}

.layout__main {
  flex: 1;
  padding: var(--space-8);
  min-width: 0;
}

@media (max-width: 720px) {
  .layout {
    flex-direction: column;
  }
}
```

This replaces the previous 8-variable `theme.css` with the full design system token set (colors, typography, spacing, effects), consolidated into one file to match this project's existing single-stylesheet convention (the design system package splits these into `tokens/*.css` — that split isn't needed here). `.layout`/`.layout__main` stay as the structural classes `Layout.tsx` uses; `.layout__nav` is dropped because the new `Sidebar` component (Task 15) carries its own inline width/styling instead of relying on a grid column.

- [ ] **Step 2: Verify nothing outside `theme.css` depended on the old token names**

Run: `grep -rn -- "--radius:\|--spacing-" apps/web/src --include=*.tsx --include=*.ts`
Expected: no matches — only `theme.css` itself (not matched by this `.tsx`/`.ts`-only search) ever referenced the old `--radius`/`--spacing-1..4` variable names; no component used them inline. `Layout.tsx` still references the old `.layout__nav` CSS class name at this point in the plan (dropped from `theme.css` above) — that's expected and harmless: it's a plain unstyled class name until Task 16 replaces `Layout.tsx`'s markup with the `Sidebar` component, a few tasks from now. No test asserts on CSS class names, so this doesn't break anything in between.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/theme.css
git commit -m "feat: replace theme.css with the full design system token set"
```

---

### Task 3: Brand assets (logo, favicon)

**Files:**
- Create: `apps/web/src/assets/logo-symbol.png`
- Create: `apps/web/public/favicon-64.png`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Copy the asset files**

```bash
mkdir -p "apps/web/src/assets" "apps/web/public"
cp "SkillVault Design System/assets/logo-symbol.png" "apps/web/src/assets/logo-symbol.png"
cp "SkillVault Design System/assets/favicon-64.png" "apps/web/public/favicon-64.png"
```

- [ ] **Step 2: Add the favicon link to `index.html`**

In `apps/web/index.html`, add a favicon `<link>` inside `<head>`, right after the `<title>` line:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SkillVault</title>
    <link rel="icon" type="image/png" href="/favicon-64.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/assets/logo-symbol.png apps/web/public/favicon-64.png apps/web/index.html
git commit -m "feat: add brand logo and favicon assets"
```

---

### Task 4: `Icon` component

**Files:**
- Create: `apps/web/src/components/ui/core/Icon/Icon.tsx`
- Test: `apps/web/src/components/ui/core/Icon/Icon.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './Icon.js';

describe('Icon', () => {
  it('renders an svg for a known icon name', () => {
    const { container } = render(<Icon name="copy" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies the given size to width and height', () => {
    const { container } = render(<Icon name="check" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('defaults to size 16', () => {
    const { container } = render(<Icon name="library" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Icon.test.tsx`
Expected: FAIL — `./Icon.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
import type { SVGProps } from 'react';
import { Sparkles, GitBranch, Plug, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon } from 'lucide-react';

const ICONS = {
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  'check-circle-2': CheckCircle2,
  'alert-circle': AlertCircle,
  info: Info,
  copy: Copy,
  check: Check,
  library: Library,
  'plus-circle': PlusCircle,
  sun: Sun,
  moon: Moon,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, strokeWidth = 2, ...rest }: IconProps) {
  const LucideIcon = ICONS[name];
  return <LucideIcon width={size} height={size} strokeWidth={strokeWidth} {...rest} />;
}
```

This is the one component that changes behavior (not just styling) from the design system source: `Icon.jsx` injects a `<script src="unpkg.com/lucide">` tag at runtime and re-scans `data-lucide` attributes. That requires network access on every page load, which conflicts with the catalog's offline-PWA goal, so this port imports the 12 icons this app actually uses directly from the `lucide-react` npm package instead (bundled by Vite, no CDN, no runtime script injection). The 12 names cover every icon used across the components in this plan — extend `ICONS` if a later screen needs another one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Icon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/core/Icon/
git commit -m "feat: add Icon component backed by lucide-react"
```

---

### Task 5: `Button` component

**Files:**
- Create: `apps/web/src/components/ui/core/Button/Button.tsx`
- Test: `apps/web/src/components/ui/core/Button/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Ação</Button>);
    expect(screen.getByRole('button', { name: 'Ação' })).toHaveAttribute('type', 'button');
  });

  it('supports type="submit" for form actions', () => {
    render(<Button type="submit">Adicionar repositório</Button>);
    expect(screen.getByRole('button', { name: 'Adicionar repositório' })).toHaveAttribute('type', 'submit');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Salvando</Button>);
    expect(screen.getByRole('button', { name: 'Salvando' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Button.test.tsx`
Expected: FAIL — `./Button.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/core/Button/
git commit -m "feat: add Button component"
```

---

### Task 6: `IconButton` component

**Files:**
- Create: `apps/web/src/components/ui/core/IconButton/IconButton.tsx`
- Test: `apps/web/src/components/ui/core/IconButton/IconButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton.js';

describe('IconButton', () => {
  it('exposes the label as the accessible name and responds to clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton name="copy" label="Copiar" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- IconButton.test.tsx`
Expected: FAIL — `./IconButton.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

Note: no screen in this plan actually uses `IconButton` yet (see Task 15's note on the theme toggle) — it's still built now because it's part of the design system's core component set and the spec explicitly calls for all 11 components, for reuse by future screens (e.g. a future Recommend screen).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- IconButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/core/IconButton/
git commit -m "feat: add IconButton component"
```

---

### Task 7: `Input` component

**Files:**
- Create: `apps/web/src/components/ui/forms/Input/Input.tsx`
- Test: `apps/web/src/components/ui/forms/Input/Input.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input.js';

describe('Input', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<Input label="Nome" />);
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('calls onChange when typed into', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Nome" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Nome'), 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders an error message with role alert', () => {
    render(<Input label="URL" error="URL inválida" />);
    expect(screen.getByRole('alert')).toHaveTextContent('URL inválida');
  });

  it('works with aria-label instead of a visible label', () => {
    render(<Input aria-label="Buscar" />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- forms/Input/Input.test.tsx`
Expected: FAIL — `./Input.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- forms/Input/Input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/forms/Input/
git commit -m "feat: add Input component"
```

---

### Task 8: `Select` component

**Files:**
- Create: `apps/web/src/components/ui/forms/Select/Select.tsx`
- Test: `apps/web/src/components/ui/forms/Select/Select.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select.js';

describe('Select', () => {
  it('associates the label with the select via htmlFor/id', () => {
    render(
      <Select label="Tipo">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  });

  it('calls onChange when an option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select label="Tipo" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    await user.selectOptions(screen.getByLabelText('Tipo'), 'b');
    expect(onChange).toHaveBeenCalled();
  });

  it('works with aria-label instead of a visible label', () => {
    render(
      <Select aria-label="Categoria">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- forms/Select/Select.test.tsx`
Expected: FAIL — `./Select.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- forms/Select/Select.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/forms/Select/
git commit -m "feat: add Select component"
```

---

### Task 9: `Textarea` component

**Files:**
- Create: `apps/web/src/components/ui/forms/Textarea/Textarea.tsx`
- Test: `apps/web/src/components/ui/forms/Textarea/Textarea.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea.js';

describe('Textarea', () => {
  it('associates the label with the textarea via htmlFor/id', () => {
    render(<Textarea label="Config JSON" />);
    expect(screen.getByLabelText('Config JSON')).toBeInTheDocument();
  });

  it('uses the monospace font when mono is set', () => {
    render(<Textarea label="Config JSON" mono />);
    expect(screen.getByLabelText('Config JSON')).toHaveStyle({ fontFamily: 'var(--font-mono)' });
  });

  it('defaults to 6 rows', () => {
    render(<Textarea label="Config JSON" />);
    expect(screen.getByLabelText('Config JSON')).toHaveAttribute('rows', '6');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Textarea.test.tsx`
Expected: FAIL — `./Textarea.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Textarea.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/forms/Textarea/
git commit -m "feat: add Textarea component"
```

---

### Task 10: `Tabs` component

**Files:**
- Create: `apps/web/src/components/ui/forms/Tabs/Tabs.tsx`
- Test: `apps/web/src/components/ui/forms/Tabs/Tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs.js';

describe('Tabs', () => {
  const tabs = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('marks the active tab as selected', () => {
    render(<Tabs tabs={tabs} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the clicked tab value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="a" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a tablist role for the container', () => {
    render(<Tabs tabs={tabs} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Tabs.test.tsx`
Expected: FAIL — `./Tabs.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Tabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/forms/Tabs/
git commit -m "feat: add Tabs component"
```

---

### Task 11: `TypeBadge` component

**Files:**
- Create: `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.tsx`
- Test: `apps/web/src/components/ui/data-display/TypeBadge/TypeBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypeBadge } from './TypeBadge.js';

describe('TypeBadge', () => {
  it('renders the Skill label', () => {
    render(<TypeBadge type="skill" />);
    expect(screen.getByText('Skill')).toBeInTheDocument();
  });

  it('renders the Repo label', () => {
    render(<TypeBadge type="repo" />);
    expect(screen.getByText('Repo')).toBeInTheDocument();
  });

  it('renders the MCP label', () => {
    render(<TypeBadge type="mcp" />);
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- TypeBadge.test.tsx`
Expected: FAIL — `./TypeBadge.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- TypeBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/TypeBadge/
git commit -m "feat: add TypeBadge component"
```

---

### Task 12: `Tag` component

**Files:**
- Create: `apps/web/src/components/ui/data-display/Tag/Tag.tsx`
- Test: `apps/web/src/components/ui/data-display/Tag/Tag.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tag } from './Tag.js';

describe('Tag', () => {
  it('renders its text content', () => {
    render(<Tag>cli</Tag>);
    expect(screen.getByText('cli')).toBeInTheDocument();
  });

  it('shows a remove button when onRemove is provided and calls it on click', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>cli</Tag>);
    await user.click(screen.getByRole('button', { name: 'Remover tag' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('does not render a remove button when onRemove is not provided', () => {
    render(<Tag>cli</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- Tag.test.tsx`
Expected: FAIL — `./Tag.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
import type { ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  onRemove?: () => void;
}

export function Tag({ children, onRemove }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-full)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover tag"
          style={{
            border: 'none',
            background: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            opacity: 0.7,
          }}
        >
          &times;
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- Tag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/Tag/
git commit -m "feat: add Tag component"
```

---

### Task 13: `ItemCard` component

**Files:**
- Create: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.tsx`
- Test: `apps/web/src/components/ui/data-display/ItemCard/ItemCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemCard } from './ItemCard.js';
import type { Item } from '../../../../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Repo A',
    sourceType: 'url',
    sourceValue: 'x',
    localPath: '/skillvault/repos/repo-a',
    categoryId: null,
    summary: 'Resumo A',
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('ItemCard', () => {
  it('links to the item detail page using the item name as the link text', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Repo A' })).toHaveAttribute('href', '/items/1');
  });

  it('renders summary, utility, tags, and local path when present', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ utility: 'Útil', tags: ['cli'] })} />
      </MemoryRouter>
    );
    expect(screen.getByText('Resumo A')).toBeInTheDocument();
    expect(screen.getByText('Útil')).toBeInTheDocument();
    expect(screen.getByText('cli')).toBeInTheDocument();
    expect(screen.getByText('/skillvault/repos/repo-a')).toBeInTheDocument();
  });

  it('shows the type badge for the item type', () => {
    render(
      <MemoryRouter>
        <ItemCard item={sampleItem({ type: 'mcp' })} />
      </MemoryRouter>
    );
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- ItemCard.test.tsx`
Expected: FAIL — `./ItemCard.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

This deviates from the design system's `ItemCard.jsx` in two ways, both deliberate:

1. **Only the item name is a `<Link>`**, not the whole card (the source prototype makes the entire card a clickable `role="button"` div). Making the whole card a real link would concatenate the type badge, summary, tags, and path text into the link's accessible name, breaking `getByRole('link', { name: 'Repo A' })` in `CatalogPage.test.tsx` (an exact-match query). Keeping the click target scoped to the name preserves that test unchanged and avoids nesting non-interactive-but-visually-busy content inside an anchor.
2. **Takes `item: Item`** (the app's real type from `types.ts`) directly and has **no `onOpen` prop** — the source `.d.ts` defines a separate `CatalogItem` type and an `onOpen` callback, but the real `Item` type already satisfies every field `ItemCard` needs, and routing via `to` directly is simpler and matches how `CatalogPage.tsx` already imports `Link` today.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- ItemCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/data-display/ItemCard/
git commit -m "feat: add ItemCard component"
```

---

### Task 14: `StatusMessage` component

**Files:**
- Create: `apps/web/src/components/ui/feedback/StatusMessage/StatusMessage.tsx`
- Test: `apps/web/src/components/ui/feedback/StatusMessage/StatusMessage.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusMessage } from './StatusMessage.js';

describe('StatusMessage', () => {
  it('uses role="alert" for error messages', () => {
    render(<StatusMessage kind="error">Erro ao salvar.</StatusMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro ao salvar.');
  });

  it('uses role="status" for success messages', () => {
    render(<StatusMessage kind="success">Salvo!</StatusMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo!');
  });

  it('uses role="status" for info messages (the default)', () => {
    render(<StatusMessage>Nenhum resultado.</StatusMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum resultado.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- StatusMessage.test.tsx`
Expected: FAIL — `./StatusMessage.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- StatusMessage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/feedback/StatusMessage/
git commit -m "feat: add StatusMessage component"
```

---

### Task 15: `Sidebar` component

**Files:**
- Create: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.tsx`
- Test: `apps/web/src/components/ui/navigation/Sidebar/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';

describe('Sidebar', () => {
  it('renders navigation links to the catalog and add routes', () => {
    render(
      <MemoryRouter>
        <Sidebar theme="dark" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Adicionar' })).toHaveAttribute('href', '/add');
  });

  it('shows "Modo claro" and calls onToggleTheme when in dark mode', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar theme="dark" onToggleTheme={onToggleTheme} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Modo claro' }));
    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('shows "Modo escuro" when in light mode', () => {
    render(
      <MemoryRouter>
        <Sidebar theme="light" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Modo escuro' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/web -- navigation/Sidebar/Sidebar.test.tsx`
Expected: FAIL — `./Sidebar.js` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
import { NavLink } from 'react-router-dom';
import logoSymbol from '../../../../assets/logo-symbol.png';
import { Icon, type IconName } from '../../core/Icon/Icon.js';
import { Button } from '../../core/Button/Button.js';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Catálogo', icon: 'library', end: true },
  { to: '/add', label: 'Adicionar', icon: 'plus-circle' },
];

export interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  return (
    <nav
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logoSymbol} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>
            SkillVault
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              background: isActive ? 'var(--color-surface-hover)' : 'transparent',
              color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
            })}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

Two deliberate deviations from `Sidebar.jsx`:

1. **Nav items render as `NavLink`**, not `<button onClick={onNavigate}>`. `Layout.test.tsx` asserts `getByRole('link', { name: 'Catálogo' })` — a real link, not a button — and the app already uses `react-router-dom` for navigation everywhere else, so `NavLink` (with its built-in `isActive` styling) is both correct for the existing test and more idiomatic than reimplementing active-route tracking by hand.
2. **The "Recomendar" nav item is dropped** — that route doesn't exist in the app yet (see the plan's Scope boundaries section).
3. **The theme toggle is a `Button`, not an `IconButton`** — the source `Sidebar.jsx` uses `IconButton` (icon-only, static `label="Alternar tema"`), but `Layout.test.tsx` expects a `button` whose accessible **name** dynamically toggles between the literal strings `"Modo claro"` and `"Modo escuro"`. An icon-only button with a static label can't produce that dynamic text, so this port uses `Button` (visible, dynamic text) instead — preserving the exact existing test and the clearer UX of a labeled toggle, at the cost of literal fidelity to the source component choice.
4. **Logo uses the imported PNG asset** (`../../../../assets/logo-symbol.png`, from Task 3) instead of the giant inline base64 string `Sidebar.jsx` embeds — letting Vite hash/cache it normally.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w apps/web -- navigation/Sidebar/Sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/navigation/Sidebar/
git commit -m "feat: add Sidebar component"
```

---

### Task 16: Restyle `Layout`

**Files:**
- Modify: `apps/web/src/components/Layout.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { Outlet } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { Sidebar } from './ui/navigation/Sidebar/Sidebar.js';

export function Layout() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <Sidebar theme={theme} onToggleTheme={toggleTheme} />
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- components/Layout.test.tsx`
Expected: PASS — `Layout.test.tsx` was not modified; it already asserts exactly what `Sidebar` (Task 15) produces (`link` roles for "Catálogo"/"Adicionar", `button` role toggling between "Modo claro"/"Modo escuro").

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Layout.tsx
git commit -m "feat: restyle Layout using the Sidebar component"
```

---

### Task 17: Restyle `SearchFilterBar`

**Files:**
- Modify: `apps/web/src/components/SearchFilterBar.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState } from 'react';
import type { Category, ItemType } from '../types.js';
import { Input } from './ui/forms/Input/Input.js';
import { Select } from './ui/forms/Select/Select.js';

export interface Filters {
  q: string;
  type: ItemType | '';
  category: string;
  tag: string;
}

interface SearchFilterBarProps {
  categories: Category[];
  onChange: (filters: Filters) => void;
}

export function SearchFilterBar({ categories, onChange }: SearchFilterBarProps) {
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });

  function update(partial: Partial<Filters>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    onChange(next);
  }

  return (
    <div role="search" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <Input
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar"
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
        style={{ width: 220 }}
      />
      <Select
        aria-label="Tipo"
        value={filters.type}
        onChange={(e) => update({ type: e.target.value as ItemType | '' })}
        style={{ width: 160 }}
      >
        <option value="">Todos os tipos</option>
        <option value="skill">Skill</option>
        <option value="repo">Repo</option>
        <option value="mcp">MCP</option>
      </Select>
      <Select
        aria-label="Categoria"
        value={filters.category}
        onChange={(e) => update({ category: e.target.value })}
        style={{ width: 190 }}
      >
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Input
        type="text"
        placeholder="Filtrar por tag"
        aria-label="Tag"
        value={filters.tag}
        onChange={(e) => update({ tag: e.target.value })}
        style={{ width: 160 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- SearchFilterBar.test.tsx`
Expected: PASS — `SearchFilterBar.test.tsx` only queries by `getByLabelText('Buscar'/'Tipo'/'Categoria'/'Tag')`, which `Input`/`Select`'s `aria-label` pass-through satisfies unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SearchFilterBar.tsx
git commit -m "feat: restyle SearchFilterBar using Input/Select components"
```

---

### Task 18: Restyle `CatalogPage`

**Files:**
- Modify: `apps/web/src/pages/CatalogPage.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { listItems, listCategories } from '../api/client.js';
import { SearchFilterBar, type Filters } from '../components/SearchFilterBar.js';
import { CategoryManager } from '../components/CategoryManager.js';
import { ItemCard } from '../components/ui/data-display/ItemCard/ItemCard.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
import type { Category, Item, ItemFilters } from '../types.js';

interface GroupedItems {
  category: string;
  items: Item[];
}

function groupByCategory(items: Item[], categories: Category[]): GroupedItems[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const name = item.categoryId !== null ? nameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

function toApiFilters(filters: Filters): ItemFilters {
  const apiFilters: ItemFilters = {};
  if (filters.q) apiFilters.q = filters.q;
  if (filters.type) apiFilters.type = filters.type;
  if (filters.category) apiFilters.category = Number(filters.category);
  if (filters.tag) apiFilters.tag = filters.tag;
  return apiFilters;
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });
  const [refreshToken, setRefreshToken] = useState(0);

  const refetchCategories = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      Promise.all([listItems(toApiFilters(filters)), listCategories()])
        .then(([itemsResult, categoriesResult]) => {
          if (cancelled) return;
          setItems(itemsResult);
          setCategories(categoriesResult);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [filters, refreshToken]);

  const groups = groupByCategory(items, categories);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          letterSpacing: 'var(--ls-display)',
          color: 'var(--color-text)',
        }}
      >
        Catálogo
      </h1>
      <SearchFilterBar categories={categories} onChange={setFilters} />
      {status === 'loading' && <p>Carregando catálogo...</p>}
      {status === 'error' && <StatusMessage kind="error">Não foi possível carregar o catálogo.</StatusMessage>}
      {status === 'ready' && items.length === 0 && <p>Nenhum item cadastrado ainda.</p>}
      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--fw-title)',
                color: 'var(--color-text)',
              }}
            >
              {group.category}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {group.items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      {status === 'ready' && <CategoryManager categories={categories} onChanged={refetchCategories} />}
    </div>
  );
}
```

Note: the `<span>({item.type})</span>` text next to each item's name is dropped — `ItemCard`'s `TypeBadge` already conveys the type visually, and no test asserts on that parenthesized text.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- pages/CatalogPage.test.tsx`
Expected: PASS. This was verified line-by-line while writing this plan: `getByRole('link', { name: 'Repo A' })` matches `ItemCard`'s name-only `Link` (Task 13); `getByText('cli')`/`getByText('testing')` match `Tag`'s plain text rendering; `getByText('/skillvault/repos/repo-a')` matches `ItemCard`'s `<code>`; `findByRole('alert')` on API failure matches `StatusMessage kind="error"`; the `CategoryManager` interaction assertions are unaffected since `CategoryManager` itself isn't restyled until Task 24 (still the plain-HTML version until then — that's fine, this task only touches `CatalogPage.tsx`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/CatalogPage.tsx
git commit -m "feat: restyle CatalogPage using ItemCard and StatusMessage"
```

---

### Task 19: Restyle `ItemDetailPage`

**Files:**
- Modify: `apps/web/src/pages/ItemDetailPage.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem, listCategories, updateItem } from '../api/client.js';
import type { Category, ItemDetail } from '../types.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { Icon } from '../components/ui/core/Icon/Icon.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import { Input } from '../components/ui/forms/Input/Input.js';
import { Tag } from '../components/ui/data-display/Tag/Tag.js';
import { TypeBadge } from '../components/ui/data-display/TypeBadge/TypeBadge.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    Promise.all([getItem(Number(id)), listCategories()])
      .then(([itemResult, categoriesResult]) => {
        if (cancelled) return;
        setItem(itemResult);
        setCategories(categoriesResult);
        setCategoryId(itemResult.categoryId !== null ? String(itemResult.categoryId) : '');
        setTagsInput(itemResult.tags.join(', '));
        setSaveStatus('idle');
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy() {
    if (!item) return;
    await navigator.clipboard.writeText(item.localPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!item) return;
    setSaveStatus('saving');
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await updateItem(item.id, {
        categoryId: categoryId ? Number(categoryId) : null,
        tags,
      });
      setItem({ ...item, ...updated });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  if (status === 'loading') return <p>Carregando item...</p>;
  if (status === 'error' || !item) return <StatusMessage kind="error">Não foi possível carregar o item.</StatusMessage>;

  const parsedTags = tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-display)',
            fontWeight: 'var(--fw-display)',
            color: 'var(--color-text)',
          }}
        >
          {item.name}
        </h2>
        <TypeBadge type={item.type} />
      </div>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text-secondary)' }}>{item.summary}</p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-tertiary)' }}>{item.utility}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <code
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          {item.localPath}
        </code>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name={copied ? 'check' : 'copy'} size={13} />}
          onClick={handleCopy}
        >
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 16,
          flexWrap: 'wrap',
        }}
      >
        <Select
          label="Categoria"
          id="item-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Input
          label="Tags (separadas por vírgula)"
          id="item-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          style={{ width: 260 }}
        />
        <Button onClick={handleSave} disabled={saveStatus === 'saving'}>
          Salvar
        </Button>
        {saveStatus === 'saved' && <StatusMessage kind="success">Salvo!</StatusMessage>}
        {saveStatus === 'error' && <StatusMessage kind="error">Erro ao salvar.</StatusMessage>}
      </div>

      {parsedTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {parsedTags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
```

Notes:

- The heading stays an `<h2>` (not the reference mockup's `<h1>`) — `ItemDetailPage.test.tsx` asserts `getByRole('heading', { name: 'Repo A', level: 2 })`, and `<h2>` is also the semantically correct level here (the app-wide `<h1>`-equivalent is the "SkillVault" wordmark in the sidebar).
- The copy-path button uses `Button` (not `IconButton`) with its icon as `iconLeft` and the dynamic text as `children` — this is what the reference `ItemDetailScreen.jsx` mockup itself does (`<Button variant="secondary" size="sm" iconLeft={<Icon .../>}>{copied ? 'Copiado!' : 'Copiar caminho'}</Button>`), and it's required to preserve `getByRole('button', { name: 'Copiar caminho' })` / `{ name: 'Copiado!' }` in the existing test.
- The `Tag` chips below the form are a new **presentational-only** addition (no `onRemove`, not interactive) — a live preview of the parsed tags input, matching the reference mockup and explicitly allowed by the design spec ("edição inline de categoria/tags usa Select/Tag"). It doesn't change any existing behavior or test.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- pages/ItemDetailPage.test.tsx`
Expected: PASS. Verified line-by-line while writing this plan against all 6 existing test cases (heading level/name, MCP raw JSON text, copy-to-clipboard button text toggle, load-error alert, category/tags edit-and-save flow, save-status reset on navigation).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ItemDetailPage.tsx
git commit -m "feat: restyle ItemDetailPage using the design system components"
```

---

### Task 20: Restyle `AddPage`

**Files:**
- Modify: `apps/web/src/pages/AddPage.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp';

export function AddPage() {
  const [type, setType] = useState<ItemTypeChoice>('repo');
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 520 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          color: 'var(--color-text)',
        }}
      >
        Adicionar item
      </h2>
      <Select
        label="Tipo"
        id="item-type"
        value={type}
        onChange={(e) => setType(e.target.value as ItemTypeChoice)}
        style={{ width: 220 }}
      >
        <option value="repo">Repositório</option>
        <option value="skill">Skill</option>
        <option value="mcp">MCP</option>
      </Select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} />}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- pages/AddPage.test.tsx`
Expected: PASS — `getByLabelText('Tipo')` matches `Select`'s `label="Tipo"`/`id="item-type"` pairing; the rest of the assertions depend on `RepoForm`/`SkillForm`/`McpForm`, restyled in Tasks 21–23.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/AddPage.tsx
git commit -m "feat: restyle AddPage using the Select component"
```

---

### Task 21: Restyle `RepoForm`

**Files:**
- Modify: `apps/web/src/pages/forms/RepoForm.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface RepoFormProps {
  onCreated: (item: Item) => void;
}

export function RepoForm({ onCreated }: RepoFormProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    try {
      const item = await createItem({ type: 'repo', name, url });
      setName('');
      setUrl('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="repo-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="repo-url"
        label="URL do repositório"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar repositório
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- forms/RepoForm.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/forms/RepoForm.tsx
git commit -m "feat: restyle RepoForm using the design system components"
```

---

### Task 22: Restyle `SkillForm`

**Files:**
- Modify: `apps/web/src/pages/forms/SkillForm.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Tabs } from '../../components/ui/forms/Tabs/Tabs.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface SkillFormProps {
  onCreated: (item: Item) => void;
}

type SourceTab = 'local_path' | 'upload' | 'url';

const TABS: { value: SourceTab; label: string }[] = [
  { value: 'local_path', label: 'Caminho local' },
  { value: 'upload', label: 'Upload' },
  { value: 'url', label: 'URL' },
];

export function SkillForm({ onCreated }: SkillFormProps) {
  const [name, setName] = useState('');
  const [tab, setTab] = useState<SourceTab>('local_path');
  const [localPath, setLocalPath] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (tab === 'upload' && !file) {
      setError('Selecione um arquivo para enviar.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      let item: Item;
      if (tab === 'local_path') {
        item = await createItem({ type: 'skill', name, source_type: 'local_path', path: localPath });
      } else if (tab === 'url') {
        item = await createItem({ type: 'skill', name, source_type: 'url', url });
      } else {
        item = await createItem({ type: 'skill', name, source_type: 'upload', file: file! });
      }
      setName('');
      setLocalPath('');
      setUrl('');
      setFile(null);
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="skill-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />

      <Tabs tabs={TABS} value={tab} onChange={(value) => setTab(value as SourceTab)} />

      {tab === 'local_path' && (
        <Input
          id="skill-path"
          label="Caminho local da pasta"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
          required
        />
      )}

      {tab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
          <label htmlFor="skill-file" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Arquivo (SKILL.md ou .zip)
          </label>
          <input id="skill-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      )}

      {tab === 'url' && (
        <Input
          id="skill-url"
          label="URL do repositório da skill"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      )}

      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar skill
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
```

Note: the upload tab keeps a plain native `<input type="file">` (manually labeled to match the other fields' label styling) rather than the reference mockup's fake drag-and-drop box — see Scope boundaries. This also keeps `user.upload(screen.getByLabelText('Arquivo (SKILL.md ou .zip)'), file)` in the existing test working exactly as today.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- forms/SkillForm.test.tsx`
Expected: PASS — including the `getByRole('tab', { name: 'URL' })` / `{ name: 'Upload' }` assertions, which `Tabs` (Task 10) satisfies exactly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/forms/SkillForm.tsx
git commit -m "feat: restyle SkillForm using the design system components"
```

---

### Task 23: Restyle `McpForm`

**Files:**
- Modify: `apps/web/src/pages/forms/McpForm.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Textarea } from '../../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

interface McpFormProps {
  onCreated: (item: Item) => void;
}

export function McpForm({ onCreated }: McpFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [configText, setConfigText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText);
    } catch {
      setError('O config precisa ser um JSON válido.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const item = await createItem({ type: 'mcp', name, config: parsedConfig, description: description || undefined });
      setName('');
      setDescription('');
      setConfigText('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="mcp-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="mcp-description"
        label="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Textarea
        id="mcp-config"
        label="Config JSON (ex: bloco mcpServers)"
        mono
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar MCP
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- forms/McpForm.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/forms/McpForm.tsx
git commit -m "feat: restyle McpForm using the design system components"
```

---

### Task 24: Restyle `CategoryManager`

**Files:**
- Modify: `apps/web/src/components/CategoryManager.tsx`

- [ ] **Step 1: Replace the full contents**

```typescript
import { useState } from 'react';
import { mergeCategory, renameCategory } from '../api/client.js';
import type { Category } from '../types.js';
import { Input } from './ui/forms/Input/Input.js';
import { Select } from './ui/forms/Select/Select.js';
import { Button } from './ui/core/Button/Button.js';
import { StatusMessage } from './ui/feedback/StatusMessage/StatusMessage.js';

interface CategoryManagerProps {
  categories: Category[];
  onChanged: () => void;
}

export function CategoryManager({ categories, onChanged }: CategoryManagerProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [error, setError] = useState('');

  function startRename(category: Category) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function submitRename(id: number) {
    setError('');
    try {
      await renameCategory(id, renameValue);
      setRenamingId(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitMerge() {
    setError('');
    if (!mergeSourceId || !mergeTargetId) return;
    try {
      await mergeCategory(Number(mergeSourceId), Number(mergeTargetId));
      setMergeSourceId('');
      setMergeTargetId('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>Categorias</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map((category) => (
          <div key={category.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {renamingId === category.id ? (
              <>
                <Input
                  label="Novo nome"
                  id={`rename-${category.id}`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={{ width: 200 }}
                />
                <Button size="sm" onClick={() => submitRename(category.id)}>
                  Salvar
                </Button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'var(--color-text)', width: 200 }}>{category.name}</span>
                <Button size="sm" variant="ghost" onClick={() => startRename(category)}>
                  Renomear
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Select
          label="Mesclar categoria"
          id="merge-source"
          value={mergeSourceId}
          onChange={(e) => setMergeSourceId(e.target.value)}
          style={{ width: 170 }}
        >
          <option value="">Selecione a origem</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          label="Em"
          id="merge-target"
          value={mergeTargetId}
          onChange={(e) => setMergeTargetId(e.target.value)}
          style={{ width: 170 }}
        >
          <option value="">Selecione o destino</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={submitMerge}>
          Mesclar
        </Button>
      </div>

      {error && <StatusMessage kind="error">{error}</StatusMessage>}
    </section>
  );
}
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npm run test -w apps/web -- CategoryManager.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run `CatalogPage.test.tsx` again too**, since it renders `CategoryManager` internally and its last test exercises the rename flow through both components together

Run: `npm run test -w apps/web -- pages/CatalogPage.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/CategoryManager.tsx
git commit -m "feat: restyle CategoryManager using the design system components"
```

---

### Task 25: Remove the design system source bundle and verify the full suite

**Files:**
- Delete: `SkillVault Design System/` (directory)
- Delete: `SkillVault Design System.zip`
- Modify: `.gitignore`

- [ ] **Step 1: Delete the source bundle**

```bash
rm -rf "SkillVault Design System"
rm -f "SkillVault Design System.zip"
```

Per the approved design spec, this raw material (loose `.jsx` prototypes, HTML guideline cards, the navigable mockup, the original uploaded logo image) isn't kept once its tokens/assets/components have been extracted into `apps/web` — everything this app needs from it now lives in the real codebase.

- [ ] **Step 2: Remove the now-unnecessary `.gitignore` entry**

Check whether `.superpowers/` is the only thing on its line in `.gitignore` (it was added during this project's brainstorming session for an unrelated visual-companion tool and should stay); there is no `SkillVault Design System` entry to remove — the folder was never tracked by git (confirm with `git status` showing it only ever appeared as an untracked file/directory). No `.gitignore` change is actually needed here; this step is just a verification.

Run: `git status --short`
Expected: no mention of `SkillVault Design System` (deleted, was untracked) or `SkillVault Design System.zip` (deleted, was untracked) — `git status` shows no changes related to them at all, since untracked-then-deleted files produce no diff.

- [ ] **Step 3: Run the full monorepo test suite**

Run: `npm run test`
Expected: PASS — both `apps/server` (71 tests, untouched by this plan) and `apps/web` (previous 44 tests + this plan's new component tests) all green.

- [ ] **Step 4: Type-check the frontend**

Run: `npm run build -w apps/web`
Expected: succeeds (`tsc -b && vite build`) — confirms no TypeScript errors across every file this plan touched, and produces a real production build exercising every import path (including the new `lucide-react`/`@fontsource` dependencies and the `logo-symbol.png`/`favicon-64.png` asset imports).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove design system source bundle after extracting it into apps/web"
```

---

### Task 26: Update project continuity doc

**Files:**
- Modify: `PROJECT_CONTEXT.md`

- [ ] **Step 1: Note the visual identity change in the Frontend section**

In `PROJECT_CONTEXT.md`, find the `### Frontend (\`apps/web\`) — completo (exceto recomendador e PWA)` section and add one line right after its existing bullet list (before the closing of that subsection, still under the same heading):

```markdown
- **Identidade visual**: design system aplicado (tokens de cor/tipografia/espaçamento, Inter + JetBrains Mono via `@fontsource`, ícones via `lucide-react`, biblioteca de componentes em `apps/web/src/components/ui/`) — ver `docs/superpowers/specs/2026-07-19-frontend-design-system-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add PROJECT_CONTEXT.md
git commit -m "docs: note the design system implementation in PROJECT_CONTEXT.md"
```

---

## Spec Coverage Check

- §1 (fundamentos: tokens, fontes, ícones, assets, limpeza da pasta bruta) → Tasks 1, 2, 3, 25.
- §2 (11 componentes, porta quase literal + tipagem, `Icon` via `lucide-react`, `ItemCard` com tipo real) → Tasks 4–15.
- §3 (todas as telas restilizadas, sem mudar rotas/contratos) → Tasks 16–24.
- §4 (testes existentes preservados, novo teste por componente, fora de escopo respeitado) → verified per-task above (zero existing test files modified) + Task 25's full-suite run; see "Scope boundaries" for the explicit exclusions.
