import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusMessage } from './StatusMessage.js';

describe('StatusMessage', () => {
  it('uses role="alert" for error messages', () => {
    render(<StatusMessage kind="error">Erro ao salvar.</StatusMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro ao salvar.');
  });

  it('uses role="status" for success messages', () => {
    render(<StatusMessage kind="success">Salvo!</StatusMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo!');
  });

  it('uses role="status" for info messages (the default)', () => {
    render(<StatusMessage>Nenhum resultado.</StatusMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum resultado.');
  });
});
