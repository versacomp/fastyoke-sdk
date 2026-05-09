/**
 * @vitest-environment jsdom
 *
 * Phase 41.2 — `<SmartField />` resolver tests. Covers the
 * inference matrix, ui_config merge order, mode='display'
 * fast-path, density passthrough, slug-fallback warnings, tier
 * short-circuit, and heavy-editor lazy-fallback.
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SmartField, type SmartFieldProps } from '../react/lcap/SmartField';
import { __resetSmartFieldWarnings } from '../react/lcap/SmartField';
import { __resetHeavyWarnings } from '../react/lcap/components/heavy';
import { resolveSmartField } from '../react/lcap/resolver';
import type { EntityFieldAnnotation } from '../types/entityAnnotation';

function renderSmartField(overrides: Partial<SmartFieldProps>): void {
  const props: SmartFieldProps = {
    annotation: { field_key: 'x' },
    value: '',
    onChange: () => undefined,
    ...overrides,
  };
  render(<SmartField {...props} />);
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetSmartFieldWarnings();
  __resetHeavyWarnings();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('SmartField — default component matrix', () => {
  it('field_type=string → <input type="text">', () => {
    renderSmartField({
      annotation: { field_key: 'name', field_type: 'string' },
      value: 'Alice',
    });
    const el = screen.getByTestId('smartfield-name');
    expect(el.tagName).toBe('INPUT');
    expect(el).toHaveAttribute('type', 'text');
    expect(el).toHaveAttribute('data-component-slug', 'text');
    expect(el).toHaveValue('Alice');
  });

  it('field_type=longtext → <textarea>', () => {
    renderSmartField({
      annotation: { field_key: 'bio', field_type: 'longtext' },
      value: 'a tale',
    });
    const el = screen.getByTestId('smartfield-bio');
    expect(el.tagName).toBe('TEXTAREA');
    expect(el).toHaveAttribute('data-component-slug', 'textarea');
  });

  it('field_type=number → <input type="number"> with bounds', () => {
    renderSmartField({
      annotation: { field_key: 'age', field_type: 'number', min: 0, max: 130 },
      value: 42,
    });
    const el = screen.getByTestId('smartfield-age') as HTMLInputElement;
    expect(el.type).toBe('number');
    expect(el.min).toBe('0');
    expect(el.max).toBe('130');
    expect(el.value).toBe('42');
  });

  it('field_type=boolean → <input type="checkbox"> with checked state', () => {
    renderSmartField({
      annotation: { field_key: 'active', field_type: 'boolean' },
      value: true,
    });
    const el = screen.getByTestId('smartfield-active') as HTMLInputElement;
    expect(el.type).toBe('checkbox');
    expect(el.checked).toBe(true);
  });

  it('field_type=timestamp → <input type="date"> by default', () => {
    renderSmartField({
      annotation: { field_key: 'created_at', field_type: 'timestamp' },
      value: '2026-04-25',
    });
    const el = screen.getByTestId('smartfield-created_at') as HTMLInputElement;
    expect(el.type).toBe('date');
  });

  it('field_type=enum → <select> populated from options_json', () => {
    renderSmartField({
      annotation: {
        field_key: 'status',
        field_type: 'enum',
        options_json: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo' },
        ],
      },
      value: 'a',
    });
    const el = screen.getByTestId('smartfield-status') as HTMLSelectElement;
    expect(el.tagName).toBe('SELECT');
    expect(Array.from(el.options).map((o) => o.value)).toEqual(['', 'a', 'b']);
  });

  it('field_type=file_ref → renders summary span (no host context required)', () => {
    renderSmartField({
      annotation: { field_key: 'avatar', field_type: 'file_ref' },
      value: {
        __type: 'file_ref',
        file_id: 'f-1',
        filename: 'pic.png',
        mime_type: 'image/png',
        size_bytes: 4096,
      },
    });
    const el = screen.getByTestId('smartfield-avatar');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('data-component-slug', 'file_payload');
    expect(el.textContent).toContain('pic.png');
  });

  it('field_type=relationship → disabled <input> showing the id', () => {
    renderSmartField({
      annotation: { field_key: 'customer_id', field_type: 'relationship' },
      value: 'cust-42',
    });
    const el = screen.getByTestId('smartfield-customer_id') as HTMLInputElement;
    expect(el.disabled).toBe(true);
    expect(el.value).toBe('cust-42');
  });
});

describe('SmartField — @ui/component overrides', () => {
  it('boolean + @ui/component=switch → role="switch"', () => {
    renderSmartField({
      annotation: {
        field_key: 'active',
        field_type: 'boolean',
        ui_config_json: { '@ui/component': 'switch' },
      },
      value: true,
    });
    const el = screen.getByTestId('smartfield-active');
    expect(el).toHaveAttribute('role', 'switch');
    expect(el).toHaveAttribute('data-component-slug', 'switch');
  });

  it('number + @ui/component=currency → slug stamped on the input', () => {
    renderSmartField({
      annotation: {
        field_key: 'amount',
        field_type: 'number',
        ui_config_json: { '@ui/component': 'currency', '@ui/currency_code': 'USD' },
      },
      value: 12.5,
    });
    const el = screen.getByTestId('smartfield-amount');
    expect(el).toHaveAttribute('data-component-slug', 'currency');
  });

  it('rejected slug falls back to default + emits one console.warn', () => {
    renderSmartField({
      annotation: {
        field_key: 'name',
        field_type: 'string',
        ui_config_json: { '@ui/component': 'currency' /* invalid for string */ },
      },
      value: '',
    });
    const el = screen.getByTestId('smartfield-name');
    // Falls back to the type's default — `text` slug.
    expect(el).toHaveAttribute('data-component-slug', 'text');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/not valid for field_type 'string'/);
  });
});

