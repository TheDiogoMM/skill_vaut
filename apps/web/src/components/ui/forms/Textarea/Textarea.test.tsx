import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea.js';

describe('Textarea', () => {
  it('associates the label with the textarea via htmlFor/id', () => {
    render(<Textarea label="Config JSON" />);
    expect(screen.getByLabelText('Config JSON')).toBeInTheDocument();
  });

  it('uses the monospace font when mono is set', () => {
    render(<Textarea label="Config JSON" mono />);
    expect(screen.getByLabelText('Config JSON')).toHaveStyle({ fontFamily: 'var(--font-mono)' });
  });

  it('defaults to 6 rows', () => {
    render(<Textarea label="Config JSON" />);
    expect(screen.getByLabelText('Config JSON')).toHaveAttribute('rows', '6');
  });
});
