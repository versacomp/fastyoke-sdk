import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeStyle } from '../react/shells/ThemeStyle';

const fakeFetch = vi.fn();

beforeEach(() => {
  fakeFetch.mockReset();
  fakeFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tokens_json: { '--color-primary': '#6366f1' } }),
  });
});

describe('ThemeStyle', () => {
  it('injects a style element with CSS variables for the theme', async () => {
    render(<ThemeStyle themeId="theme-abc" tenantId="t1" fetcher={fakeFetch} />);
    await waitFor(() => {
      const el = document.querySelector('style[data-theme-style="theme-abc"]');
      expect(el?.textContent).toContain('--color-primary: #6366f1');
    });
    expect(fakeFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tenant/themes/theme-abc?tenant_id=t1'),
    );
  });

  it('renders nothing while loading and cleans up on unmount', async () => {
    const { unmount } = render(<ThemeStyle themeId="theme-xyz" tenantId="t1" fetcher={fakeFetch} />);
    await waitFor(() => expect(document.querySelector('style[data-theme-style="theme-xyz"]')).toBeTruthy());
    unmount();
    expect(document.querySelector('style[data-theme-style="theme-xyz"]')).toBeFalsy();
  });
});
