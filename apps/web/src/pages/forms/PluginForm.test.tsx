import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginForm } from './PluginForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginForm', () => {
  it('submits name and url and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 42, type: 'plugin', name: 'Meu Plugin' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<PluginForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Plugin');
    await user.type(screen.getByLabelText('URL do repositório'), 'https://example.com/plugin.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar plugin' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'plugin',
        name: 'Meu Plugin',
        url: 'https://example.com/plugin.git',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createItem').mockRejectedValue(new Error('url is required for type=plugin'));

    render(<PluginForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Plugin');
    await user.type(screen.getByLabelText('URL do repositório'), 'x');
    await user.click(screen.getByRole('button', { name: 'Adicionar plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('url is required for type=plugin');
  });

  it('pre-fills name and url from initialName/initialUrl props', () => {
    render(<PluginForm onCreated={vi.fn()} initialName="Plugin Pronto" initialUrl="https://example.com/pronto.git" />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Plugin Pronto');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/pronto.git');
  });
});
