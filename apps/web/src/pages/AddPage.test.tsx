import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AddPage } from './AddPage.js';

describe('AddPage', () => {
  it('switches between repo and mcp forms based on the selected type', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('URL do repositório')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo'), 'mcp');
    expect(screen.getByLabelText('Config JSON (ex: bloco mcpServers)')).toBeInTheDocument();
  });

  it('shows the skill form when skill is selected', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    );

    await user.selectOptions(screen.getByLabelText('Tipo'), 'skill');
    expect(screen.getByLabelText('Caminho local da pasta')).toBeInTheDocument();
  });

  it('pre-selects the type and pre-fills the repo form from query params', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=repo&name=Achado&url=https%3A%2F%2Fexample.com%2Fachado.git']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Achado');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/achado.git');
  });

  it('shows the plugin form when type=plugin is in the query params, pre-filled', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=plugin&name=Plugin+Achado&url=https%3A%2F%2Fexample.com%2Fplugin.git']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Plugin Achado');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/plugin.git');
  });

  it('pre-fills only the name for the mcp form (no config can be inferred from search results)', () => {
    render(
      <MemoryRouter initialEntries={['/add?type=mcp&name=MCP+Achado']}>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('MCP Achado');
    expect(screen.getByLabelText('Config JSON (ex: bloco mcpServers)')).toHaveValue('');
  });

  it('falls back to type=repo when no query params are present', () => {
    render(
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('URL do repositório')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });
});
