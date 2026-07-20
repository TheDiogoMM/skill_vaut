import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypeBadge } from './TypeBadge.js';

describe('TypeBadge', () => {
  it('renders the Skill label', () => {
    render(<TypeBadge type="skill" />);
    expect(screen.getByText('Skill')).toBeInTheDocument();
  });

  it('renders the Repo label', () => {
    render(<TypeBadge type="repo" />);
    expect(screen.getByText('Repo')).toBeInTheDocument();
  });

  it('renders the MCP label', () => {
    render(<TypeBadge type="mcp" />);
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });
});
