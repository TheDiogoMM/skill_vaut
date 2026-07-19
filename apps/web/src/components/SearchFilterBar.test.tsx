import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilterBar } from './SearchFilterBar.js';

const categories = [{ id: 1, name: 'dev-tools', createdAt: '' }];

describe('SearchFilterBar', () => {
  it('reports filter changes as the user types and selects', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchFilterBar categories={categories} onChange={onChange} />);

    await user.type(screen.getByLabelText('Buscar'), 'ollama');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: '', category: '', tag: '' });

    await user.selectOptions(screen.getByLabelText('Tipo'), 'repo');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '', tag: '' });

    await user.selectOptions(screen.getByLabelText('Categoria'), '1');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '1', tag: '' });

    await user.type(screen.getByLabelText('Tag'), 'dev-tools');
    expect(onChange).toHaveBeenLastCalledWith({ q: 'ollama', type: 'repo', category: '1', tag: 'dev-tools' });
  });
});
