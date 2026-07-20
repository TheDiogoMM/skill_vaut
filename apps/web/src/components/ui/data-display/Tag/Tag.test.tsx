import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tag } from './Tag.js';

describe('Tag', () => {
  it('renders its text content', () => {
    render(<Tag>cli</Tag>);
    expect(screen.getByText('cli')).toBeInTheDocument();
  });

  it('shows a remove button when onRemove is provided and calls it on click', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>cli</Tag>);
    await user.click(screen.getByRole('button', { name: 'Remover tag' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('does not render a remove button when onRemove is not provided', () => {
    render(<Tag>cli</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
