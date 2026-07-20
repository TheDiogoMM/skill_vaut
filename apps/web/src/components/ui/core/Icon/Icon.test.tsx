import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './Icon.js';

describe('Icon', () => {
  it('renders an svg for a known icon name', () => {
    const { container } = render(<Icon name="copy" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies the given size to width and height', () => {
    const { container } = render(<Icon name="check" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('defaults to size 16', () => {
    const { container } = render(<Icon name="library" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});
