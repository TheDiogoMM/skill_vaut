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
          <h1 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>
            SkillVault
          </h1>
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
