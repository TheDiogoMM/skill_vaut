import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './Layout.js';

describe('Layout', () => {
  it('renders navigation links, the routed content, and toggles the theme', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Conteúdo</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adicionar' })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Modo claro' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Modo escuro' })).toBeInTheDocument();
  });
});
