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
