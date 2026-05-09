import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopNavShell } from '../react/shells/TopNavShell';

vi.mock('../react/shells/ThemeStyle', () => ({
  ThemeStyle: () => null,
}));

describe('TopNavShell', () => {
  it('renders app name + entity nav items + scopes data-theme + has navigation role', () => {
    render(
      <TopNavShell appName="Acme" themeId="t-1" tenantId="tenant-1" entities={['customer', 'order']}>
        <div>child</div>
      </TopNavShell>,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order/i })).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.getByTestId('shell-root').getAttribute('data-theme')).toBe('t-1');
  });

  it('fires onNavigate when a nav button is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <TopNavShell appName="A" themeId="t" tenantId="t1" entities={['order']} onNavigate={onNavigate}>
        <div />
      </TopNavShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /order/i }));
    expect(onNavigate).toHaveBeenCalledWith('order');
  });
});
