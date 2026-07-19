import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';

export function Layout() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <nav className="layout__nav">
        <h1>SkillVault</h1>
        <NavLink to="/" end>
          Catálogo
        </NavLink>
        <NavLink to="/add">Adicionar</NavLink>
        <button type="button" onClick={toggleTheme}>
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
      </nav>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
