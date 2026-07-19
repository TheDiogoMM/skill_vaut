import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManager } from './CategoryManager.js';
import * as api from '../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const categories = [
  { id: 1, name: 'dev-tools', createdAt: '' },
  { id: 2, name: 'automacao', createdAt: '' },
];

describe('CategoryManager', () => {
  it('renames a category', async () => {
    const user = userEvent.setup();
    const renameSpy = vi
      .spyOn(api, 'renameCategory')
      .mockResolvedValue({ id: 1, name: 'ferramentas', createdAt: '' });
    const onChanged = vi.fn();

    render(<CategoryManager categories={categories} onChanged={onChanged} />);

    await user.click(screen.getAllByRole('button', { name: 'Renomear' })[0]);
    const input = screen.getByLabelText('Novo nome');
    await user.clear(input);
    await user.type(input, 'ferramentas');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith(1, 'ferramentas');
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('merges two categories', async () => {
    const user = userEvent.setup();
    const mergeSpy = vi.spyOn(api, 'mergeCategory').mockResolvedValue(undefined);
    const onChanged = vi.fn();

    render(<CategoryManager categories={categories} onChanged={onChanged} />);

    await user.selectOptions(screen.getByLabelText('Mesclar categoria'), '1');
    await user.selectOptions(screen.getByLabelText('Em'), '2');
    await user.click(screen.getByRole('button', { name: 'Mesclar' }));

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalledWith(1, 2);
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows an error message when the merge fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'mergeCategory').mockRejectedValue(new Error('category not found'));

    render(<CategoryManager categories={categories} onChanged={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Mesclar categoria'), '1');
    await user.selectOptions(screen.getByLabelText('Em'), '2');
    await user.click(screen.getByRole('button', { name: 'Mesclar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('category not found');
  });
});
