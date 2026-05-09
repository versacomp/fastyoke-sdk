import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LeftNavShell } from '../react/shells/LeftNavShell';

vi.mock('../react/shells/ThemeStyle', () => ({
  ThemeStyle: () => null,
}));

describe('LeftNavShell', () => {
  it('renders app name + entity nav items + scopes data-theme', () => {
    render(
      <LeftNavShell appName="Acme" themeId="t-1" tenantId="tenant-1" entities={['customer', 'order']}>
        <div>child</div>
      </LeftNavShell>,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order/i })).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.getByTestId('shell-root').getAttribute('data-theme')).toBe('t-1');
  });

  it('fires onNavigate when a nav button is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <LeftNavShell appName="A" themeId="t" tenantId="t1" entities={['order']} onNavigate={onNavigate}>
        <div />
      </LeftNavShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /order/i }));
    expect(onNavigate).toHaveBeenCalledWith('order');
  });
});