describe('SmartField — ui_config merge precedence', () => {
  it('uiConfigOverride wins over annotation.ui_config_json on conflict', () => {
    const annotation: EntityFieldAnnotation = {
      field_key: 'name',
      field_type: 'string',
      ui_config_json: { '@ui/component': 'email', '@ui/foo': 'inner' },
    };
    const resolved = resolveSmartField(annotation, {
      '@ui/component': 'url',
      '@ui/extra': 'outer',
    });
    expect(resolved.componentSlug).toBe('url');
    expect(resolved.uiConfig['@ui/foo']).toBe('inner'); // preserved
    expect(resolved.uiConfig['@ui/extra']).toBe('outer'); // added
  });
});

describe('SmartField — mode=display fast-path', () => {
  it("renders a <span> (no input mounts) and formats per type", () => {
    renderSmartField({
      annotation: { field_key: 'active', field_type: 'boolean' },
      value: true,
      mode: 'display',
    });
    const el = screen.getByTestId('smartfield-active');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('data-display-mode', 'true');
    expect(el.textContent).toBe('Yes');
  });
});

describe('SmartField — density passthrough', () => {
  it('forwards density to the catalog component (file_ref summary)', () => {
    renderSmartField({
      annotation: { field_key: 'avatar', field_type: 'file_ref' },
      value: {
        __type: 'file_ref',
        file_id: 'f-1',
        filename: 'doc.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      },
      density: 'compact',
    });
    // The FileRefAdapter doesn't expose density via DOM today — but
    // the testid + summary should render. Density propagation is
    // structural; this test is a proxy for "no error on prop pass-
    // through" since the heavy-editor branches honor it directly.
    expect(screen.getByTestId('smartfield-avatar')).toBeInTheDocument();
  });
});

describe('SmartField — heavy-editor lazy fallback', () => {
  it('longtext + @ui/component=richtext falls back to <TextArea /> when peer is missing', async () => {
    renderSmartField({
      annotation: {
        field_key: 'bio',
        field_type: 'longtext',
        ui_config_json: { '@ui/component': 'richtext' },
      },
      value: 'first draft',
    });
    // Suspense resolves once the dynamic-import promise rejects and
    // the catch arm returns { default: TextArea }.
    await waitFor(() => {
      expect(screen.getByTestId('smartfield-bio').tagName).toBe('TEXTAREA');
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@fastyoke/lcap-richtext is not installed'),
    );
  });
});

describe('SmartField — Phase 41.6 expression evaluation', () => {
  it('hides the field when @ui/visible_when evaluates false on Team tier', async () => {
    renderSmartField({
      annotation: {
        field_key: 'name',
        field_type: 'string',
        ui_config_json: { '@ui/visible_when': 'value === "show"' },
      },
      value: 'hide-me',
      currentTier: 'team',
    });
    // Initial render: SmartField mounts the input synchronously
    // (visible defaults to true). The async eval runs and
    // returns false → re-render with no input.
    await waitFor(() => {
      expect(screen.queryByTestId('smartfield-name')).toBeNull();
    });
  });

  it('shows an inline error when @ui/validate_when evaluates false', async () => {
    renderSmartField({
      annotation: {
        field_key: 'amount',
        field_type: 'number',
        ui_config_json: { '@ui/validate_when': 'value > 0' },
      },
      value: -1,
      currentTier: 'team',
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('smartfield-amount-error'),
      ).toBeInTheDocument();
    });
  });

  it('45.4: validateError stamps aria-invalid + aria-describedby on the input', async () => {
    renderSmartField({
      annotation: {
        field_key: 'amount',
        field_type: 'number',
        ui_config_json: { '@ui/validate_when': 'value > 0' },
      },
      value: -1,
      currentTier: 'team',
    });
    await waitFor(() => {
      expect(screen.getByTestId('smartfield-amount-error')).toBeInTheDocument();
    });
    // The error span must carry the same id the input points at —
    // otherwise AT can't resolve the description.
    const errorSpan = screen.getByTestId('smartfield-amount-error');
    expect(errorSpan).toHaveAttribute('id', 'amount-error');
    expect(errorSpan).toHaveAttribute('role', 'alert');
    // The catalog input is the first input mounted under the
    // wrapper span; querySelector skips the wrapper itself.
    const input = errorSpan.parentElement?.querySelector('input');
    expect(input).toBeTruthy();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'amount-error');
  });
});

describe('SmartField — tier short-circuit on expressions', () => {
  it('warns when @ui/visible_when set under non-Team tier', () => {
    renderSmartField({
      annotation: {
        field_key: 'name',
        field_type: 'string',
        ui_config_json: { '@ui/visible_when': 'value.length > 0' },
      },
      value: '',
      currentTier: 'pro',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('requires the Team tier'),
    );
    // Field still renders (resolver short-circuits to always-true).
    expect(screen.getByTestId('smartfield-name')).toBeInTheDocument();
  });

  it('does not warn when expression-bearing annotation runs on Team+', () => {
    renderSmartField({
      annotation: {
        field_key: 'name',
        field_type: 'string',
        ui_config_json: { '@ui/visible_when': 'value.length > 0' },
      },
      value: '',
      currentTier: 'team',
    });
    // No tier-related warn (slug is also valid; no slug warn).
    const tierCalls = warnSpy.mock.calls.filter((c: unknown[]) =>
      String(c[0] ?? '').includes('requires the Team tier'),
    );
    expect(tierCalls).toHaveLength(0);
  });
});
