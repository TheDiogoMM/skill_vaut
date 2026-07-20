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
