import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoForm } from './RepoForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RepoForm', () => {
  it('submits name and url and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 42, type: 'repo', name: 'Meu Repo' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<RepoForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Repo');
    await user.type(screen.getByLabelText('URL do repositório'), 'https://example.com/x.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar repositório' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'repo',
        name: 'Meu Repo',
        url: 'https://example.com/x.git',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('shows an error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createItem').mockRejectedValue(new Error('url is required for type=repo'));

    render(<RepoForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Meu Repo');
    await user.type(screen.getByLabelText('URL do repositório'), 'x');
    await user.click(screen.getByRole('button', { name: 'Adicionar repositório' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('url is required for type=repo');
  });

  it('pre-fills name and url from initialName/initialUrl props', () => {
    render(<RepoForm onCreated={vi.fn()} initialName="Repo Pronto" initialUrl="https://example.com/pronto.git" />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Repo Pronto');
    expect(screen.getByLabelText('URL do repositório')).toHaveValue('https://example.com/pronto.git');
  });
});
