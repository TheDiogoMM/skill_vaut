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
});
