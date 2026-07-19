import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpForm } from './McpForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('McpForm', () => {
  it('parses the config JSON, submits it, and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 7, type: 'mcp', name: 'Meu MCP' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<McpForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu MCP');
    await user.type(screen.getByLabelText('Config JSON (ex: bloco mcpServers)'), '{{"mcpServers":{{}}');
    await user.click(screen.getByRole('button', { name: 'Adicionar MCP' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'mcp',
        name: 'Meu MCP',
        config: { mcpServers: {} },
        description: undefined,
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error when the config is not valid JSON', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<McpForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu MCP');
    await user.type(screen.getByLabelText('Config JSON (ex: bloco mcpServers)'), '{{invalido');
    await user.click(screen.getByRole('button', { name: 'Adicionar MCP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O config precisa ser um JSON válido.');
    expect(createItemSpy).not.toHaveBeenCalled();
  });
});
