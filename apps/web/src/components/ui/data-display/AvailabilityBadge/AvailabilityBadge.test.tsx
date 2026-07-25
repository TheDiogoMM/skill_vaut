import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvailabilityBadge } from './AvailabilityBadge.js';

describe('AvailabilityBadge', () => {
  it('renders its children with a positive tone', () => {
    render(
      <AvailabilityBadge tone="positive" icon="check-circle-2">
        Instalado
      </AvailabilityBadge>
    );
    expect(screen.getByText('Instalado')).toBeInTheDocument();
  });

  it('renders its children with a neutral tone', () => {
    render(
      <AvailabilityBadge tone="neutral" icon="alert-circle">
        Não instalado
      </AvailabilityBadge>
    );
    expect(screen.getByText('Não instalado')).toBeInTheDocument();
  });
});
