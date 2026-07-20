import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input.js';

describe('Input', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<Input label="Nome" />);
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('calls onChange when typed into', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Nome" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Nome'), 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders an error message with role alert', () => {
    render(<Input label="URL" error="URL inválida" />);
    expect(screen.getByRole('alert')).toHaveTextContent('URL inválida');
  });

  it('works with aria-label instead of a visible label', () => {
    render(<Input aria-label="Buscar" />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
  });
});
