import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton.js';

describe('IconButton', () => {
  it('exposes the label as the accessible name and responds to clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton name="copy" label="Copiar" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(onClick).toHaveBeenCalled();
  });
});
