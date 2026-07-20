import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select.js';

describe('Select', () => {
  it('associates the label with the select via htmlFor/id', () => {
    render(
      <Select label="Tipo">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  });

  it('calls onChange when an option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select label="Tipo" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    await user.selectOptions(screen.getByLabelText('Tipo'), 'b');
    expect(onChange).toHaveBeenCalled();
  });

  it('works with aria-label instead of a visible label', () => {
    render(
      <Select aria-label="Categoria">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
  });
});
