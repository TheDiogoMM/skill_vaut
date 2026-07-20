import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Ação</Button>);
    expect(screen.getByRole('button', { name: 'Ação' })).toHaveAttribute('type', 'button');
  });

  it('supports type="submit" for form actions', () => {
    render(<Button type="submit">Adicionar repositório</Button>);
    expect(screen.getByRole('button', { name: 'Adicionar repositório' })).toHaveAttribute('type', 'submit');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Salvando</Button>);
    expect(screen.getByRole('button', { name: 'Salvando' })).toBeDisabled();
  });
});
