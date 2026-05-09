import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopBarSideRailShell } from '../react/shells/TopBarSideRailShell';

vi.mock('../react/shells/ThemeStyle', () => ({
  ThemeStyle: () => null,
}));

describe('TopBarSideRailShell', () => {
  it('renders header (top bar) + aside (side rail) + entity buttons + scopes data-theme', () => {
    render(
      <TopBarSideRailShell appName="Acme" themeId="t-1" tenantId="tenant-1" entities={['customer', 'order']}>
        <div>child</div>
      </TopBarSideRailShell>,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order/i })).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.getByTestId('shell-root').getAttribute('data-theme')).toBe('t-1');
  });

  it('fires onNavigate when a nav button is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <TopBarSideRailShell appName="A" themeId="t" tenantId="t1" entities={['order']} onNavigate={onNavigate}>
        <div />
      </TopBarSideRailShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /order/i }));
    expect(onNavigate).toHaveBeenCalledWith('order');
  });
});
